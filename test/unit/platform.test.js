import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } };
const { formatKeys, formatShortcut, isFirefox, keyParts } = await import('../../src/shared/platform.js');

const mac = { mac: true };
const pc = { mac: false };

test('keys follow each system’s own labels', () => {
  assert.equal(formatKeys(['mod', 'Enter'], mac), '⌘↩');
  assert.equal(formatKeys(['mod', 'Enter'], pc), 'Ctrl + Enter');
  assert.equal(formatKeys(['shift', 'alt', 'mod', 'K'], mac), '⌥⇧⌘K', 'Apple’s modifier order');
  assert.equal(formatKeys(['shift', 'alt', 'mod', 'k'], pc), 'Ctrl + Alt + Shift + K');
  assert.equal(formatKeys(['Tab'], mac), '⇥');
  assert.equal(formatKeys(['Escape'], pc), 'Esc');
});

test('shortcuts read the same whichever browser reports them', () => {
  assert.equal(formatShortcut('Ctrl+Shift+L', mac), '⇧⌘L', 'Firefox, manifest form');
  assert.equal(formatShortcut('⇧⌘L', mac), '⇧⌘L', 'Chrome on a Mac');
  assert.equal(formatShortcut('Ctrl+Shift+Period', pc), 'Ctrl + Shift + .');
  assert.equal(formatShortcut('MacCtrl+Shift+Comma', mac), '⌃⇧,');
  assert.equal(formatShortcut('Alt+Shift+Space', mac), '⌥⇧␣');
  assert.equal(formatShortcut('', mac), '');
});

test('Mac symbols are drawn as icons, other keys stay text', () => {
  assert.deepEqual(keyParts(['shift', 'mod', 'L'], mac), [{ icon: 'keyShift' }, { icon: 'keyCommand' }, { text: 'L' }]);
  assert.deepEqual(keyParts(['mod', 'Enter'], mac), [{ icon: 'keyCommand' }, { icon: 'keyReturn' }]);
  assert.deepEqual(keyParts(['Escape'], mac), [{ text: 'esc' }]);
  assert.deepEqual(keyParts(['mod', 'Enter'], pc), [{ text: 'Ctrl + Enter' }]);
});

test('the build is told apart by its own address', () => {
  assert.equal(isFirefox, false);
});
