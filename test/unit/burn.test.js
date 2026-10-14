import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'parse5';
import { burnBytes, burnIntoHtml, findBurnedData, parseBurned, stripBurned } from '../../src/shared/burn.js';
import { BUILTIN_CATEGORIES } from '../../src/shared/constants.js';

const categories = BUILTIN_CATEGORIES;
const ann = (id, exact, extra = {}) => ({
  id,
  color: 'yellow',
  note: '',
  quote: { exact, prefix: '', suffix: '' },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const burn = (source, annotations, page = {}) => burnIntoHtml(source, { annotations, ...page }, { categories });

// The text each annotation's marks cover, read back with a real parser
function markedText(html) {
  const found = {};
  const walk = (node, ids = []) => {
    const own = node.nodeName === 'mark' ? node.attrs.find((a) => a.name === 'data-annotator-id')?.value : null;
    const now = own ? [...ids, own] : ids;
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === '#text') for (const id of now) found[id] = (found[id] ?? '') + child.value;
      else walk(child, now);
    }
  };
  walk(parse(html));
  return found;
}

const PAGE = '<!DOCTYPE html>\n<html>\n<head><title>T</title></head>\n<body>\n<h1>Study</h1>\n<p>The quick brown fox jumps over the lazy dog.</p>\n</body>\n</html>\n';

test('wraps the passage and leaves the rest of the file untouched', () => {
  const { html, marked, unplaced, changed } = burn(PAGE, [ann('a1', 'brown fox')]);
  assert.equal(changed, true);
  assert.equal(marked, 1);
  assert.equal(unplaced, 0);
  assert.ok(html.includes('The quick <mark data-annotator-id="a1" data-annotator-color="yellow">brown fox</mark> jumps'));
  assert.ok(html.indexOf('<!-- annotator:begin') < html.indexOf('</body>'));
  assert.equal(stripBurned(html), PAGE);
});

test('burning again changes nothing, and an empty page takes everything back out', () => {
  const once = burn(PAGE, [ann('a1', 'brown fox'), ann('a2', 'lazy dog', { color: 'green' })]).html;
  const twice = burnIntoHtml(once, { annotations: [ann('a1', 'brown fox'), ann('a2', 'lazy dog', { color: 'green' })] }, { categories });
  assert.equal(twice.html, once);
  assert.equal(twice.changed, false);

  const none = burnIntoHtml(once, { annotations: [] }, { categories });
  assert.equal(none.html, PAGE);
});

test('deleting a note removes only its mark', () => {
  const both = burn(PAGE, [ann('a1', 'brown fox'), ann('a2', 'lazy dog')]).html;
  const one = burnIntoHtml(both, { annotations: [ann('a2', 'lazy dog')] }, { categories }).html;
  assert.deepEqual(markedText(one), { a2: 'lazy dog' });
  assert.ok(!one.includes('a1'));
});

test('character references stay as they were written', () => {
  const source = '<body><p>Tom &amp; Jerry&nbsp;met &copy; 2020 &#8212; fine</p></body>';
  const { html, marked } = burn(source, [ann('a1', 'Jerry met'), ann('a2', 'fine')]);
  assert.equal(marked, 2);
  assert.ok(html.includes('Tom &amp; <mark data-annotator-id="a1" data-annotator-color="yellow">Jerry&nbsp;met</mark> &copy; 2020 &#8212; <mark data-annotator-id="a2"'));
  assert.deepEqual(markedText(html), { a1: 'Jerry met', a2: 'fine' });
  assert.equal(stripBurned(html), source);
});

test('a passage that includes a character reference is wrapped whole', () => {
  const source = '<body><p>Tom &amp; Jerry</p></body>';
  const { html } = burn(source, [ann('a1', 'Tom & Jerry')]);
  assert.deepEqual(markedText(html), { a1: 'Tom & Jerry' });
  assert.ok(html.includes('>Tom &amp; Jerry</mark>'));
});

