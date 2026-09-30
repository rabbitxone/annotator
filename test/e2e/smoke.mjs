// End-to-end smoke test: loads dist/chrome into Chromium via Playwright and
// walks the main flows. Screenshots land in test/e2e/output/ for a visual check.
//
//   npm run test:e2e
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'test/e2e/output');
const extPath = join(root, 'dist/chrome-e2e');
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright')));
}

const pages = {
  '/app.html': await readFile(join(root, 'test/e2e/app.html')),
  '/chat.html': await readFile(join(root, 'test/e2e/chat.html')),
  '/dark.html': await readFile(join(root, 'test/e2e/dark.html')),
};
const fixture = await readFile(join(root, 'test/e2e/fixture.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(pages[req.url.split('?')[0]] ?? fixture);
}).listen(0);
const port = server.address().port;
const ARTICLE = `http://localhost:${port}/article.html`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const userDataDir = join(tmpdir(), `annotator-e2e-${Date.now()}`);

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  locale: 'pl-PL',
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--lang=pl'],
  viewport: { width: 1200, height: 800 },
});

const steps = [];
async function step(name, fn) {
  try {
    await fn();
    steps.push(`ok   ${name}`);
    console.log(`ok   ${name}`);
  } catch (err) {
    steps.push(`FAIL ${name}`);
    console.error(`FAIL ${name}\n`, err);
    process.exitCode = 1;
  }
}

const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extId = new URL(worker.url()).host;
const storage = () => worker.evaluate(() => chrome.storage.local.get(null));
const pageRecord = async () => (await storage())[`page:${ARTICLE}`];
const waitFor = async (fn, timeout = 5000) => {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
};

// Seed 1.x data (raw URL with tracking params + fragment, HTML note), after
// the install-time migration has run so it doesn't race with the seed.
await waitFor(async () => (await storage()).schemaVersion === 2);
await worker.evaluate((url) => {
  return chrome.storage.local.remove('schemaVersion').then(() =>
    chrome.storage.local.set({
      annotations: {
        [url + '?utm_source=mail#top']: [
          {
            id: 'legacy-1',
            text: 'jumps over the lazy dog',
            note: 'Old note<div>second line</div>',
            color: '__annotator-highlight-blue',
            timestamp: Date.now() - 3 * 86400000,
            lastEdited: Date.now() - 86400000,
            url: url,
            pageTitle: 'The Fox Article',
            contextBefore: 'The quick brown fox ',
            contextAfter: '. This sentence',
          },
        ],
      },
    }),
  );
}, ARTICLE);

const page = await context.newPage();

// Without the `tabs` permission tab URLs are hidden from the worker, so
// remember the article's tab id while it's the active one.
let articleTabId = null;

await step('migrates 1.x data on first read', async () => {
  await page.goto(ARTICLE);
  articleTabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  const record = await waitFor(pageRecord);
  const all = await storage();
  assert.equal(all.schemaVersion, 2);
  assert.equal(all.annotations, undefined);
  assert.ok(all.legacyBackup);
  assert.equal(record.annotations[0].note, 'Old note\nsecond line');
  assert.equal(record.annotations[0].color, 'blue');
});

await step('re-anchors the migrated annotation', async () => {
  await page.reload();
  await page.waitForSelector('annotator-mark[data-annotation-id="legacy-1"]');
  assert.equal(await page.textContent('annotator-mark[data-annotation-id="legacy-1"]'), 'jumps over the lazy dog');
});

async function select(startSel, startText, endSel, endText) {
  await page.evaluate(
    ([startSel, startText, endSel, endText]) => {
      const find = (sel, text) => {
        const walker = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const i = n.data.indexOf(text);
          if (i !== -1) return [n, i];
        }
        throw new Error('text not found: ' + text);
      };
      const [sn, si] = find(startSel, startText);
      const [en, ei] = find(endSel, endText);
      const range = document.createRange();
      range.setStart(sn, si);
      range.setEnd(en, ei + endText.length);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    },
    [startSel, startText, endSel, endText],
  );
}

async function contextMenuCreate() {
  await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'create-from-selection' }), articleTabId);
}

