import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BackupError,
  buildExport,
  createBackup,
  csvCell,
  escapeMarkdown,
  hasFormulaText,
  localDate,
  localDateTime,
  mergePage,
  pagesFromGroups,
  parseBackup,
  quoteSnippet,
  textFragmentUrl,
  toCsv,
  toMarkdown,
} from '../../src/shared/exchange.js';
import { resolveCategories } from '../../src/shared/categories.js';
import { setCategories } from '../../src/shared/constants.js';

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
  const { pages: parsed } = parseBackup(JSON.stringify(createBackup(pages, { now: 0 })));
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
        { url: 'https://b.com/?utm_source=x', annotations: [annotation('y', { color: 'Not Valid!' }), { id: 'z' }] },
      ],
    }),
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].url, 'https://b.com/');
  assert.equal(parsed[0].annotations.length, 1);
  assert.equal(parsed[0].annotations[0].color, 'yellow');
});

test('a backup with page snapshots in it still imports its notes', () => {
  const backup = { ...createBackup([page('https://a.com/', [annotation('1')])], { now: 0 }), snapshots: [{ id: 's1', url: 'https://a.com/', html: '<p>hi</p>' }] };
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.pages.length, 1);
  assert.equal(parsed.snapshots, undefined);
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

const NOW = new Date(2026, 9, 12, 14, 30, 5).getTime();
const at = (day) => new Date(2026, 9, day, 9, 15, 30).getTime();
const labels = { title: 'Notes', summary: (n, p, d) => `Highlights: ${n} · pages: ${p} · exported ${d}` };

function sampleGroups() {
  return [
    {
      page: page('https://a.com/x_(1)', [], { title: 'A [b]', note: 'context', noteUpdatedAt: 1 }),
      annotations: [
        annotation('2', { position: { start: 50, end: 60 }, note: 'second', color: 'green', createdAt: at(12), updatedAt: at(13) }),
        annotation('1', { position: { start: 0, end: 10 }, quote: { exact: 'l1\nl2 *x*' }, color: 'yellow', createdAt: at(11), updatedAt: at(11) }),
      ],
    },
    { page: page('https://b.com/', [], { title: 'B', note: 'hidden' }), annotations: [annotation('3', { color: 'yellow', createdAt: at(10), updatedAt: at(10) })], includePageNote: false },
  ];
}

test('markdown export: header, color legend, notes in text order, escaped quotes', () => {
  const expected = [
    '# Notes',
    'Highlights: 3 · pages: 2 · exported 2026-10-12',
    '🟡 Yellow 2 · 🟢 Green 1',
    '## [A \\[b\\]](https://a.com/x_%281%29)',
    'a.com · highlights: 2',
    '**📝 Page note**\n\ncontext',
    '- 🟡 **Yellow** · 2026-10-11\n  > l1\n  > l2 \\*x\\*',
    '- 🟢 **Green** · 2026-10-12\n  > quote 2\n\n  second',
    '## [B](https://b.com/)',
    'b.com · highlights: 1',
    '- 🟡 **Yellow** · 2026-10-10\n  > quote 3',
  ];
  assert.equal(toMarkdown(sampleGroups(), labels, { now: NOW }), expected.join('\n\n') + '\n');
});

test('markdown export grouped by color names the source of each highlight and puts page notes last', () => {
  const md = toMarkdown(sampleGroups(), labels, { groupBy: 'color', now: NOW });
  const sections = md.trim().split('\n\n');
  assert.ok(sections.includes('## 🟡 Yellow · 2'));
  assert.ok(sections.includes('## 🟢 Green · 1'));
  assert.ok(md.includes('- **[A \\[b\\]](https://a.com/x_%281%29)** · 2026-10-11\n  > l1\n  > l2 \\*x\\*'));
  assert.ok(md.includes('- **[B](https://b.com/)** · 2026-10-10\n  > quote 3'));
  assert.ok(md.indexOf('## 🟡 Yellow') < md.indexOf('## 🟢 Green'));
  assert.ok(md.indexOf('## 🟢 Green') < md.indexOf('## 📝 Page notes'));
  assert.ok(md.trim().endsWith('- **[A \\[b\\]](https://a.com/x_%281%29)**\n\n  context'));
  assert.ok(!md.includes('hidden'), 'notes of pages exported without their page note stay out');
});

test('markdown without a title is a plain single-page document (used by copy-all)', () => {
  const md = toMarkdown([sampleGroups()[0]]);
  assert.ok(md.startsWith('# [A \\[b\\]](https://a.com/x_%281%29)\n\na.com · highlights: 2'));
  assert.ok(!md.includes('Highlights: '));
});

test('escapeMarkdown neutralizes inline and block syntax in quoted text', () => {
  assert.equal(escapeMarkdown('p < 0.05* and a_b [12]'), 'p \\< 0.05\\* and a\\_b \\[12\\]');
  assert.equal(escapeMarkdown('# not a heading\n- not a list\n1. nor this\n---'), '\\# not a heading\n\\- not a list\n1\\. nor this\n\\---');
  assert.equal(escapeMarkdown('plain 3-4 text'), 'plain 3-4 text');
});

test('quote snippet escapes the quote and links to the text', () => {
  assert.equal(
    quoteSnippet(annotation('9', { quote: { exact: 'a*b' } }), page('https://a.com/', [])),
    '> a\\*b\n\n— [Title](https://a.com/#:~:text=a*b)\n',
  );
});

test('csv cells are quoted when needed and never start a formula', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('a;b', ';'), '"a;b"');
  assert.equal(csvCell('a;b', ','), 'a;b');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1 hit'), "'+1 hit");
  assert.equal(csvCell('-5% reduction'), "'-5% reduction");
  assert.equal(csvCell('@sum'), "'@sum");
  assert.equal(csvCell('-12.5'), '-12.5');
  assert.equal(csvCell('+3'), '+3');
});

