import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const messages = JSON.parse(readFileSync(new URL('../../src/_locales/pl/messages.json', import.meta.url)));
globalThis.chrome = {
  runtime: {},
  i18n: {
    getUILanguage: () => 'pl',
    getMessage: (key, sub) => messages[key]?.message.replace('$COUNT$', sub) ?? '',
  },
};
const { plural } = await import('../../src/shared/i18n.js');

test('Polish counts take the right form', () => {
  assert.equal(plural('noteCount', 1), '1 notatka');
  assert.equal(plural('noteCount', 3), '3 notatki');
  assert.equal(plural('noteCount', 5), '5 notatek');
  assert.equal(plural('noteCount', 12), '12 notatek');
  assert.equal(plural('noteCount', 22), '22 notatki');
  assert.equal(plural('pageCount', 25), '25 stron');
});
