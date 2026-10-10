import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAppLike } from '../../src/content/context.js';

const article = { controls: 20, textChars: 20000 };

test('articles are not app-like, feeds and canvases are', () => {
  assert.equal(isAppLike(article), false);
  assert.equal(isAppLike({ ...article, isFeed: true }), true);
  assert.equal(isAppLike({ ...article, bigCanvas: true }), true);
  assert.equal(isAppLike({ controls: 300, textChars: 2000 }), true);
});
