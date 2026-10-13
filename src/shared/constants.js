export const COLORS = [
  {
    id: 'yellow',
    emoji: '🟡',
    swatch: '#FACC15',
    fill: 'rgba(250, 204, 21, 0.42)',
    swatchDark: '#FDE047',
    fillDark: 'rgba(234, 179, 8, 0.58)',
  },
  {
    id: 'green',
    emoji: '🟢',
    swatch: '#22C55E',
    fill: 'rgba(34, 197, 94, 0.32)',
    swatchDark: '#4ADE80',
    fillDark: 'rgba(34, 197, 94, 0.5)',
  },
  {
    id: 'blue',
    emoji: '🔵',
    swatch: '#3B82F6',
    fill: 'rgba(59, 130, 246, 0.30)',
    swatchDark: '#60A5FA',
    fillDark: 'rgba(59, 130, 246, 0.6)',
  },
  {
    id: 'red',
    emoji: '🔴',
    swatch: '#F43F5E',
    fill: 'rgba(244, 63, 94, 0.30)',
    swatchDark: '#FB7185',
    fillDark: 'rgba(244, 63, 94, 0.6)',
  },
  {
    id: 'purple',
    emoji: '🟣',
    swatch: '#A855F7',
    fill: 'rgba(168, 85, 247, 0.30)',
    swatchDark: '#C084FC',
    fillDark: 'rgba(168, 85, 247, 0.6)',
  },
];

export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const COLOR_IDS = COLORS.map((c) => c.id);

const titleCase = (id) => id.charAt(0).toUpperCase() + id.slice(1);

// What the extension starts with: the five built-in colors as categories without a quick key
export const BUILTIN_CATEGORIES = COLORS.map((c) => ({ ...c, name: titleCase(c.id), key: null, builtin: true }));

// Categories are the colors people choose from. Settings can rename, recolor, add and reorder
// them; every page and content script keeps the resolved list here (see applyCategories).
let categories = BUILTIN_CATEGORIES;

export const getCategories = () => categories;

export function setCategories(list) {
  categories = list?.length ? list : BUILTIN_CATEGORIES;
}

// An annotation can name a category that no longer exists (deleted, or from another device)
const unknownCategory = (id) => ({
  id,
  name: String(id),
  emoji: '⚪',
  swatch: '#9CA3AF',
  fill: 'rgba(156, 163, 175, 0.35)',
  swatchDark: '#D1D5DB',
  fillDark: 'rgba(209, 213, 219, 0.5)',
  key: null,
  builtin: false,
  unknown: true,
});

export function colorById(id) {
  return categories.find((c) => c.id === id) ?? unknownCategory(id);
}

export const DEFAULT_SETTINGS = {
  selectionToolbar: true,
  highlightStyle: 'background',
  defaultColor: 'yellow',
  categories: null,
  quickKeys: false,
  autoSnapshot: true,
  siteRules: {},
};

export const SCHEMA_VERSION = 2;
export const PAGE_KEY_PREFIX = 'page:';
export const CONTEXT_LENGTH = 48;