await step('creates a highlight across element boundaries with a note', async () => {
  // "found that <b>foxes are remarkably</b>" spans a text node and a <b>.
  await select('#p2', 'found that', '#p2 b', 'foxes are remarkably');
  await contextMenuCreate();
  await page.waitForSelector('annotator-mark:not([data-annotation-id="legacy-1"])');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, '01-popover.png'), clip: { x: 200, y: 0, width: 800, height: 420 } });
  await page.keyboard.type('Cross-element note');
  await page.keyboard.press('Control+Enter');
  const record = await waitFor(async () => {
    const r = await pageRecord();
    return r?.annotations.find((a) => a.note === 'Cross-element note') && r;
  });
  const created = record.annotations.find((a) => a.note === 'Cross-element note');
  assert.equal(created.quote.exact, 'found that foxes are remarkably');
  const marks = await page.$$(`annotator-mark[data-annotation-id="${created.id}"]`);
  assert.equal(marks.length, 2, 'one mark per text node');
});

await step('picks the right repeated occurrence and survives reload', async () => {
  await select('#p3', 'the answer is 42. And', '#p3', 'the answer is 42');
  // Select the *second* "the answer is 42".
  await page.evaluate(() => {
    const p = document.querySelector('#p3').firstChild;
    const i = p.data.lastIndexOf('the answer is 42');
    const r = document.createRange();
    r.setStart(p, i);
    r.setEnd(p, i + 'the answer is 42'.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await contextMenuCreate();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('annotator-mark');
  await page.waitForTimeout(300);
  const offset = await page.evaluate(() => {
    const record = [...document.querySelectorAll('#p3 annotator-mark')];
    const p3 = document.querySelector('#p3');
    const range = document.createRange();
    range.setStart(p3, 0);
    range.setEndBefore(record[0]);
    return range.toString().length;
  });
  assert.equal(offset, 'Repeat: the answer is 42. Repeat again: '.length);
  const count = await page.$$eval('annotator-mark', (m) => new Set(m.map((x) => x.dataset.annotationId)).size);
  assert.equal(count, 3);
});

const handle = (p = page) => p.locator('annotator-ui .handle');
const bar = (p = page) => p.locator('annotator-ui .toolbar');
const setSettings = (settings) => worker.evaluate((v) => chrome.storage.local.set({ settings: v }), settings);

async function selectWord(p, selector, word) {
  await p.evaluate(
    ([selector, word]) => {
      // The first text node under `selector` that holds the word (earlier
      // highlights split paragraphs into several text nodes).
      const walker = document.createTreeWalker(document.querySelector(selector), NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.data.includes(word)) node = walker.nextNode();
      const i = node.data.indexOf(word);
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + word.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    },
    [selector, word],
  );
  // Selecting by script fires no mouse events; the handle listens for mouseup
  // (dispatched here rather than via a real click, which would clear the selection).
  await p.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
}

await step('a small handle appears at the end of the selection and opens the bar', async () => {
  await page.bringToFront();
  await selectWord(page, '#p1', 'This sentence contains');
  await handle().waitFor({ state: 'visible' });
  await page.waitForTimeout(250);

  const end = await page.evaluate(() => {
    const range = getSelection().getRangeAt(0);
    const part = document.createRange();
    part.selectNodeContents(range.endContainer);
    part.setEnd(range.endContainer, range.endOffset);
    const rects = [...part.getClientRects()];
    const r = rects[rects.length - 1];
    return { right: r.right, bottom: r.bottom };
  });
  const box = await handle().boundingBox();
  assert.ok(Math.abs(box.x - (end.right - 4)) <= 3, `handle x ${box.x} vs selection end ${end.right}`);
  assert.ok(box.y >= end.bottom && box.y - end.bottom <= 8, `handle y ${box.y} vs selection bottom ${end.bottom}`);
  assert.ok(box.width <= 32 && box.height <= 28, 'handle stays small');
  await page.screenshot({ path: join(out, '02-handle.png'), clip: { x: 200, y: 90, width: 800, height: 120 } });

  await handle().click();
  await bar().waitFor({ state: 'visible' });
  await handle().waitFor({ state: 'detached', timeout: 2000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, '02b-bar.png'), clip: { x: 200, y: 90, width: 800, height: 120 } });

  // Picking a colour highlights and closes the bar.
  await page.locator('annotator-ui .toolbar .swatch-btn[data-color="green"]').click();
  await bar().waitFor({ state: 'detached', timeout: 2000 });
  const record = await waitFor(async () => (await pageRecord())?.annotations.find((a) => a.color === 'green'));
  assert.equal(record.quote.exact, 'This sentence contains');
});

await step('the handle stays away from buttons, navigation and form controls', async () => {
  await page.mouse.click(50, 50);
  await selectWord(page, '#btn', 'Button label');
  await page.waitForTimeout(300);
  assert.equal(await handle().count(), 0, 'button text');
  await selectWord(page, '#nav a', 'Navigation link');
  await page.waitForTimeout(300);
  assert.equal(await handle().count(), 0, 'navigation');
  await selectWord(page, '#p4', 'Zażółć');
  await handle().waitFor({ state: 'visible' });
  await page.mouse.click(50, 50);
});

await step('the handle is suppressed on app-like pages without a list of sites', async () => {
  const app = await context.newPage();
  await app.goto(`http://localhost:${port}/app.html`);
  await app.waitForTimeout(500);
  await selectWord(app, '#text', 'readable text below');
  await app.waitForTimeout(400);
  assert.equal(await handle(app).count(), 0, 'canvas-heavy page');

  // …but a per-site rule wins over the guess.
  await setSettings({ siteRules: { localhost: 'always' } });
  await app.waitForTimeout(200);
  await selectWord(app, '#text', 'readable text below');
  await handle(app).waitFor({ state: 'visible' });
  await setSettings({ siteRules: {} });
  await app.close();
});

await step('chat-style apps (inner scroller, no canvas) are also treated as apps', async () => {
  const chat = await context.newPage();
  await chat.goto(`http://localhost:${port}/chat.html`);
  await chat.waitForTimeout(500);
  await selectWord(chat, '#text', 'assistant reply');
  await chat.waitForTimeout(400);
  assert.equal(await handle(chat).count(), 0, 'inner-scroller page');
  await chat.close();
});

await step('a per-site "never" rule hides the handle on an ordinary page', async () => {
  await page.bringToFront();
  await setSettings({ siteRules: { localhost: 'never' } });
  await page.waitForTimeout(200);
  await selectWord(page, '#p4', 'Zażółć');
  await page.waitForTimeout(300);
  assert.equal(await handle().count(), 0);
  await setSettings({ siteRules: {} });
  await page.waitForTimeout(200);
  await selectWord(page, '#p4', 'Zażółć');
  await handle().waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await handle().waitFor({ state: 'detached', timeout: 2000 });
});

await step('the note popover rings its highlight in the highlight colour', async () => {
  await page.bringToFront();
  await page.click('annotator-mark[data-annotation-id="legacy-1"]');
  await page.locator('annotator-ui .popover').waitFor({ state: 'visible' });
  const ring = () =>
    page.$eval('annotator-mark[data-annotation-id="legacy-1"]', (el) => getComputedStyle(el).boxShadow);
  // The ring fades in (box-shadow transition), so wait for it rather than sample once.
  await waitFor(async () => (await ring()).includes('rgba(59, 130, 246'));
  await page.locator('annotator-ui .popover .swatches [data-color="purple"]').click();
  await waitFor(async () => (await ring()).includes('rgba(168, 85, 247'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, '01b-popover-purple.png'), clip: { x: 200, y: 60, width: 800, height: 330 } });
  await page.locator('annotator-ui .popover .swatches [data-color="blue"]').click();
  await page.waitForTimeout(300);
});

await step('closing the popover animates out with a blur', async () => {
  const state = await page.evaluate(() => {
    const root = document.querySelector('annotator-ui').shadowRoot;
    const popover = root.querySelector('.popover');
    root.querySelectorAll('.head-actions .icon-btn')[1].click(); // the close button
    return {
      closing: popover.hasAttribute('data-closing'),
      animation: getComputedStyle(popover).animationName,
      opening: false,
    };
  });
  assert.equal(state.closing, true);
  assert.equal(state.animation, 'frame-out');
  await page.locator('annotator-ui .popover').waitFor({ state: 'detached', timeout: 2000 });
});

await step('deleting asks in a small dialog inside the popover', async () => {
  const popover = page.locator('annotator-ui .popover');
  const confirm = page.locator('annotator-ui .popover .confirm');
  await page.click('annotator-mark[data-annotation-id="legacy-1"]');
  await popover.waitFor({ state: 'visible' });

  // Cancelling (button or Esc) keeps both the dialog-less popover and the note.
  await page.locator('annotator-ui .popover .icon-btn.danger').click();
  await confirm.waitFor({ state: 'visible' });
  await page.waitForTimeout(350); // let the dialog's enter animation settle
  await page.screenshot({ path: join(out, '01c-popover-confirm.png'), clip: { x: 200, y: 60, width: 800, height: 330 } });
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'detached', timeout: 2000 });
  await popover.waitFor({ state: 'visible' });
  await page.locator('annotator-ui .popover .icon-btn.danger').click();
  await confirm.waitFor({ state: 'visible' });
  await page.locator('annotator-ui .popover .confirm .btn-outline').click();
  await confirm.waitFor({ state: 'detached', timeout: 2000 });
  assert.ok((await pageRecord()).annotations.some((a) => a.id === 'legacy-1'), 'still there after cancel');
  await page.mouse.click(50, 50);
  await popover.waitFor({ state: 'detached', timeout: 2000 });

  // Confirming removes the note. Use a throwaway highlight so counts elsewhere hold.
  await selectWord(page, '#p4', 'gęślą jaźń');
  await handle().waitFor({ state: 'visible' });
  await handle().click();
  await page.locator('annotator-ui .toolbar .swatch-btn[data-color="red"]').click();
  const temp = await waitFor(async () => (await pageRecord())?.annotations.find((a) => a.quote.exact === 'gęślą jaźń'));
  await page.click(`annotator-mark[data-annotation-id="${temp.id}"]`);
  await popover.waitFor({ state: 'visible' });
  await page.locator('annotator-ui .popover .icon-btn.danger').click();
  await confirm.waitFor({ state: 'visible' });
  await page.locator('annotator-ui .popover .confirm .btn-danger').click();
  await waitFor(async () => !(await pageRecord()).annotations.some((a) => a.id === temp.id));
  await waitFor(async () => (await page.$$(`annotator-mark[data-annotation-id="${temp.id}"]`)).length === 0);
  await popover.waitFor({ state: 'detached', timeout: 2000 });
});

