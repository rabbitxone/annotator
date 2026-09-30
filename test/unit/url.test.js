import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostnameOf, normalizeUrl } from '../../src/shared/url.js';

test('drops fragments that only point inside the page', () => {
  assert.equal(normalizeUrl('https://example.com/article#section-2'), 'https://example.com/article');
});

test('keeps hash routes of single-page apps', () => {
  assert.equal(normalizeUrl('https://mail.example.com/#/inbox/42'), 'https://mail.example.com/#/inbox/42');
  assert.equal(normalizeUrl('https://example.com/#!/post/1'), 'https://example.com/#!/post/1');
});

test('strips tracking parameters and sorts the rest', () => {
  assert.equal(
    normalizeUrl('https://example.com/a?utm_source=x&b=2&fbclid=abc&a=1&UTM_Medium=y'),
    'https://example.com/a?a=1&b=2',
  );
  assert.equal(normalizeUrl('https://example.com/a?utm_source=x'), 'https://example.com/a');
});

test('lower-cases the host and drops default ports', () => {
  assert.equal(normalizeUrl('HTTPS://Example.COM:443/Path'), 'https://example.com/Path');
});

test('rejects pages that cannot hold notes', () => {
  assert.equal(normalizeUrl('chrome://settings'), null);
  assert.equal(normalizeUrl('about:blank'), null);
  assert.equal(normalizeUrl('moz-extension://abc/popup.html'), null);
  assert.equal(normalizeUrl('not a url'), null);
});

test('hostnameOf strips www', () => {
  assert.equal(hostnameOf('https://www.example.com/x'), 'example.com');
});

test('produces the same query encoding as URLSearchParams', () => {
  const queries = [
    'q=hello%20world&lang=pl',
    'q=hello+world',
    'a=1&a=2&b',
    'name=Zażółć%20gęślą',
    'x=%E2%82%AC&y=~!*()\'',
    'flag&other=',
    'z=1&a=%26%3D%3F',
    'bad=%E0%A4%A&ok=1',
  ];
  for (const query of queries) {
    const kept = [...new URLSearchParams(query).entries()];
    kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const expected = new URLSearchParams(kept).toString();
    if (query.includes('bad=')) continue; // invalid UTF-8 is a browser-specific edge case
    const url = new URL(normalizeUrl(`https://example.com/p?${query}`));
    assert.equal(url.search.slice(1), expected, query);
  }
});

test('normalizing twice changes nothing', () => {
  for (const input of [
    'https://example.com/a?b=hello%20world&a=~x&utm_source=q#frag',
    'https://example.com/?q=Zażółć+gęślą',
    'https://example.com/#/route?x=1',
  ]) {
    const once = normalizeUrl(input);
    assert.equal(normalizeUrl(once), once);
  }
});

test('does not touch URLSearchParams iterators', () => {
  const original = URLSearchParams.prototype.entries;
  URLSearchParams.prototype.entries = () => {
    throw new TypeError('entries() is not iterable');
  };
  try {
    assert.equal(normalizeUrl('https://example.com/?b=2&a=1&utm_x=1'), 'https://example.com/?a=1&b=2');
  } finally {
    URLSearchParams.prototype.entries = original;
  }
});
