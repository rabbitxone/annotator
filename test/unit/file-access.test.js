import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.chrome = { runtime: {}, extension: {} };
const { fileAccessAllowed, mayBeBlockedFile } = await import('../../src/shared/file-access.js');

test('only a blocked browser can hide a local file', () => {
  assert.equal(mayBeBlockedFile({ allowed: false, pageUrl: 'file:///C:/x.html' }), true);
  assert.equal(mayBeBlockedFile({ allowed: false, tabUrl: undefined, pageUrl: null }), true, 'tab without an address');
  assert.equal(mayBeBlockedFile({ allowed: false, pageUrl: 'https://a.com/', tabUrl: 'https://a.com/' }), false);
  assert.equal(mayBeBlockedFile({ allowed: true, pageUrl: 'file:///C:/x.html' }), false);
  assert.equal(mayBeBlockedFile({ allowed: null, tabUrl: undefined, pageUrl: null }), false, 'the browser can’t tell');
});

test('reading the setting copes with Chrome, other browsers and failures', async () => {
  assert.equal(await fileAccessAllowed(), null, 'no API');
  chrome.extension.isAllowedFileSchemeAccess = (cb) => cb(true);
  assert.equal(await fileAccessAllowed(), true);
  chrome.extension.isAllowedFileSchemeAccess = (cb) => cb(false);
  assert.equal(await fileAccessAllowed(), false);
  chrome.extension.isAllowedFileSchemeAccess = () => {
    throw new Error('boom');
  };
  assert.equal(await fileAccessAllowed(), null);
});

test('a promise-style API (Firefox) works and a silent one cannot hang the popup', async () => {
  chrome.extension.isAllowedFileSchemeAccess = () => Promise.resolve(true);
  assert.equal(await fileAccessAllowed(), true);
  chrome.extension.isAllowedFileSchemeAccess = () => Promise.reject(new Error('nope'));
  assert.equal(await fileAccessAllowed(), null);
  chrome.extension.isAllowedFileSchemeAccess = () => {}; // never answers
  assert.equal(await fileAccessAllowed({ timeout: 20 }), null);
});