await step('highlights adapt to dark and light backgrounds', async () => {
  const dark = await context.newPage();
  await dark.goto(`http://localhost:${port}/dark.html`);
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  await dark.waitForTimeout(400);

  await selectWord(dark, '#dark-text', 'glowing highlight');
  await handle(dark).waitFor({ state: 'visible' });
  await dark.waitForTimeout(250);
  await dark.screenshot({ path: join(out, '02c-handle-dark-page.png'), clip: { x: 0, y: 0, width: 800, height: 220 } });

  const create = async (selector, text) => {
    await selectWord(dark, selector, text);
    await worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'create-from-selection' }), tabId);
    await dark.keyboard.press('Escape');
  };
  await create('#dark-text', 'glowing highlight');
  await create('#card-text', 'light card on that same page');

  const look = (selector) =>
    dark.$eval(`${selector} annotator-mark`, (m) => ({ tone: m.dataset.tone, bg: getComputedStyle(m).backgroundColor }));
  await dark.waitForTimeout(400); // background-color transitions for 200ms
  assert.deepEqual(await look('#dark-text'), { tone: 'dark', bg: 'rgba(234, 179, 8, 0.58)' });
  assert.deepEqual(await look('#card-text'), { tone: 'light', bg: 'rgba(250, 204, 21, 0.42)' });
  await dark.waitForTimeout(300);
  await dark.screenshot({ path: join(out, '07b-dark-page.png'), clip: { x: 0, y: 0, width: 800, height: 220 } });

  // The site flips its own theme: highlights follow.
  await dark.evaluate(() => Object.assign(document.body.style, { background: '#ffffff', color: '#111111' }));
  await waitFor(async () => (await look('#dark-text')).tone === 'light', 3000);
  await dark.evaluate(() => Object.assign(document.body.style, { background: '#0f172a', color: '#e2e8f0' }));
  await waitFor(async () => (await look('#dark-text')).tone === 'dark', 3000);

  // Keep this page's notes out of the dashboard assertions further down.
  await worker.evaluate((key) => chrome.storage.local.remove(key), `page:http://localhost:${port}/dark.html`);
  await dark.close();
});

