import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, rolloutOnInstall } from '../../src/shared/rollout.js';
import { unwrapReaderUrl } from '../../src/shared/url.js';

test('compares dotted versions numerically', () => {
  assert.equal(compareVersions('2.0', '2.1'), -1);
  assert.equal(compareVersions('2.10', '2.9'), 1);
  assert.equal(compareVersions('2.1.0', '2.1'), 0);
});

test('existing users get a what-s-new notice; new installs and later versions get nothing', () => {
  assert.deepEqual(rolloutOnInstall({ reason: 'update', previousVersion: '2.0' }), { whatsNew: '2.1' });
  assert.deepEqual(rolloutOnInstall({ reason: 'update', previousVersion: '1.4' }), { whatsNew: '2.1' });
  assert.equal(rolloutOnInstall({ reason: 'update', previousVersion: '2.1' }), null);
  assert.equal(rolloutOnInstall({ reason: 'install' }), null);
  assert.equal(rolloutOnInstall({ reason: 'browser_update', previousVersion: '2.0' }), null);
});

test('reader view urls map back to the article', () => {
  assert.equal(unwrapReaderUrl('about:reader?url=https%3A%2F%2Fa.com%2Fx'), 'https://a.com/x');
  assert.equal(unwrapReaderUrl('https://a.com/'), 'https://a.com/');
});
