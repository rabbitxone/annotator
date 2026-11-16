import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findQuote } from '../../src/content/anchoring-core.js';
import { sanitizeStoredCategories } from '../../src/shared/categories.js';
import { htmlToText, migrateLegacy } from '../../src/shared/migrate.js';
import { isUnder, relocateUrl, siteKey, unwrapReaderUrl, normalizeUrl } from '../../src/shared/url.js';

const timed = (fn) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

test('stored categories drop reserved ids and unsafe colours', () => {
  const list = sanitizeStoredCategories([
    { id: '__proto__', name: 'a' },
    { id: 'constructor', name: 'b' },
    { id: 'prototype', name: 'c' },
    { id: 'good', name: 'ok', swatch: 'red;background:url(x)' },
    { id: 'good2', name: 'ok', swatch: '#fff;}' },
    { id: 'good3', name: 'ok', swatch: 'expression(alert(1))' },
  ]);
  const ids = (list ?? []).map((c) => c.id);
  for (const id of ['__proto__', 'constructor', 'prototype']) assert.ok(!ids.includes(id), id);
  for (const c of list ?? []) assert.ok(c.swatch === undefined || /^#[0-9A-F]{6}$/.test(c.swatch), String(c.swatch));
});

test('category names are clipped', () => {
  const [c] = sanitizeStoredCategories([{ id: 'long', name: 'x'.repeat(500) }]) ?? [];
  assert.ok(!c || c.name.length <= 60);
});

test('reader URLs cannot smuggle unsafe schemes', () => {
  assert.equal(normalizeUrl(unwrapReaderUrl('about:reader?url=javascript:alert(1)')), null);
  assert.equal(normalizeUrl(unwrapReaderUrl('about:reader?url=https%3A%2F%2Fa.com%2F')), 'https://a.com/');
});

test('relocation does not match look-alike hosts', () => {
  assert.equal(isUnder('https://example.com.evil.org/', 'https://example.com'), false);
  assert.equal(relocateUrl('https://example.com.evil.org/', 'https://example.com', 'https://x.org'), null);
  assert.equal(relocateUrl('https://example.com/a', 'https://example.com', 'https://x.org'), 'https://x.org/a');
});

test('site keys of reserved host names stay plain strings', () => {
  assert.equal(siteKey('http://constructor/'), 'constructor');
  assert.equal(siteKey('http://__proto__/'), '__proto__');
});

test('legacy HTML is reduced to plain text', () => {
  assert.ok(!/<[a-z]/i.test(htmlToText('<scr<script>ipt>alert(1)</scr</script>ipt>')));
  assert.ok(!htmlToText('<img src=x onerror=alert(1)>hi').includes('<'));
  assert.equal(htmlToText('<img src=x onerror=alert(1)>hi'), 'hi');
});

test('legacy migration survives prototype-looking keys', () => {
  const legacy = JSON.parse('{"__proto__":[{"id":"1","text":"x"}],"https://a.com/":[{"id":"2","text":"y"}]}');
  const pages = migrateLegacy(legacy);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(pages), ['https://a.com/']);
});

test('quote search stays fast with huge context and many candidates', () => {
  const text = 'ab '.repeat(100000);
  const quote = { exact: 'ab', prefix: 'z'.repeat(1_000_000), suffix: 'q'.repeat(1_000_000) };
  const ms = timed(() => findQuote(text, quote, { start: 10, end: 12 }));
  assert.ok(ms < 1500, `findQuote took ${ms}ms`);
});
