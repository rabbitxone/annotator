import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInline, parseMarkdown } from '../../src/shared/markdown.js';

test('parses bold, italic, code and links', () => {
  assert.deepEqual(parseInline('a **b** *c* `d` [e](https://x.y)'), [
    { type: 'text', text: 'a ' },
    { type: 'strong', children: [{ type: 'text', text: 'b' }] },
    { type: 'text', text: ' ' },
    { type: 'em', children: [{ type: 'text', text: 'c' }] },
    { type: 'text', text: ' ' },
    { type: 'code', text: 'd' },
    { type: 'text', text: ' ' },
    { type: 'link', href: 'https://x.y', children: [{ type: 'text', text: 'e' }] },
  ]);
});

test('leaves snake_case and unsafe links alone', () => {
  assert.deepEqual(parseInline('snake_case_name'), [{ type: 'text', text: 'snake_case_name' }]);
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ type: 'text', text: '[x](javascript:alert(1)' }, { type: 'text', text: ')' }]);
});

test('autolinks bare urls without trailing punctuation', () => {
  const tokens = parseInline('see https://example.com/a_(b).');
  assert.equal(tokens[1].type, 'link');
  assert.equal(tokens[1].href, 'https://example.com/a_(b');
  assert.deepEqual(parseInline('see https://example.com/page.')[1].href, 'https://example.com/page');
});

test('groups lines into paragraphs and lists', () => {
  const blocks = parseMarkdown('one\ntwo\n\n- a\n- b\n1. c');
  assert.deepEqual(
    blocks.map((b) => [b.type, (b.lines ?? b.items).length]),
    [
      ['p', 2],
      ['ul', 2],
      ['ol', 1],
    ],
  );
});
