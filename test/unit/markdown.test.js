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

test('markdownSpans keeps markers and offsets', async () => {
  const { markdownSpans } = await import('../../src/shared/markdown.js');
  const nodes = markdownSpans('a **b _c_** d');
  assert.equal(nodes[0].text, 'a ');
  assert.equal(nodes[1].type, 'strong');
  assert.deepEqual([nodes[1].start, nodes[1].end], [2, 11]);
  assert.equal(nodes[1].children[1].type, 'em');
  assert.deepEqual([nodes[1].children[1].start, nodes[1].children[1].end], [6, 9]);
  assert.equal(nodes[2].text, ' d');
});

test('backslash escapes markdown characters', () => {
  const plain = (tokens) => tokens.map((t) => (t.type === 'text' ? t.text : `<${t.type}>`)).join('');
  assert.equal(plain(parseInline('\\*not em\\* and \\_x\\_ and \\\\')), '*not em* and _x_ and \\');
  assert.equal(plain(parseInline('*a\\*')), '*a*');
  assert.deepEqual(parseInline('`a\\*b`'), [{ type: 'code', text: 'a\\*b' }]);
  const [block] = parseMarkdown('\\- not a list');
  assert.equal(block.type, 'p');
  assert.equal(plain(block.lines[0]), '- not a list');
});

test('markdownLineSpans marks list markers and keeps offsets', async () => {
  const { markdownLineSpans } = await import('../../src/shared/markdown.js');
  const nodes = markdownLineSpans('- a\n  2. *b*');
  assert.deepEqual(nodes.map((n) => n.type), ['bullet', 'text', 'text', 'text', 'number', 'text', 'em']);
  assert.equal(nodes.at(-1).start, 9);
  assert.equal(nodes.at(-1).end, 12);
});
