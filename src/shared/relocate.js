import { normalizeUrl, relocateUrl } from './url.js';

/**
 * Which pages move when everything under `from` is pointed at `to`.
 * A move that lands on a page that already has notes is flagged `merge`: the notes get combined.
 */
export function planRelocation(urls, from, to) {
  const known = new Set(urls);
  const moves = [];
  for (const url of urls) {
    const moved = relocateUrl(url, from, to);
    const target = moved && normalizeUrl(moved);
    if (target && target !== url) moves.push({ from: url, to: target, merge: known.has(target) });
  }
  return { moves, merges: moves.filter((move) => move.merge).length };
}

export const reverseMoves = (moves) => moves.map(({ from, to }) => ({ from: to, to: from }));
