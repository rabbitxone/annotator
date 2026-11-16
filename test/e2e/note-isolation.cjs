const { chromium } = require('playwright');
const http = require('http');
const dist = require('path').resolve(__dirname, '../../dist/chrome');
const html = `<!doctype html><html><body><article><p id="p">The quick brown fox jumps over the lazy dog, again and again for a long while.</p></article>
<script>
window.__leak = [];
for (const type of ['keydown','keypress','keyup','beforeinput','input','paste','compositionend'])
  addEventListener(type, e => window.__leak.push(type + ':' + (e.key ?? e.data ?? '')), true);
</script></body></html>`;
(async () => {
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0);
  const url = `http://localhost:${server.address().port}/`;
  const ctx = await chromium.launchPersistentContext('', {
    headless: false, executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
    args: ['--headless=new', `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-sandbox'],
  });
  const page = await ctx.newPage();
  page.on('console', m => console.log('console:', m.text())); ctx.on('console', m => console.log('ctx:', m.text()));
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url);
  await page.waitForTimeout(1500);

  await page.evaluate(() => { const t = document.getElementById('p').firstChild; const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 15); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.mouse.move(5, 5); await page.mouse.down(); await page.mouse.up(); // noop
  await page.evaluate(() => { const t = document.getElementById('p').firstChild; const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 15); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
  await page.waitForTimeout(600);
  console.log('sel before', JSON.stringify(await page.evaluate(() => getSelection().toString())));

  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const res = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://localhost/*' });
    return chrome.tabs.sendMessage(tabs[0].id, { type: 'create-from-selection', withNote: true });
  });
  console.log('storage', await sw.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)).slice(0, 400)));
  console.log('create result', res, 'sel after', JSON.stringify(await page.evaluate(() => getSelection().toString())));
  await page.waitForTimeout(1200);
  const frames = page.frames().map(f => f.url().replace(/#.*/, ''));
  console.log('frames', frames);
  await page.waitForTimeout(500); const ef = page.frames().find(f => f.url().includes('editor.html'));
  if (!ef) { console.log('NO EDITOR FRAME'); await ctx.close(); server.close(); return; }
  await page.waitForTimeout(500);
  await page.keyboard.type('secret note 123', { delay: 20 });
  await page.waitForTimeout(500);

  const typed = await ef.evaluate(() => document.querySelector('.note-editor').textContent);
  const leak = await page.evaluate(() => window.__leak);
  const height = await page.evaluate(() => 0);
  console.log('editor text:', JSON.stringify(typed));
  console.log('page-leaked events:', JSON.stringify(leak));
  if (leak.length || typed !== 'secret note 123') { console.error('FAIL'); process.exitCode = 1; } else console.log('OK');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);
  const sw2 = await sw.evaluate(async () => { const all = await chrome.storage.local.get(null); return JSON.stringify(all).slice(0, 600); });
  console.log('stored:', sw2);
  await ctx.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
