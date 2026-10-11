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

test('reader-view articles win over app-like chrome, real apps stay apps', () => {
  const stickyArticle = { ...article, innerScroller: true, readerable: true };
  assert.equal(isAppLike({ ...article, innerScroller: true }), true);
  assert.equal(isAppLike(stickyArticle), false);
  assert.equal(isAppLike({ ...article, composer: true, shell: true, declaresArticle: true }), false);
  const mail = { innerScroller: true, shell: true, composer: true, controls: 400, textChars: 30000, readerable: true };
  assert.equal(isAppLike(mail), true);
  const canvasDoc = { bigCanvas: true, hasAppRole: true, controls: 120, textChars: 3000, declaresArticle: true };
  assert.equal(isAppLike(canvasDoc), true);
});
