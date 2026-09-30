import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAppLike, scoreAppLikeness } from '../../src/content/context.js';

const base = { hasAppRole: false, bigCanvas: false, bigVideo: false, bigEditable: false, controls: 20, textChars: 8000, isFeed: false, innerScroller: false, composer: false, shell: false };

test('an ordinary article is not app-like', () => {
  assert.equal(isAppLike(base), false);
});

test('an article with an embedded video is still an article', () => {
  assert.equal(isAppLike({ ...base, bigVideo: true }), false);
});

test('a news front page full of buttons is not enough on its own', () => {
  assert.equal(isAppLike({ ...base, controls: 120, textChars: 60000 }), false);
});

test('a player page: big video plus dense controls', () => {
  assert.equal(isAppLike({ ...base, bigVideo: true, controls: 150, textChars: 6000 }), true);
});

test('canvas-rendered apps', () => {
  assert.equal(isAppLike({ ...base, bigCanvas: true }), true);
});

test('pages that declare themselves applications', () => {
  assert.equal(isAppLike({ ...base, hasAppRole: true }), true);
});

test('editors', () => {
  assert.equal(isAppLike({ ...base, bigEditable: true }), false);
  assert.equal(isAppLike({ ...base, bigEditable: true, controls: 90, textChars: 3000 }), true);
});

test('score grows with each signal', () => {
  assert.equal(scoreAppLikeness(base), 0);
  assert.ok(scoreAppLikeness({ ...base, hasAppRole: true, bigCanvas: true }) > scoreAppLikeness({ ...base, hasAppRole: true }));
});

test('chat apps: fixed frame with an inner scroller and a composer', () => {
  assert.equal(isAppLike({ ...base, innerScroller: true }), true);
  assert.equal(isAppLike({ ...base, shell: true, composer: true }), true);
});

test('feeds (social networks) count as apps', () => {
  assert.equal(isAppLike({ ...base, isFeed: true }), true);
});

test('an app frame with vote/share buttons around the text', () => {
  assert.equal(isAppLike({ ...base, shell: true, controls: 90, textChars: 9000 }), true);
});

test('articles with a sticky header, a sticky TOC or a comment box stay annotatable', () => {
  assert.equal(isAppLike({ ...base, shell: true }), false);
  assert.equal(isAppLike({ ...base, composer: true }), false);
  assert.equal(isAppLike({ ...base, controls: 60, textChars: 30000 }), false);
});