await step('does not render quote HTML', async () => {
  await worker.evaluate(async (url) => {
    const key = 'page:' + url;
    const { [key]: rec } = await chrome.storage.local.get(key);
    rec.annotations[0].note = '<img src=x onerror="document.title=\'pwned\'"><b>bold?</b>';
    await chrome.storage.local.set({ [key]: rec });
  }, ARTICLE);
});

async function openPopup(url = ARTICLE) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 580 });
  const tabId = articleTabId;
  // Pretend the article is the active tab, as it would be for a real popup.
  await popup.addInitScript(
    ([tabId, url]) => {
      chrome.tabs.query = async () => [{ id: tabId, url }];
    },
    [tabId, url],
  );
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector('#view > *');
  return popup;
}

await step('popup lists this page’s notes', async () => {
  const popup = await openPopup();
  assert.equal(await popup.$$eval('.card', (c) => c.length), 4);
  assert.equal(await popup.title(), 'Annotator');
  const notes = await popup.$$eval('.card-note', (n) => n.map((x) => x.textContent));
  assert.ok(notes.some((n) => n.includes('<img')), 'note shown as text');
  assert.equal(await popup.$$eval('.card-note img', (n) => n.length), 0);
  await popup.screenshot({ path: join(out, '03-popup-light.png') });
  await popup.click('[data-tab="settings"]');
  await popup.screenshot({ path: join(out, '04-popup-settings.png') });
  // Per-site override of the selection handle for the page the popup was opened on.
  assert.ok((await popup.textContent('#view')).includes('localhost'));
  const siteSwitch = '.setting-item:nth-child(2) input';
  await popup.click(siteSwitch);
  await waitFor(async () => (await storage()).settings?.siteRules?.localhost === 'never');
  await popup.click(siteSwitch);
  await waitFor(async () => !(await storage()).settings?.siteRules?.localhost);
  await popup.close();
});