test('keeps CRLF line endings, a byte-order mark and the file ending', () => {
  const source = '﻿<html>\r\n<body>\r\n<p>One two three</p>\r\n</body>\r\n</html>';
  const { html } = burn(source, [ann('a1', 'two', { note: 'line\nbreak' })]);
  assert.ok(html.startsWith('﻿<html>'));
  assert.ok(!/[^\r]\n/.test(html), 'every line break is still CRLF');
  assert.ok(html.endsWith('</html>'));
  assert.equal(stripBurned(html), source);
});

test('highlights that cross elements, and ones that overlap, nest correctly', () => {
  const source = '<body><p>Alpha <b>beta gamma</b> delta epsilon</p></body>';
  const { html, marked } = burn(source, [ann('a1', 'beta gamma delta'), ann('a2', 'gamma delta epsilon', { color: 'blue' })]);
  assert.equal(marked, 2);
  assert.deepEqual(markedText(html), { a1: 'beta gamma delta', a2: 'gamma delta epsilon' });
  assert.equal(stripBurned(html), source);
});

test('picks the right occurrence from the surrounding text', () => {
  const source = '<body><p>red apple, green apple, red apple pie</p></body>';
  const { html } = burn(source, [ann('a1', 'apple', { quote: { exact: 'apple', prefix: 'green ', suffix: ', red' } })]);
  assert.ok(html.includes('green <mark data-annotator-id="a1"'));
});

test('text that is no longer in the file is not marked, but its note is kept', () => {
  const { html, marked, unplaced } = burn(PAGE, [ann('a1', 'brown fox'), ann('a2', 'gone from the page', { note: 'still here' })]);
  assert.equal(marked, 1);
  assert.equal(unplaced, 1);
  const saved = parseBurned(findBurnedData(html), 'file:///a.html');
  assert.deepEqual(saved.page.annotations.map((a) => a.id).sort(), ['a1', 'a2']);
  assert.equal(saved.page.annotations.find((a) => a.id === 'a2').note, 'still here');
});

test('leaves script, style, textarea and table structure alone', () => {
  const source =
    '<body><script>var fox = "brown fox";</script><style>.x{}</style><textarea>brown fox</textarea>' +
    '<table><tr><td>brown fox</td></tr></table></body>';
  const { html } = burn(source, [ann('a1', 'brown fox')]);
  assert.deepEqual(markedText(html), { a1: 'brown fox' });
  assert.ok(html.includes('<td><mark'));
  assert.ok(html.includes('var fox = "brown fox";</script>'));
});

test('a leading newline in <pre> does not shift the marks', () => {
  const source = '<body><pre>\nfirst line\nsecond line</pre></body>';
  const { html } = burn(source, [ann('a1', 'second line')]);
  assert.deepEqual(markedText(html), { a1: 'second line' });
  assert.equal(stripBurned(html), source);
});

test('no </body>: the block goes at the end', () => {
  const source = '<p>Just a fragment about foxes.</p>\n';
  const { html } = burn(source, [ann('a1', 'foxes')]);
  assert.ok(html.startsWith('<p>Just a fragment about <mark'));
  assert.ok(html.trimEnd().endsWith('<!-- annotator:end -->'));
  assert.equal(stripBurned(html), source);
});

test('notes are escaped so they cannot break out of the block', () => {
  const note = '</script><img src=x onerror=alert(1)> <!-- annotator:end -->';
  const { html } = burn(PAGE, [ann('a1', 'brown fox', { note })]);
  assert.equal(html.match(/<\/script>/g).length, 1);
  assert.equal(html.match(/<!-- annotator:end -->/g).length, 1);
  assert.ok(!html.includes('<img'));
  assert.equal(parseBurned(findBurnedData(html), 'file:///a.html').page.annotations[0].note, note);
  assert.equal(stripBurned(html), PAGE);
});

test('a page note alone is burned in too', () => {
  const { html, total } = burn(PAGE, [], { note: 'Remember to cite this', noteUpdatedAt: 5 });
  assert.equal(total, 0);
  const saved = parseBurned(findBurnedData(html), 'file:///a.html');
  assert.equal(saved.page.note, 'Remember to cite this');
  assert.equal(saved.page.annotations.length, 0);
});

