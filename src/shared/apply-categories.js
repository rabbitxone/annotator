import { resolveCategories, BUILTIN_IDS } from './categories.js';
import { setCategories } from './constants.js';
import { t } from './i18n.js';

/** Makes the categories from settings the ones every part of this page uses (names in the UI language). */
export function applyCategories(settings) {
  const list = resolveCategories(settings?.categories, categoryNameFor);
  setCategories(list);
  return list;
}

/** The name a category has when nobody renamed it: the localized color for built-ins. */
export const categoryNameFor = (id) => (BUILTIN_IDS.includes(id) ? t(`color_${id}`) : id);
