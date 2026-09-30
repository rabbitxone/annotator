import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blend, luminance, parseColor, resolveTone } from '../../src/content/tone.js';

const opaque = (r, g, b) => ({ r, g, b, a: 1 });

test('parses rgb() and rgba() in legacy and modern syntax', () => {
  assert.deepEqual(parseColor('rgb(255, 128, 0)'), { r: 255, g: 128, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgb(10 20 30)'), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseColor('rgb(10 20 30 / 25%)'), { r: 10, g: 20, b: 30, a: 0.25 });
  assert.deepEqual(parseColor('rgba(0 0 0 / 0)'), { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(parseColor('transparent').a, 0);
  assert.equal(parseColor(''), null);
});

test('luminance runs from black to white', () => {
  assert.equal(luminance(opaque(0, 0, 0)), 0);
  assert.ok(Math.abs(luminance(opaque(255, 255, 255)) - 1) < 1e-9);
  assert.ok(luminance(opaque(18, 18, 18)) < luminance(opaque(128, 128, 128)));
});

test('blend composites a translucent colour over another', () => {
  const half = blend({ r: 0, g: 0, b: 0, a: 0.5 }, opaque(255, 255, 255));
  assert.equal(Math.round(half.r), 128);
  assert.equal(half.a, 1);
});

test('classic light and dark pages', () => {
  assert.equal(resolveTone({ layers: [opaque(255, 255, 255)] }), 'light');
  assert.equal(resolveTone({ layers: [opaque(17, 24, 39)] }), 'dark');
  assert.equal(resolveTone({ layers: [opaque(18, 18, 18)] }), 'dark');
  assert.equal(resolveTone({ layers: [opaque(254, 243, 199)] }), 'light'); // pale yellow note
});

test('no background at all falls back to the page canvas', () => {
  assert.equal(resolveTone({ layers: [] }), 'light');
  assert.equal(resolveTone({ layers: [], canvas: opaque(18, 18, 18) }), 'dark');
});

test('translucent layers are composited over what is behind them', () => {
  // 90% black card over white is still dark; 10% black over white stays light.
  assert.equal(resolveTone({ layers: [{ r: 0, g: 0, b: 0, a: 0.9 }] }), 'dark');
  assert.equal(resolveTone({ layers: [{ r: 0, g: 0, b: 0, a: 0.1 }] }), 'light');
  // A translucent white panel over a dark page stays dark-ish.
  assert.equal(
    resolveTone({ layers: [{ r: 255, g: 255, b: 255, a: 0.05 }, opaque(10, 10, 10)] }),
    'dark',
  );
});

test('a dark code block on a light page counts as dark', () => {
  assert.equal(resolveTone({ layers: [opaque(30, 30, 30), opaque(255, 255, 255)] }), 'dark');
});

test('with a background image, the text colour decides', () => {
  assert.equal(resolveTone({ layers: [], hasImage: true, textColor: opaque(255, 255, 255) }), 'dark');
  assert.equal(resolveTone({ layers: [], hasImage: true, textColor: opaque(20, 20, 20) }), 'light');
  assert.equal(resolveTone({ layers: [opaque(0, 0, 0)], hasImage: true, textColor: null }), 'light');
});