test('csv has one row per highlight in text order, and the page note once, on its own row', () => {
  const csv = toCsv(sampleGroups(), { labels: { colorName: (id) => id.toUpperCase() } });
  assert.equal(
    csv,
    [
      'Page title,Page URL,File or site,Category,Color code,Highlighted text,Note,Created,Modified',
      `A [b],https://a.com/x_(1),a.com,,,(whole page),context,${localDateTime(1)},${localDateTime(1)}`,
      'A [b],https://a.com/x_(1),a.com,YELLOW,#FACC15,"l1\nl2 *x*",,2026-10-11 09:15:30,2026-10-11 09:15:30',
      'A [b],https://a.com/x_(1),a.com,GREEN,#22C55E,quote 2,second,2026-10-12 09:15:30,2026-10-13 09:15:30',
      'B,https://b.com/,b.com,YELLOW,#FACC15,quote 3,,2026-10-10 09:15:30,2026-10-10 09:15:30',
    ].join('\r\n') + '\r\n',
  );
});

test('csv keeps a page that only has a page note, and honors the separator', () => {
  const groups = [{ page: page('https://c.com/', [], { title: 'C; D', note: 'only a note' }), annotations: [] }];
  assert.equal(toCsv(groups, { separator: ';' }).split('\r\n')[1], '"C; D";https://c.com/;c.com;;;(whole page);only a note;;');
  assert.equal(toCsv([{ ...groups[0], includePageNote: false }]).split('\r\n').length, 2, 'only the header row and the final newline');
});

test('scoped json export keeps only what was asked for and can be imported again', () => {
  const { text, extension, mime, importable } = buildExport('json', sampleGroups(), { now: NOW });
  assert.deepEqual([extension, mime, importable], ['json', 'application/json', true]);
  const { pages } = parseBackup(text);
  assert.deepEqual(pages.map((p) => [p.url, p.annotations.length, p.note ?? null]), [
    ['https://a.com/x_(1)', 2, 'context'],
    ['https://b.com/', 1, null],
  ]);
  assert.equal(pagesFromGroups([{ page: page('https://z.com/', [annotation('q')], { note: 'n' }), annotations: [] }])[0].annotations.length, 0);
});

test('csv export starts with a BOM so Excel reads UTF-8, markdown and csv are not importable', () => {
  const csv = buildExport('csv', sampleGroups(), { separator: ';' });
  assert.equal(csv.text.charCodeAt(0), 0xfeff);
  assert.equal(csv.importable, false);
  assert.equal(buildExport('markdown', sampleGroups(), { labels, now: NOW }).importable, false);
  assert.throws(() => buildExport('xlsx', []), /Unknown export format/);
  assert.equal(localDate(NOW), '2026-10-12');
});

test('local files are named by file name, folder and full path in exports', () => {
  const file = 'file:///C:/papers/trial%20A/study%20001.html';
  const groups = [{ page: page(file, [], { title: '' }), annotations: [annotation('1', { createdAt: at(10), updatedAt: at(10) })] }];
  const csv = toCsv(groups).split('\r\n');
  assert.equal(csv[1], `study 001.html,${file},C:/papers/trial A/study 001.html,Yellow,#FACC15,quote 1,,2026-10-10 09:15:30,2026-10-10 09:15:30`);
  const md = toMarkdown(groups, {}, { now: NOW });
  assert.ok(md.startsWith(`# [study 001.html](${file})\n\nC:/papers/trial A · highlights: 1`));
});

