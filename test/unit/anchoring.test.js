import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeQuote, findQuote, normalizeWithMap } from '../../src/content/anchoring-core.js';

test('normalizeWithMap collapses whitespace and maps back to raw offsets', () => {
  const raw = 'Hello \n\t  world !';
  const { text, map } = normalizeWithMap(raw);
  assert.equal(text, 'Hello world !');
  assert.equal(raw[map[text.indexOf('w')]], 'w');
  assert.equal(map.length, text.length);
});

test('finds a quote whose whitespace differs from the page', () => {
  const { text } = normalizeWithMap('Intro.\n\n   The quick   brown\nfox jumps.');
  const hit = findQuote(text, { exact: 'quick brown fox' });
  assert.equal(text.slice(hit.start, hit.end), 'quick brown fox');
});

test('uses prefix/suffix to pick the right repeated occurrence', () => {
  const text = 'Chapter one: the answer is 42. Chapter two: the answer is 42. Chapter three.';
  const hit = findQuote(text, { exact: 'the answer is 42', prefix: 'Chapter two: ', suffix: '. Chapter three' });
  assert.equal(hit.start, text.lastIndexOf('the answer is 42'));
});

test('falls back to the stored position when contexts tie', () => {
  const text = 'same same same';
  const hit = findQuote(text, { exact: 'same' }, { start: 5, end: 9 });
  assert.equal(hit.start, 5);
});

test('returns null when the text is gone', () => {
  assert.equal(findQuote('nothing here', { exact: 'missing' }), null);
  assert.equal(findQuote('anything', { exact: '   ' }), null);
});

test('describeQuote trims the selection and records context', () => {
  const text = 'The quick brown fox jumps over the lazy dog';
  const start = text.indexOf(' brown');
  const end = text.indexOf('fox') + 'fox '.length;
  const { quote, position } = describeQuote(text, start, end, 10);
  assert.deepEqual(quote, { exact: 'brown fox', prefix: 'The quick ', suffix: ' jumps ove' });
  assert.equal(text.slice(position.start, position.end), 'brown fox');
});

test('a described quote resolves back to the same place', () => {
  const text = 'a b c a b c a b c';
  const selector = describeQuote(text, 6, 11, 4);
  const hit = findQuote(text, selector.quote, selector.position);
  assert.deepEqual(hit, selector.position);
});
