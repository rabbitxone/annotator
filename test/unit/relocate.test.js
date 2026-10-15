import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRelocation, reverseMoves } from '../../src/shared/relocate.js';

const urls = [
  'file:///C:/papers/a/1.html',
  'file:///C:/papers/a/2.html',
  'file:///C:/papers2/x.html',
  'file:///D:/archive/a/1.html',
  'https://old.org/p?x=1',
];

test('only pages under the old location move, and collisions are flagged for merging', () => {
  const { moves, merges } = planRelocation(urls, 'file:///C:/papers', 'file:///D:/archive');
  assert.deepEqual(moves, [
    { from: 'file:///C:/papers/a/1.html', to: 'file:///D:/archive/a/1.html', merge: true },
    { from: 'file:///C:/papers/a/2.html', to: 'file:///D:/archive/a/2.html', merge: false },
  ]);
  assert.equal(merges, 1);
});

test('web addresses can move too, and moving to the same place does nothing', () => {
  assert.deepEqual(planRelocation(urls, 'https://old.org', 'https://new.org').moves, [
    { from: 'https://old.org/p?x=1', to: 'https://new.org/p?x=1', merge: false },
  ]);
  assert.equal(planRelocation(urls, 'file:///C:/papers', 'file:///C:/papers').moves.length, 0);
  assert.equal(planRelocation(urls, 'file:///nowhere', 'file:///elsewhere').moves.length, 0);
});

test('a move can be reversed', () => {
  const { moves } = planRelocation(urls, 'file:///C:/papers/a/2.html', 'file:///C:/papers/a/two.html');
  assert.deepEqual(reverseMoves(moves), [{ from: 'file:///C:/papers/a/two.html', to: 'file:///C:/papers/a/2.html' }]);
});

test('moving into a subfolder of itself is not a merge', () => {
  const nested = ['file:///x/p.html', 'file:///x/y/p.html'];
  const { moves, merges } = planRelocation(nested, 'file:///x', 'file:///x/y');
  assert.deepEqual(moves, [
    { from: 'file:///x/p.html', to: 'file:///x/y/p.html', merge: false },
    { from: 'file:///x/y/p.html', to: 'file:///x/y/y/p.html', merge: false },
  ]);
  assert.equal(merges, 0);
});

test('two pages landing on one address are a merge', () => {
  const { merges } = planRelocation(['https://a.org/p', 'https://b.org/p'], 'https://a.org', 'https://b.org');
  assert.equal(merges, 1);
});
