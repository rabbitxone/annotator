import { resolveCategories, BUILTIN_IDS } from './categories.js';
import { setCategories } from './constants.js';
import { t } from './i18n.js';

export function applyCategories(settings) {
  const list = resolveCategories(settings?.categories, categoryNameFor);
  setCategories(list);
  return list;
}

export const categoryNameFor = (id) => (BUILTIN_IDS.includes(id) ? t(`color_${id}`) : id);
