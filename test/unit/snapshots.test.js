import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeHref, safeImageSrc, textHash } from '../../src/shared/sanitize.js';
import { versionsToDrop } from '../../src/shared/snapshots.js';

test('keeps the original snapshot and drops the oldest of the rest', () => {
  const metas = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `s${n}`, capturedAt: n }));
  assert.deepEqual(versionsToDrop(metas, 5), ['s2', 's3']);
  assert.deepEqual(versionsToDrop(metas.slice(0, 3), 5), []);
});

test('only http(s) links and safe image sources survive', () => {
  assert.equal(safeHref('https://a.com/x'), 'https://a.com/x');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref(' JAVASCRIPT:alert(1)'), null);
  assert.equal(safeImageSrc('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safeImageSrc('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(safeImageSrc('data:text/html,<script>'), null);
});

test('text hash ignores whitespace differences', () => {
  assert.equal(textHash('a  b\n c'), textHash('a b c'));
  assert.notEqual(textHash('a b c'), textHash('a b d'));
});
