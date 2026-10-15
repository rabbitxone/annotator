import { normalizeUrl, relocateUrl } from './url.js';

export function planRelocation(urls, from, to) {
  const moves = [];
  for (const url of urls) {
    const moved = relocateUrl(url, from, to);
    const target = moved && normalizeUrl(moved);
    if (target && target !== url) moves.push({ from: url, to: target });
  }
  const staying = new Set(urls);
  for (const move of moves) staying.delete(move.from);
  const arrivals = new Map();
  for (const { to } of moves) arrivals.set(to, (arrivals.get(to) ?? 0) + 1);
  for (const move of moves) move.merge = staying.has(move.to) || arrivals.get(move.to) > 1;
  return { moves, merges: moves.filter((move) => move.merge).length };
}

export const reverseMoves = (moves) => moves.map(({ from, to }) => ({ from: to, to: from }));
