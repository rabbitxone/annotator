import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostnameOf, normalizeUrl } from '../../src/shared/url.js';

test('normalizeUrl strips tracking params and plain hashes, keeps hash routes', () => {
  assert.equal(normalizeUrl('https://a.com/p?b=2&utm_source=x&a=1#section'), 'https://a.com/p?a=1&b=2');
  assert.equal(normalizeUrl('https://a.com/#!/route'), 'https://a.com/#!/route');
  assert.equal(normalizeUrl('chrome://extensions'), null);
  assert.equal(normalizeUrl('not a url'), null);
});

test('hostnameOf drops www', () => {
  assert.equal(hostnameOf('https://www.example.com/x'), 'example.com');
});

import {
  displayAddress,
  fileNameOf,
  filePathOf,
  fileSafeName,
  folderOf,
  isUnder,
  pageName,
  relocateUrl,
  siteKey,
  siteLabel,
  toAddress,
} from '../../src/shared/url.js';

const WIN = 'file:///C:/papers/trial%20A/study%20001.html';

test('local files are named by file and grouped by folder', () => {
  assert.equal(filePathOf(WIN), 'C:/papers/trial A/study 001.html');
  assert.equal(fileNameOf(WIN), 'study 001.html');
  assert.equal(folderOf(WIN), 'C:/papers/trial A');
  assert.equal(folderOf('file:///home/me/x.html'), '/home/me');
  assert.equal(folderOf('file:///x.html'), '/');
  assert.equal(filePathOf('file://server/share/x.html'), '//server/share/x.html');
  assert.equal(pageName({ url: WIN }), 'study 001.html');
  assert.equal(pageName({ url: WIN, title: '  Real title ' }), 'Real title');
  assert.equal(pageName({ url: 'https://www.a.com/x' }), 'a.com');
  assert.equal(displayAddress(WIN), 'C:/papers/trial A/study 001.html');
  assert.equal(displayAddress('https://a.com/x'), 'https://a.com/x');
  assert.equal(fileSafeName(WIN), 'study_001');
  assert.equal(fileSafeName('https://www.a.com/x'), 'a.com');
});

test('all local files share one site rule, web pages keep their host', () => {
  assert.equal(siteKey(WIN), 'file://');
  assert.equal(siteKey('https://www.a.com/x'), 'a.com');
  assert.equal(siteLabel(WIN), 'C:/papers/trial A');
  assert.equal(siteLabel('https://www.a.com/x'), 'a.com');
});

test('typed locations become addresses', () => {
  assert.equal(toAddress('c:\\papers\\trial A'), 'file:///C:/papers/trial%20A');
  assert.equal(toAddress('/home/me/papers'), 'file:///home/me/papers');
  assert.equal(toAddress('\\\\server\\share\\papers'), 'file://server/share/papers');
  assert.equal(toAddress('//server/share/papers'), 'file://server/share/papers');
  assert.equal(toAddress('example.org/blog'), 'https://example.org/blog');
  assert.equal(toAddress('http://old.example.org/'), 'http://old.example.org/');
  assert.equal(toAddress('javascript:alert(1)'), '');
  assert.equal(toAddress('   '), '');
});

test('relocating replaces the beginning of an address and nothing else', () => {
  const from = 'file:///C:/papers';
  assert.equal(relocateUrl(WIN, from, 'file:///D:/archive/'), 'file:///D:/archive/trial%20A/study%20001.html');
  assert.equal(relocateUrl(WIN, 'file:///C:/papers/', 'file:///D:/archive'), 'file:///D:/archive/trial%20A/study%20001.html');
  assert.equal(relocateUrl('file:///C:/papers2/x.html', from, 'file:///D:/'), null, 'a sibling folder is not below it');
  assert.equal(relocateUrl('https://old.org/a?x=1', 'https://old.org', 'https://new.org'), 'https://new.org/a?x=1');
  assert.equal(relocateUrl('https://old.org/page?x=1', 'https://old.org/page', 'https://old.org/renamed'), 'https://old.org/renamed?x=1');
  assert.equal(isUnder('https://old.org/', 'https://old.org'), true);
  assert.equal(isUnder('https://old.org.evil/', 'https://old.org'), false);
});
