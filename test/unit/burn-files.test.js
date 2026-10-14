import assert from 'node:assert/strict';
import { test } from 'node:test';
import { burnPages, pathsBelow } from '../../src/shared/burn-files.js';
import { findBurnedData } from '../../src/shared/burn.js';
import { BUILTIN_CATEGORIES } from '../../src/shared/constants.js';

const encode = (text) => new TextEncoder().encode(text);
const decode = (bytes) => new TextDecoder().decode(bytes);
const ann = (id, exact) => ({ id, color: 'yellow', note: '', quote: { exact, prefix: '', suffix: '' }, createdAt: 1, updatedAt: 1 });
const HTML = '<html><body><p>The quick brown fox.</p></body></html>';

// A folder in memory
function memoryFolder(name, files, { canWrite = true } = {}) {
  const disk = new Map(Object.entries(files).map(([path, text]) => [path, typeof text === 'string' ? encode(text) : text]));
  const folder = {
    name,
    disk,
    find: async (segments) => (disk.has(segments.join('/')) ? segments.join('/') : null),
    read: async (entry) => disk.get(entry),
  };
  if (canWrite) folder.write = async (entry, bytes) => disk.set(entry, bytes);
  return folder;
}

test('a folder picked by name matches the pages inside it, whatever sits above it', () => {
  assert.deepEqual(pathsBelow('file:///C:/work/papers/set1/a.html', 'papers'), [['set1', 'a.html']]);
  assert.deepEqual(pathsBelow('file:///C:/work/papers/set1/a.html', 'Work'), [['papers', 'set1', 'a.html']]);
  assert.deepEqual(pathsBelow('file:///home/me/x%20y/a.html', 'x y'), [['a.html']]);
  assert.deepEqual(pathsBelow('file:///home/me/a.html', 'elsewhere'), []);
  // The file's own name is not a folder; a folder name that repeats is tried at each place
  assert.deepEqual(pathsBelow('file:///a/papers/papers/n.html', 'papers'), [['papers', 'n.html'], ['n.html']]);
  assert.deepEqual(pathsBelow('file:///a/papers/n.html', 'n.html'), []);
});

test('writes each page into its file and reports what it did', async () => {
  const folder = memoryFolder('papers', { 'a.html': HTML, 'sub/b.html': HTML, 'c.html': HTML });
  const pages = [
    { url: 'file:///work/papers/a.html', annotations: [ann('1', 'brown fox')] },
    { url: 'file:///work/papers/sub/b.html', annotations: [ann('2', 'quick')] },
    { url: 'file:///work/papers/gone.html', annotations: [ann('3', 'x')] },
    { url: 'https://example.org/page', annotations: [ann('4', 'x')] },
  ];
  const result = await burnPages(folder, pages, { categories: BUILTIN_CATEGORIES, style: 'background' });
  assert.equal(result.updated.length, 2);
  assert.deepEqual(result.notFound, ['/work/papers/gone.html']);
  assert.ok(decode(folder.disk.get('a.html')).includes('<mark data-annotator-id="1"'));
  assert.ok(findBurnedData(decode(folder.disk.get('sub/b.html'))));
  assert.equal(decode(folder.disk.get('c.html')), HTML, 'files without notes are left alone');

  // Saving again with nothing new changes nothing
  const again = await burnPages(folder, pages, { categories: BUILTIN_CATEGORIES, style: 'background' });
  assert.equal(again.updated.length, 0);
  assert.equal(again.unchanged, 2);
});

test('without write access the changed files come back to be downloaded', async () => {
  const folder = memoryFolder('papers', { 'a.html': HTML }, { canWrite: false });
  const result = await burnPages(folder, [{ url: 'file:///x/papers/a.html', annotations: [ann('1', 'brown fox')] }], { categories: BUILTIN_CATEGORIES, style: 'background' });
  assert.equal(result.outputs.length, 1);
  assert.equal(result.outputs[0].path, 'papers/a.html');
  assert.ok(decode(result.outputs[0].bytes).includes('<mark'));
  assert.equal(decode(folder.disk.get('a.html')), HTML);
});

test('a file in another encoding, or one that cannot be written, does not stop the others', async () => {
  const folder = memoryFolder('papers', { 'a.html': HTML, 'latin.html': new Uint8Array([0x3c, 0x70, 0x3e, 0xe9, 0xff]), 'locked.html': HTML });
  const write = folder.write;
  folder.write = async (entry, bytes) => {
    if (entry === 'locked.html') throw new Error('read-only');
    return write(entry, bytes);
  };
  const pages = ['latin', 'locked', 'a'].map((name, i) => ({ url: `file:///x/papers/${name}.html`, annotations: [ann(String(i), 'brown fox')] }));
  const result = await burnPages(folder, pages, { categories: BUILTIN_CATEGORIES, style: 'background' });
  assert.deepEqual(result.skipped, [{ path: '/x/papers/latin.html', reason: 'encoding' }]);
  assert.deepEqual(result.failed, ['/x/papers/locked.html']);
  assert.deepEqual(result.updated, ['/x/papers/a.html']);
});