await step('popup shows no bare badge on a page without notes', async () => {
  const popup = await openPopup(`http://localhost:${port}/no-notes-here.html`);
  assert.equal(await popup.textContent('#page-count'), '');
  assert.equal(await popup.$eval('#page-count', (el) => getComputedStyle(el).display), 'none');
  await popup.screenshot({ path: join(out, '05-popup-empty.png') });
  await popup.close();

  // …and with notes the badge shows its number.
  const withNotes = await openPopup();
  assert.equal(await withNotes.textContent('#page-count'), '4');
  assert.notEqual(await withNotes.$eval('#page-count', (el) => getComputedStyle(el).display), 'none');
  await withNotes.close();
});

await step('opening a note from the dashboard scrolls to it in a new tab', async () => {
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extId}/dashboard.html`);
  await dash.waitForSelector('.card');
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    dash.click('.card:last-of-type .card-actions .icon-btn >> nth=0'),
  ]);
  await opened.waitForSelector('annotator-mark[data-annotator-flash]', { timeout: 10000 });
  await opened.close();
  await dash.close();
});

await step('follows single-page-app navigations', async () => {
  await page.bringToFront();
  await page.evaluate(() => history.pushState({}, '', '/other.html'));
  await waitFor(async () => (await page.$$('annotator-mark')).length === 0, 4000);
  await page.evaluate(() => history.pushState({}, '', '/article.html'));
  await waitFor(async () => (await page.$$('annotator-mark')).length > 0, 4000);
});

await step('dashboard renders and bulk delete syncs to the open tab', async () => {
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extId}/dashboard.html`);
  await dash.waitForSelector('.card');
  await dash.screenshot({ path: join(out, '06-dashboard.png') });
  await dash.click('a[href="#pages"]');
  await dash.waitForSelector('.page-row');
  await dash.screenshot({ path: join(out, '07-dashboard-pages.png') });
  await dash.click('.page-row');
  await dash.waitForSelector('.card');
  await dash.screenshot({ path: join(out, '08-dashboard-page.png') });
  await dash.click('a[href="#settings"]');
  await dash.screenshot({ path: join(out, '09-dashboard-settings.png') });

  await dash.click('a[href="#all"]');
  await dash.waitForSelector('.card');
  const checks = await dash.$$('.card-check');
  assert.equal(await dash.$eval('#bulk-bar', (el) => getComputedStyle(el).visibility), 'hidden', 'bulk bar hidden without a selection');
  await checks[0].check();
  await checks[1].check();
  await dash.waitForTimeout(400);
  await dash.screenshot({ path: join(out, '10-dashboard-bulk.png') });
  await dash.click('#bulk-delete');
  await dash.click('dialog .btn-danger');
  await waitFor(async () => (await pageRecord())?.annotations.length === 2);
  await page.bringToFront();
  await waitFor(async () => (await page.$$eval('annotator-mark', (m) => new Set(m.map((x) => x.dataset.annotationId)).size)) === 2);
  assert.notEqual(await page.title(), 'pwned');
  await dash.close();
});

await step('underline style setting applies live', async () => {
  await worker.evaluate(() => chrome.storage.local.set({ settings: { highlightStyle: 'underline' } }));
  await page.waitForTimeout(300);
  const decoration = await page.$eval('annotator-mark', (m) => getComputedStyle(m).textDecorationLine);
  assert.equal(decoration, 'underline');
});

await context.close();
server.close();
await rm(userDataDir, { recursive: true, force: true });
console.log(`\n${steps.filter((s) => s.startsWith('ok')).length}/${steps.length} steps passed; screenshots in test/e2e/output/`);
