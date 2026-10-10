import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColor, resolveTone } from '../../src/content/tone.js';

test('parseColor reads rgb and rgba forms', () => {
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor('rgba(1 2 3 / 50%)'), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
});

test('resolveTone blends layers over the canvas', () => {
  assert.equal(resolveTone({ layers: [] }), 'light');
  assert.equal(resolveTone({ layers: [{ r: 20, g: 20, b: 20, a: 1 }] }), 'dark');
  assert.equal(resolveTone({ layers: [{ r: 0, g: 0, b: 0, a: 0.1 }] }), 'light');
  assert.equal(resolveTone({ layers: [], hasImage: true, textColor: { r: 250, g: 250, b: 250 } }), 'dark');
});
