import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToText, migrateLegacy } from '../../src/shared/migrate.js';

const legacy = {
  'https://example.com/post?utm_source=newsletter#comments': [
    {
      id: 'a1',
      text: 'quick brown fox',
      note: 'quick brown fox',
      color: '__annotator-highlight-green',
      timestamp: 1000,
      lastEdited: 1000,
      pageTitle: 'A post',
      contextBefore: 'The ',
      contextAfter: ' jumps',
    },
  ],
  'https://example.com/post': [
    {
      id: 'a2',
      text: 'lazy dog',
      note: 'first line<div>second &amp; third</div><br>',
      color: '',
      timestamp: 2000,
      lastEdited: 5000,
    },
  ],
  'chrome://newtab/': [{ id: 'x', text: 'ignored', note: 'ignored' }],
};

test('merges URL variants into one normalized page', () => {
  const pages = migrateLegacy(legacy);
  assert.deepEqual(Object.keys(pages), ['https://example.com/post']);
  const page = pages['https://example.com/post'];
  assert.equal(page.title, 'A post');
  assert.equal(page.annotations.length, 2);
  assert.equal(page.updatedAt, 5000);
});

test('converts fields to the 2.0 shape', () => {
  const [a1, a2] = migrateLegacy(legacy)['https://example.com/post'].annotations;
  assert.deepEqual(a1, {
    id: 'a1',
    color: 'green',
    note: '',
    quote: { exact: 'quick brown fox', prefix: 'The ', suffix: ' jumps' },
    createdAt: 1000,
    updatedAt: 1000,
  });
  assert.equal(a2.color, 'yellow');
  assert.equal(a2.note, 'first line\nsecond & third');
  assert.equal(a2.updatedAt, 5000);
});

test('is idempotent when run against already migrated data', () => {
  const once = migrateLegacy(legacy);
  const twice = migrateLegacy(legacy, once);
  assert.deepEqual(twice, once);
});

test('htmlToText keeps text and line breaks only', () => {
  assert.equal(htmlToText('<b>bold</b> and <img src=x onerror=alert(1)>text'), 'bold and text');
  assert.equal(htmlToText('a<br>b<p>c</p>'), 'a\nb\nc');
  assert.equal(htmlToText('line1<div>line2</div><div>line3</div>'), 'line1\nline2\nline3');
  assert.equal(htmlToText('a<div><br></div><div>b</div>'), 'a\n\nb');
  assert.equal(htmlToText(''), '');
});
