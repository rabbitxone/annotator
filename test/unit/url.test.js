import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostnameOf, normalizeUrl } from '../../src/shared/url.js';

test('normalizeUrl strips tracking params and plain hashes, keeps hash routes', () => {
  assert.equal(normalizeUrl('https://a.com/p?b=2&utm_source=x&a=1#section'), 'https://a.com/p?a=1&b=2');
  assert.equal(normalizeUrl('https://a.com/#!/route'), 'https://a.com/#!/route');
  assert.equal(normalizeUrl('chrome://extensions'), null);
  assert.equal(normalizeUrl('not a url'), null);
});

test('hostnameOf drops www', () => {
  assert.equal(hostnameOf('https://www.example.com/x'), 'example.com');
});
