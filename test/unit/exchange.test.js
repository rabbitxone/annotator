import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BackupError,
  createBackup,
  mergePage,
  parseBackup,
  quoteSnippet,
  textFragmentUrl,
  toMarkdown,
} from '../../src/shared/exchange.js';

const annotation = (id, extra = {}) => ({
  id,
  color: 'yellow',
  note: '',
  quote: { exact: `quote ${id}`, prefix: '', suffix: '' },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const page = (url, annotations, extra = {}) => ({ url, title: 'Title', updatedAt: 5, annotations, ...extra });

test('backup round-trips and drops device-local fields', () => {
  const pages = [page('https://a.com/', [annotation('1', { lostAt: 9, position: { start: 0, end: 7 } })], { note: 'n', noteUpdatedAt: 3 })];
  const { pages: parsed, snapshots } = parseBackup(JSON.stringify(createBackup(pages, { now: 0 })));
  assert.deepEqual(snapshots, []);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].annotations[0].lostAt, undefined);
  assert.deepEqual(parsed[0].annotations[0].position, { start: 0, end: 7 });
  assert.equal(parsed[0].note, 'n');
});

test('rejects foreign files and sanitizes entries', () => {
  assert.throws(() => parseBackup('nope'), (e) => e instanceof BackupError && e.code === 'invalid-json');
  assert.throws(() => parseBackup('{"pages":[]}'), (e) => e.code === 'invalid-format');
  const { pages: parsed } = parseBackup(
    JSON.stringify({
      format: 'annotator-backup',
      version: 1,
      pages: [
        { url: 'javascript:alert(1)', annotations: [annotation('x')] },
        { url: 'https://b.com/?utm_source=x', annotations: [annotation('y', { color: 'neon' }), { id: 'z' }] },
      ],
    }),
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].url, 'https://b.com/');
  assert.equal(parsed[0].annotations.length, 1);
  assert.equal(parsed[0].annotations[0].color, 'yellow');
});

test('backup carries snapshots and drops broken ones', () => {
  const good = { id: 's1', url: 'https://a.com/?utm_source=x', title: 'A', capturedAt: 5, hash: 'ab', html: '<p>hi</p>' };
  const backup = createBackup([], { now: 0, snapshots: [good, { id: 's2', url: 'https://a.com/', html: 1 }, { ...good, id: 's3', url: 'ftp://x' }] });
  const { snapshots } = parseBackup(JSON.stringify(backup));
  assert.deepEqual(snapshots, [{ id: 's1', url: 'https://a.com/', title: 'A', capturedAt: 5, hash: 'ab', size: 9, auto: false, html: '<p>hi</p>' }]);
});

test('merge adds new, keeps newer, and reports counts', () => {
  const existing = page('https://a.com/', [annotation('1', { note: 'mine', updatedAt: 10 }), annotation('2')]);
  const incoming = page('https://a.com/', [annotation('1', { note: 'old', updatedAt: 5 }), annotation('2', { note: 'new', updatedAt: 7 }), annotation('3')]);
  const { page: merged, added, updated } = mergePage(existing, incoming);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.deepEqual(merged.annotations.map((a) => a.note), ['mine', 'new', '']);
  assert.equal(existing.annotations[1].note, '', 'input is not mutated');
  assert.equal(mergePage(merged, incoming).changed, false, 'merging again changes nothing');
});

test('merge counts a new page note as added and a newer one as updated', () => {
  const base = page('https://a.com/', []);
  const first = mergePage(base, page('https://a.com/', [], { note: 'a', noteUpdatedAt: 1 }));
  assert.deepEqual([first.added, first.updated, first.changed], [1, 0, true]);
  const second = mergePage(first.page, page('https://a.com/', [], { note: 'b', noteUpdatedAt: 2 }));
  assert.deepEqual([second.added, second.updated, second.page.note], [0, 1, 'b']);
  assert.equal(mergePage(second.page, page('https://a.com/', [], { note: 'old', noteUpdatedAt: 1 })).changed, false);
});

test('text fragment urls encode dashes and shorten long quotes', () => {
  assert.equal(textFragmentUrl('https://a.com/', 'well-known fact'), 'https://a.com/#:~:text=well%2Dknown%20fact');
  assert.equal(textFragmentUrl('https://a.com/#!/x', 'hi'), 'https://a.com/#!/x:~:text=hi');
  const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
  assert.equal(textFragmentUrl('https://a.com/', long), 'https://a.com/#:~:text=one%20two%20three%20four,thirteen%20fourteen%20fifteen%20sixteen');
});

test('markdown export orders by text position and quotes every line', () => {
  const md = toMarkdown(
    [
      {
        page: page('https://a.com/', [], { title: 'A [b]', note: 'context' }),
        annotations: [
          annotation('2', { position: { start: 50, end: 60 }, note: 'second' }),
          annotation('1', { position: { start: 0, end: 10 }, quote: { exact: 'l1\nl2' } }),
        ],
      },
    ],
    { title: 'Notes', pageNote: 'Page note' },
  );
  assert.equal(
    md,
    '# Notes\n\n## [A \\[b\\]](https://a.com/)\n\n**Page note:** context\n\n> l1\n> l2\n\n> quote 2\n\nsecond\n',
  );
  assert.match(quoteSnippet(annotation('9'), page('https://a.com/', [])), /^> quote 9\n\n— \[Title\]\(https:\/\/a\.com\/#:~:text=quote%209\)\n$/);
});
