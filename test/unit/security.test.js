import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidCategoryId } from '../../src/shared/categories.js';
import { csvCell, hasFormulaText, IMPORT_LIMITS, mergePage, parseBackup, toCsv, toMarkdown } from '../../src/shared/exchange.js';
import { parseInline } from '../../src/shared/markdown.js';
import { isRemoteFileUrl, normalizeUrl, toAddress } from '../../src/shared/url.js';

const backup = (pages, extra = {}) => JSON.stringify({ format: 'annotator-backup', version: 1, pages, ...extra });
const page = (annotations, url = 'https://a.com/') => ({ url, title: 't', annotations });
const ann = (id, extra = {}) => ({ id, quote: { exact: 'x' }, ...extra });
const timed = (fn) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

test('import ignores prototype keys', () => {
  const text = '{"format":"annotator-backup","pages":[],"__proto__":{"polluted":1},"settings":{"siteRules":{"__proto__":"never","constructor":"always"}}}';
  const { settings } = parseBackup(text);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(settings.siteRules, '__proto__'), true);
  assert.equal({}.never, undefined);
});

test('import rejects unsafe or remote page URLs', () => {
  const urls = ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'chrome://settings', 'about:blank', 'moz-extension://x/', 'blob:https://a/b', 'file://evil.example.com/share/a.html'];
  assert.equal(parseBackup(backup(urls.map((u) => page([ann('1')], u)))).pages.length, 0);
  assert.equal(parseBackup(backup([page([ann('1')], 'file:///home/a.html')])).pages.length, 1);
  assert.equal(isRemoteFileUrl('file://evil.example.com/a'), true);
  assert.equal(isRemoteFileUrl('file://localhost/a'), false);
  assert.equal(toAddress('\\\\srv\\share\\a'), '');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
});

test('import sanitizes ids, positions and timestamps', () => {
  const now = 1_700_000_000_000;
  const { pages } = parseBackup(
    backup([
      page([
        ann({}),
        ann([]),
        ann('x'.repeat(IMPORT_LIMITS.id + 1)),
        ann('nan', { position: { start: NaN, end: 5 } }),
        ann('rev', { position: { start: 9, end: 2 } }),
        ann('neg', { position: { start: -1, end: 2 } }),
        ann('future', { createdAt: 8e15, updatedAt: 8e15 }),
        ann('negtime', { createdAt: -5 }),
      ]),
    ]),
    now,
  );
  const byId = Object.fromEntries(pages[0].annotations.map((a) => [a.id, a]));
  assert.deepEqual(Object.keys(byId).sort(), ['future', 'negtime', 'neg', 'nan', 'rev'].sort());
  for (const id of ['nan', 'rev', 'neg']) assert.equal(byId[id].position, undefined);
  assert.ok(byId.future.updatedAt <= now + 24 * 3600 * 1000);
  assert.equal(byId.negtime.createdAt, now);
});

test('import enforces size limits', () => {
  assert.throws(() => parseBackup('x'.repeat(IMPORT_LIMITS.bytes + 1)), { code: 'too-large' });
  const long = 'y'.repeat(IMPORT_LIMITS.note + 10);
  const { pages } = parseBackup(backup([{ ...page([ann('1', { note: long })]), note: long, title: long }]));
  assert.equal(pages[0].annotations[0].note.length, IMPORT_LIMITS.note);
  assert.equal(pages[0].note.length, IMPORT_LIMITS.note);
  assert.equal(pages[0].title.length, IMPORT_LIMITS.title);
});

test('merging many duplicate annotations stays fast', () => {
  const list = Array.from({ length: 20000 }, (_, i) => ({ id: `a${i}`, color: 'yellow', note: '', quote: { exact: 'x', prefix: '', suffix: '' }, createdAt: 1, updatedAt: 1 }));
  const existing = { url: 'https://a.com/', title: '', updatedAt: 1, annotations: list };
  const ms = timed(() => mergePage(existing, { url: existing.url, annotations: list, updatedAt: 1 }));
  assert.ok(ms < 1500, `merge took ${ms}ms`);
});

test('markdown parser has no quadratic blowup', () => {
  for (const input of ['[a](b'.repeat(20000), '['.repeat(50000), '**a'.repeat(40000), 'http://.'.repeat(20000)]) {
    const ms = timed(() => parseInline(input));
    assert.ok(ms < 1000, `took ${ms}ms for ${input.slice(0, 8)}`);
  }
});

test('markdown links accept only safe schemes', () => {
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', '//evil.com']) {
    assert.deepEqual(parseInline(`[x](${href})`).filter((t) => t.type === 'link'), [], href);
  }
  assert.equal(parseInline('[x](https://a.com)')[0].type, 'link');
});

test('category ids reject prototype names', () => {
  for (const id of ['__proto__', 'constructor', 'prototype']) assert.equal(isValidCategoryId(id), false, id);
  assert.equal(isValidCategoryId('green'), true);
});

test('csv neutralises formulas including padded and full-width signs', () => {
  for (const v of [' =1+1', ' =1+1', '＝1+1', '\t=1', '\r\n=1', '@SUM(A1)', '=HYPERLINK("http://x","y")', "+1+cmd|' /C calc'!A0"]) {
    assert.ok(csvCell(v).replace(/^"/, '').startsWith("'"), JSON.stringify(v));
  }
  assert.equal(csvCell('-5'), '-5');
  assert.equal(csvCell('a;b', ';'), '"a;b"');
  assert.equal(csvCell('"'), '""""');
  const groups = [{ page: { url: 'https://a.com/', title: 't' }, annotations: [{ id: '1', color: 'yellow', quote: { exact: '＝1' }, note: '', createdAt: 1 }] }];
  assert.equal(hasFormulaText(groups), true);
  assert.ok(toCsv(groups).includes("'＝1"));
});

test('markdown export neutralises raw html and unsafe links in notes', () => {
  const note = '<img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://a.com)';
  const groups = [{ page: { url: 'https://a.com/', title: 't' }, annotations: [{ id: '1', color: 'yellow', quote: { exact: 'q' }, note, createdAt: 1 }] }];
  const md = toMarkdown(groups);
  assert.ok(!/(?<!\\)<img/.test(md));
  assert.ok(!/(?<!\\)\]\(javascript:/.test(md));
  assert.ok(md.includes('[ok](https://a.com)'));
});

test('markdown export legend counts are numbers for reserved category ids', () => {
  const groups = [{ page: { url: 'https://a.com/', title: 't' }, annotations: [{ id: '1', color: 'constructor', quote: { exact: 'q' }, createdAt: 1 }] }];
  const md = toMarkdown(groups, { title: 'T' });
  assert.ok(!md.includes('function'));
});
