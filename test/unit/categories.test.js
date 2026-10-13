import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  categoryForKey,
  compactCategories,
  deriveColors,
  emojiForHex,
  lighten,
  mergeCategories,
  newCategoryId,
  normalizeHex,
  normalizeKey,
  resolveCategories,
} from '../../src/shared/categories.js';
import { colorById, getCategories, setCategories } from '../../src/shared/constants.js';

test('with nothing stored the five built-in colors come back unchanged', () => {
  const list = resolveCategories(undefined);
  assert.deepEqual(list.map((c) => c.id), ['yellow', 'green', 'blue', 'red', 'purple']);
  assert.equal(list[0].swatch, '#FACC15');
  assert.equal(list[0].fill, 'rgba(250, 204, 21, 0.42)');
  assert.equal(list[0].name, 'Yellow');
  assert.equal(list[0].emoji, '🟡');
  assert.equal(list[0].builtin, true);
});

test('renaming, recoloring, adding and reordering', () => {
  const list = resolveCategories([
    { id: 'green', name: 'Outcomes', key: 'o' },
    { id: 'yellow', name: 'Sample size', swatch: '#fb923c', key: 'Y' },
    { id: 'c-abc123', name: 'Funding source', swatch: '#14b8a6', key: 'f' },
  ]);
  assert.deepEqual(list.map((c) => [c.id, c.name, c.key]), [
    ['green', 'Outcomes', 'o'],
    ['yellow', 'Sample size', 'y'],
    ['c-abc123', 'Funding source', 'f'],
  ]);
  assert.equal(list[0].swatch, '#22C55E', 'a renamed built-in keeps its color');
  assert.equal(list[1].swatch, '#FB923C');
  assert.match(list[1].fill, /^rgba\(251, 146, 60, 0\.34\)$/);
  assert.equal(list[2].builtin, false);
  assert.equal(list[2].emoji, '🟢', 'teal reads as green');
});

test('names come from the caller so each language can supply its own', () => {
  const list = resolveCategories([{ id: 'red' }, { id: 'blue', name: '  ' }], (id) => `L10N-${id}`);
  assert.deepEqual(list.map((c) => c.name), ['L10N-red', 'L10N-blue']);
});

test('bad entries, duplicate ids and keys are dropped or cleared', () => {
  const list = resolveCategories([
    null,
    { id: 'Bad Id!' },
    { id: 'a', name: 'A', swatch: 'nonsense', key: 'x' },
    { id: 'a', name: 'duplicate' },
    { id: 'b', name: 'B', swatch: '#abc', key: 'X' },
    { id: 'c', name: 'C', key: '??' },
  ]);
  assert.deepEqual(list.map((c) => [c.id, c.key]), [['a', 'x'], ['b', null], ['c', null]]);
  assert.equal(list[0].swatch, '#9CA3AF', 'unparseable color falls back to gray');
  assert.equal(list[1].swatch, '#AABBCC');
  assert.deepEqual(resolveCategories([{ id: '!!' }]).map((c) => c.id), ['yellow', 'green', 'blue', 'red', 'purple']);
  assert.equal(resolveCategories(Array.from({ length: 200 }, (_, i) => ({ id: `c${i}` }))).length, 60);
});

test('what is stored stays minimal and round-trips', () => {
  const list = resolveCategories([{ id: 'yellow', name: 'Sample size', key: 'y' }, { id: 'green' }, { id: 'c-1', name: 'Mine', swatch: '#112233' }]);
  const stored = compactCategories(list);
  assert.deepEqual(stored, [{ id: 'yellow', name: 'Sample size', key: 'y' }, { id: 'green' }, { id: 'c-1', name: 'Mine', swatch: '#112233' }]);
  assert.deepEqual(resolveCategories(stored).map((c) => [c.id, c.name, c.swatch, c.key]), list.map((c) => [c.id, c.name, c.swatch, c.key]));
  assert.deepEqual(compactCategories(resolveCategories(undefined, (id) => `x-${id}`), (id) => `x-${id}`)[0], { id: 'yellow' });
});

test('colors derive a light and a dark fill', () => {
  assert.equal(normalizeHex('f80'), '#FF8800');
  assert.equal(normalizeHex('#123456'), '#123456');
  assert.equal(normalizeHex('12345'), null);
  assert.equal(lighten('#000000', 0.5), '#808080');
  const colors = deriveColors('#2563EB');
  assert.equal(colors.swatch, '#2563EB');
  assert.equal(colors.fill, 'rgba(37, 99, 235, 0.34)');
  assert.equal(colors.swatchDark, lighten('#2563EB', 0.3));
});

test('emoji follow the hue', () => {
  const cases = { '#EF4444': '🔴', '#F97316': '🟠', '#EAB308': '🟡', '#22C55E': '🟢', '#3B82F6': '🔵', '#A855F7': '🟣', '#A16207': '🟤', '#111111': '⚫', '#EEEEEE': '⚪' };
  for (const [hex, emoji] of Object.entries(cases)) assert.equal(emojiForHex(hex), emoji, hex);
});

test('keys are single letters or digits and found regardless of case', () => {
  assert.equal(normalizeKey(' Y '), 'y');
  assert.equal(normalizeKey('yy'), null);
  assert.equal(normalizeKey('!'), null);
  const list = resolveCategories([{ id: 'a', key: 'q' }, { id: 'b' }]);
  assert.equal(categoryForKey(list, 'Q').id, 'a');
  assert.equal(categoryForKey(list, 'z'), null);
  assert.equal(categoryForKey(list, undefined), null);
});

test('new ids are valid and never collide', () => {
  const taken = [{ id: 'yellow' }];
  const ids = new Set(Array.from({ length: 50 }, () => newCategoryId(taken)));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^c-[a-z0-9]+$/);
});

test('the registry knows the current categories and shows unknown ones in gray', () => {
  assert.equal(colorById('yellow').name, 'Yellow');
  setCategories(resolveCategories([{ id: 'x1', name: 'X', swatch: '#112233' }]));
  assert.deepEqual(getCategories().map((c) => c.id), ['x1']);
  assert.equal(colorById('x1').name, 'X');
  assert.equal(colorById('yellow').unknown, true, 'a category that was removed');
  assert.equal(colorById('yellow').swatch, '#9CA3AF');
  setCategories(null);
  assert.equal(colorById('yellow').name, 'Yellow');
});

test('importing categories adds what is missing and never overrides what is set up here', () => {
  const current = [{ id: 'yellow', name: 'Mine', key: 'y' }, { id: 'green' }];
  const incoming = [
    { id: 'yellow', name: 'Theirs', key: 'q' },
    { id: 'c-new', name: 'Funding', swatch: '#14B8A6', key: 'y' },
    { id: 'c-two', name: 'Design' },
    { id: 'Bad Id' },
  ];
  const { categories, added } = mergeCategories(current, incoming);
  assert.equal(added, 2);
  assert.deepEqual(categories.map((c) => c.id), ['yellow', 'green', 'c-new', 'c-two']);
  assert.equal(categories[0].name, 'Mine');
  assert.equal(categories[2].key, undefined, 'a key that is already taken here is dropped');
  assert.equal(mergeCategories(current, []).added, 0);
  assert.deepEqual(mergeCategories(null, [{ id: 'c-x', name: 'X' }]).categories.map((c) => c.id), ['yellow', 'green', 'blue', 'red', 'purple', 'c-x']);
});