test('what was burned in can be read back, with the categories it used', () => {
  const custom = [...categories, { id: 'c-1', name: 'Sample size', swatch: '#14B8A6', fill: 'rgba(20, 184, 166, 0.34)' }];
  const annotations = [ann('a1', 'brown fox', { color: 'c-1', note: '**n = 40**', createdAt: 5, updatedAt: 9, position: { start: 20, end: 29 } })];
  const { html } = burnIntoHtml(PAGE, { annotations }, { categories: custom });
  assert.ok(html.includes('mark[data-annotator-color="c-1"]'));
  const saved = parseBurned(findBurnedData(html), 'file:///a.html');
  assert.deepEqual(saved.categories, [{ id: 'c-1', name: 'Sample size', swatch: '#14B8A6' }]);
  assert.equal(saved.page.url, 'file:///a.html');
  assert.deepEqual(saved.page.annotations[0], { ...annotations[0], quote: annotations[0].quote });
});

test('parseBurned refuses anything that is not ours', () => {
  assert.equal(parseBurned('not json', 'file:///a.html'), null);
  assert.equal(parseBurned('{"format":"other","page":{}}', 'file:///a.html'), null);
  assert.equal(findBurnedData(PAGE), null);
});

test('the underline style is carried into the file', () => {
  const { html } = burnIntoHtml(PAGE, { annotations: [ann('a1', 'brown fox')] }, { categories, style: 'underline' });
  assert.ok(html.includes('text-decoration: underline 2px'));
});

test('files in another encoding are left alone', () => {
  const encoder = new TextEncoder();
  assert.deepEqual(burnBytes(new Uint8Array([0x3c, 0x70, 0x3e, 0xe9, 0xff]), { annotations: [ann('a1', 'x')] }, { categories }), { skipped: 'encoding' });
  const declared = encoder.encode('<head><meta charset="windows-1250"></head><body><p>brown fox</p></body>');
  assert.deepEqual(burnBytes(declared, { annotations: [ann('a1', 'brown fox')] }, { categories }), { skipped: 'encoding' });
});

test('burnBytes returns the same bytes when nothing changes', () => {
  const bytes = new TextEncoder().encode(PAGE);
  const result = burnBytes(bytes, { annotations: [] }, { categories });
  assert.equal(result.changed, false);
  assert.equal(result.bytes, bytes);
  const burned = burnBytes(bytes, { annotations: [ann('a1', 'brown fox')] }, { categories });
  assert.ok(new TextDecoder().decode(burned.bytes).includes('<mark'));
});

test('a <pre> that opens with character references is mapped by its content', () => {
  const source = '<body><p>Run:</p>\n<pre>\n&gt;&gt;&gt; import httplib2\n&gt;&gt;&gt; import urllib\n</pre></body>';
  const { html, marked } = burn(source, [ann('a1', '>>> import httplib2 >>> import urllib')]);
  assert.equal(marked, 1);
  assert.deepEqual(markedText(html), { a1: '>>> import httplib2\n>>> import urllib\n'.trimEnd() });
  assert.ok(!html.includes('&gt<mark'), 'no tag lands inside a character reference');
  assert.equal(stripBurned(html), source);
});

test('the file records when the notes last changed, and nothing else that varies', () => {
  const page = { annotations: [ann('a1', 'brown fox')], updatedAt: 1234 };
  const { html } = burnIntoHtml(PAGE, page, { categories });
  assert.equal(parseBurned(findBurnedData(html), 'file:///a.html').page.updatedAt, 1234);
  // Saving the same notes again, later, writes the same file: no churn in git
  assert.equal(burnIntoHtml(html, page, { categories }).changed, false);
  // A file from before the date was kept never counts as news
  const old = html.replace('"updatedAt": 1234,\n', '');
  assert.equal(parseBurned(findBurnedData(old), 'file:///a.html').page.updatedAt, 0);
});
