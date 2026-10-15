import { BUILTIN_CATEGORIES, COLORS, withAlpha } from './constants.js';

export const MAX_CATEGORIES = 60;
export const MAX_NAME_LENGTH = 60;

export const PALETTE = [
  '#FACC15', '#22C55E', '#3B82F6', '#F43F5E', '#A855F7',
  '#F97316', '#14B8A6', '#06B6D4', '#EC4899', '#84CC16',
  '#6366F1', '#0EA5E9', '#D946EF', '#A16207', '#78716C', '#1F2937',
];

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const isValidCategoryId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

export function normalizeHex(value) {
  const text = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) return `#${[...text].map((c) => c + c).join('').toUpperCase()}`;
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toUpperCase()}` : null;
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

export function lighten(hex, amount) {
  return toHex(rgb(hex).map((v) => v + (255 - v) * amount));
}

export function deriveColors(hex) {
  const swatchDark = lighten(hex, 0.3);
  return { swatch: hex, fill: withAlpha(hex, 0.34), swatchDark, fillDark: withAlpha(swatchDark, 0.55) };
}

export function emojiForHex(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta < 0.12) return lightness < 0.5 ? '⚫' : '⚪';
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return '🔴';
  if (hue < 45) return lightness < 0.42 ? '🟤' : '🟠';
  if (hue < 70) return '🟡';
  if (hue < 180) return '🟢';
  if (hue < 260) return '🔵';
  return '🟣';
}

export function normalizeKey(key) {
  const text = typeof key === 'string' ? key.trim().toLowerCase() : '';
  return /^[a-z0-9]$/.test(text) ? text : null;
}

const defaultName = (id) => id.charAt(0).toUpperCase() + id.slice(1);

export function resolveCategories(stored, nameFor = defaultName) {
  const builtin = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, c]));
  const entries = Array.isArray(stored) && stored.length ? stored : COLORS.map(({ id }) => ({ id }));
  const ids = new Set();
  const keys = new Set();
  const out = [];
  for (const entry of entries.slice(0, MAX_CATEGORIES)) {
    if (!entry || typeof entry !== 'object' || !isValidCategoryId(entry.id) || ids.has(entry.id)) continue;
    ids.add(entry.id);
    const base = builtin.get(entry.id);
    const hex = normalizeHex(entry.swatch);
    const sameAsBuiltin = base && (!hex || hex === base.swatch.toUpperCase());
    const colors = sameAsBuiltin
      ? { swatch: base.swatch, fill: base.fill, swatchDark: base.swatchDark, fillDark: base.fillDark }
      : deriveColors(hex ?? '#9CA3AF');
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, MAX_NAME_LENGTH) : nameFor(entry.id);
    let key = normalizeKey(entry.key);
    if (key && keys.has(key)) key = null;
    if (key) keys.add(key);
    out.push({ id: entry.id, name, ...colors, emoji: sameAsBuiltin ? base.emoji : emojiForHex(colors.swatch), key, builtin: !!base });
  }
  return out.length ? out : resolveCategories(null, nameFor);
}

// Unrenamed built-ins store no name, so they follow the UI language.
export function compactCategories(list, nameFor = defaultName) {
  const builtin = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, c]));
  return list.map((c) => {
    const base = builtin.get(c.id);
    const entry = { id: c.id };
    if (c.name?.trim() && c.name.trim() !== nameFor(c.id)) entry.name = c.name.trim();
    else if (!base) entry.name = c.name?.trim() || c.id;
    if (!base || c.swatch.toUpperCase() !== base.swatch.toUpperCase()) entry.swatch = c.swatch.toUpperCase();
    if (c.key) entry.key = c.key;
    return entry;
  });
}

export function newCategoryId(existing) {
  const taken = new Set(existing.map((c) => c.id));
  for (let i = 0; i < 100; i++) {
    const id = `c-${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
  return `c-${Date.now().toString(36)}`;
}

export const categoryForKey = (list, key) => {
  const wanted = normalizeKey(key);
  return wanted ? (list.find((c) => c.key === wanted) ?? null) : null;
};

export const BUILTIN_IDS = COLORS.map((c) => c.id);

export function sanitizeStoredCategories(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list.slice(0, MAX_CATEGORIES)) {
    if (!entry || typeof entry !== 'object' || !isValidCategoryId(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const clean = { id: entry.id };
    if (typeof entry.name === 'string' && entry.name.trim()) clean.name = entry.name.trim().slice(0, MAX_NAME_LENGTH);
    const hex = normalizeHex(entry.swatch);
    if (hex) clean.swatch = hex;
    const key = normalizeKey(entry.key);
    if (key) clean.key = key;
    out.push(clean);
  }
  return out;
}

export function mergeCategories(currentStored, incoming, nameFor = defaultName) {
  const current = compactCategories(resolveCategories(currentStored, nameFor), nameFor);
  const known = new Set(current.map((c) => c.id));
  const usedKeys = new Set(current.map((c) => c.key).filter(Boolean));
  const added = [];
  for (const entry of sanitizeStoredCategories(incoming)) {
    if (known.has(entry.id) || current.length + added.length >= MAX_CATEGORIES) continue;
    const next = { ...entry };
    if (next.key && usedKeys.has(next.key)) delete next.key;
    if (next.key) usedKeys.add(next.key);
    if (!BUILTIN_IDS.includes(next.id) && !next.name) next.name = next.id;
    added.push(next);
  }
  return { categories: [...current, ...added], added: added.length };
}
