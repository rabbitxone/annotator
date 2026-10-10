import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeQuote, findQuote, normalizeWithMap } from '../../src/content/anchoring-core.js';

test('normalizeWithMap collapses whitespace and keeps a raw offset map', () => {
  const { text, map } = normalizeWithMap('a  \n b');
  assert.equal(text, 'a b');
  assert.deepEqual(map, [0, 1, 5]);
});

test('findQuote prefers the occurrence whose context matches', () => {
  const text = 'the cat sat. the cat ran.';
  const selector = describeQuote(text, 17, 20, 8);
  assert.equal(selector.quote.exact, 'cat');
  assert.deepEqual(findQuote(text, selector.quote), { start: 17, end: 20 });
  assert.equal(findQuote(text, { exact: 'dog' }), null);
});

test('findQuote survives text inserted before the quote', () => {
  const selector = describeQuote('intro. the key idea here.', 11, 19, 10);
  assert.deepEqual(findQuote('new banner! intro. the key idea here.', selector.quote, selector.position), { start: 23, end: 31 });
});
