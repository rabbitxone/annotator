import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToText, migrateLegacy } from '../../src/shared/migrate.js';

test('htmlToText turns legacy rich notes into plain text', () => {
  assert.equal(htmlToText('<div>a</div><div>b &amp; c</div>'), 'a\nb & c');
});

test('migrateLegacy converts and deduplicates legacy annotations', () => {
  const legacy = {
    'https://a.com/?utm_source=x': [
      { id: 1, text: 'hello', note: 'hello', color: '__annotator-highlight-green', timestamp: 10 },
      { id: 1, text: 'hello' },
      { id: 2 },
    ],
  };
  const pages = migrateLegacy(legacy);
  const page = pages['https://a.com/'];
  assert.equal(page.annotations.length, 1);
  assert.equal(page.annotations[0].color, 'green');
  assert.equal(page.annotations[0].note, '');
});