test('a backup carries categories, and importing one keeps only well-formed entries', () => {
  const backup = createBackup([], {
    now: 0,
    categories: [{ id: 'c-1', name: ' Funding ', swatch: '#14b8a6', key: 'F', extra: 'x' }, { id: 'Bad Id' }, { id: 'yellow', name: 'Sample size' }],
  });
  assert.equal(backup.categories.length, 3);
  const { categories } = parseBackup(JSON.stringify(backup));
  assert.deepEqual(categories, [{ id: 'c-1', name: 'Funding', swatch: '#14B8A6', key: 'f' }, { id: 'yellow', name: 'Sample size' }]);
  assert.deepEqual(parseBackup(JSON.stringify(createBackup([], { now: 0 }))).categories, []);
  assert.equal(createBackup([], { categories: [] }).categories, undefined, 'nothing to say, nothing written');
});

test('custom categories show up by name in markdown and csv, and unknown ones in gray', () => {
  setCategories(resolveCategories([{ id: 'yellow', name: 'Sample size' }, { id: 'c-1', name: 'Funding', swatch: '#14B8A6' }]));
  try {
    const groups = [
      {
        page: page('https://a.com/', []),
        annotations: [
          annotation('1', { color: 'c-1', createdAt: at(10) }),
          annotation('2', { color: 'yellow', createdAt: at(10) }),
          annotation('3', { color: 'gone', createdAt: at(10) }),
        ],
      },
    ];
    const md = toMarkdown(groups, { title: 'T' }, { now: NOW });
    assert.ok(md.includes('🟡 Sample size 1 · 🟢 Funding 1 · ⚪ gone 1'), md);
    assert.ok(md.includes('- 🟢 **Funding** · 2026-10-10'));
    const byColor = toMarkdown(groups, { title: 'T' }, { now: NOW, groupBy: 'color' });
    assert.ok(byColor.indexOf('## 🟡 Sample size') < byColor.indexOf('## 🟢 Funding') && byColor.indexOf('## 🟢 Funding') < byColor.indexOf('## ⚪ gone'));
    const rows = toCsv(groups).split('\r\n');
    assert.ok(rows[1].includes(',Funding,#14B8A6,'), rows[1]);
    assert.ok(rows.some((r) => r.includes(',Sample size,#FACC15,')));
    assert.ok(rows.some((r) => r.includes(',gone,#9CA3AF,')), 'a removed category is exported by its id');
  } finally {
    setCategories(null);
  }
});

test('a backup can carry the settings, and only well-formed ones come back', () => {
  const settings = { selectionToolbar: false, highlightStyle: 'underline', defaultColor: 'green', quickKeys: true, siteRules: { 'a.com': 'never', 'b.com': 'bogus' }, secret: 1 };
  const parsed = parseBackup(JSON.stringify(createBackup([], { now: 0, settings })));
  assert.deepEqual(parsed.settings, { selectionToolbar: false, quickKeys: true, highlightStyle: 'underline', defaultColor: 'green', siteRules: { 'a.com': 'never' } });
  assert.equal(parseBackup(JSON.stringify(createBackup([], { now: 0 }))).settings, null, 'left out unless asked for');
  assert.equal(parseBackup(JSON.stringify({ ...createBackup([], { now: 0 }), settings: { highlightStyle: 'neon' } })).settings, null);
});


test('the formula note is only needed when some cell would get the apostrophe', () => {
  assert.equal(hasFormulaText(sampleGroups()), false);
  assert.equal(hasFormulaText([{ page: page('https://a.com/', []), annotations: [annotation('1', { quote: { exact: '=SUM(A1)' } })] }]), true);
  assert.equal(hasFormulaText([{ page: page('https://a.com/', []), annotations: [annotation('1', { note: '-12.5' })] }]), false, 'a plain number stays as it is');
});

test('timestamps out of the date range fall back, and "auto" site rules are not imported', () => {
  const backup = {
    format: 'annotator-backup',
    pages: [{ url: 'https://a.com/', updatedAt: 1e300, annotations: [{ id: '1', quote: { exact: 'x' }, createdAt: 1e20 }] }],
    settings: { siteRules: { 'a.com': 'auto', 'b.com': 'always' } },
  };
  const { pages, settings } = parseBackup(JSON.stringify(backup), 5);
  assert.equal(pages[0].updatedAt, 5);
  assert.equal(pages[0].annotations[0].createdAt, 5);
  assert.deepEqual(settings, { siteRules: { 'b.com': 'always' } });
});
