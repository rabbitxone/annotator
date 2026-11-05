import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSafeFavicon, needsFavicon } from '../../src/shared/favicon.js';

test('needsFavicon asks again after a month, never for local files', () => {
  const now = Date.UTC(2026, 0, 31);
  assert.equal(needsFavicon({ url: 'https://a.com/' }, now), true);
  assert.equal(needsFavicon({ url: 'https://a.com/', favicon: { src: 'data:image/png;base64,AA', at: now - 1000 } }, now), false);
  assert.equal(needsFavicon({ url: 'https://a.com/', favicon: { src: 'data:image/png;base64,AA', at: now - 40 * 864e5 } }, now), true);
  assert.equal(needsFavicon({ url: 'file:///a.html' }, now), false);
  assert.equal(needsFavicon(null, now), false);
});

test('isSafeFavicon accepts small image data URLs only', () => {
  assert.equal(isSafeFavicon('data:image/png;base64,AAAA'), true);
  assert.equal(isSafeFavicon('data:image/svg+xml;base64,AAAA'), true);
  assert.equal(isSafeFavicon('data:text/html,<script>'), false);
  assert.equal(isSafeFavicon('https://a.com/favicon.ico'), false);
  assert.equal(isSafeFavicon('data:image/png;base64,' + 'A'.repeat(30000)), false);
});
