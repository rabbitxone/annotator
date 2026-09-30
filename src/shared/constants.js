export const COLORS = [
  {
    id: 'yellow',
    swatch: '#FACC15',
    fill: 'rgba(250, 204, 21, 0.42)',
    swatchDark: '#FDE047',
    fillDark: 'rgba(234, 179, 8, 0.58)',
  },
  {
    id: 'green',
    swatch: '#22C55E',
    fill: 'rgba(34, 197, 94, 0.32)',
    swatchDark: '#4ADE80',
    fillDark: 'rgba(34, 197, 94, 0.5)',
  },
  {
    id: 'blue',
    swatch: '#3B82F6',
    fill: 'rgba(59, 130, 246, 0.30)',
    swatchDark: '#60A5FA',
    fillDark: 'rgba(59, 130, 246, 0.6)',
  },
  {
    id: 'red',
    swatch: '#F43F5E',
    fill: 'rgba(244, 63, 94, 0.30)',
    swatchDark: '#FB7185',
    fillDark: 'rgba(244, 63, 94, 0.6)',
  },
  {
    id: 'purple',
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

export function colorById(id) {
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

export const DEFAULT_SETTINGS = {
  selectionToolbar: true,
  highlightStyle: 'background',
  defaultColor: 'yellow',
  siteRules: {},
};

export const SCHEMA_VERSION = 2;
export const PAGE_KEY_PREFIX = 'page:';
export const CONTEXT_LENGTH = 48;
