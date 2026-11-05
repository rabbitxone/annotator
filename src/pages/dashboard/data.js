import { applyCategories, categoryNameFor } from '../../shared/apply-categories.js';
import { mergeCategories, resolveCategories } from '../../shared/categories.js';
import { getCategories } from '../../shared/constants.js';
import { BackupError, parseBackup } from '../../shared/exchange.js';
import { formatNumber, plural, t } from '../../shared/i18n.js';
import { reverseMoves } from '../../shared/relocate.js';
import { importPages, recategorize, relocatePages, updateSettings } from '../../shared/store.js';
import { announceCategoriesChanged } from '../components/swatch-picker.js';
import { categoryDeleteDialog } from '../components/category-delete-dialog.js';
import { relocateDialog } from '../components/relocate-dialog.js';
import { toast } from '../components/toast.js';
import { categoryCounts, state } from './state.js';

export async function openRelocate() {
  const plan = await relocateDialog({ urls: state.pages.map((p) => p.url) });
  if (!plan) return;
  try {
    const { moved, merged } = await relocatePages(plan.moves);
    const undo = () =>
      relocatePages(reverseMoves(plan.moves)).catch((err) => {
        console.error('Annotator: undoing relocation failed', err);
        toast(t('toastRelocateFailed'));
      });
    toast(t('toastRelocated', plural('pageCount', moved)), merged === 0 ? { actionLabel: t('actionUndo'), onAction: undo } : {});
  } catch (err) {
    console.error('Annotator: relocation failed', err);
    toast(t('toastRelocateFailed'));
  }
}

export async function importBackup(file) {
  try {
    const { pages, categories, settings } = parseBackup(await file.text());
    const merged = mergeCategories(state.settings.categories, categories, categoryNameFor);
    if (merged.added > 0) {
      state.settings = await updateSettings({ categories: merged.categories });
      applyCategories(state.settings);
    }
    const { added, updated } = await importPages(pages);
    if (settings) {
      const { defaultColor, siteRules, ...rest } = settings;
      const known = getCategories().some((c) => c.id === defaultColor);
      state.settings = await updateSettings({
        ...rest,
        ...(known ? { defaultColor } : {}),
        ...(siteRules ? { siteRules: { ...state.settings.siteRules, ...siteRules } } : {}),
      });
      applyCategories(state.settings);
    }
    if (merged.added > 0 || settings) announceCategoriesChanged(state.settings);
    const summary = added || updated ? t('toastImported', [formatNumber(added), formatNumber(updated)]) : settings ? '' : t('toastImportedNothing');
    toast([summary, settings && t('toastImportedSettings')].filter(Boolean).join(' '));
  } catch (err) {
    if (!(err instanceof BackupError)) console.error('Annotator: import failed', err);
    toast(t(err instanceof BackupError ? 'toastImportInvalid' : 'toastImportFailed'));
  }
}

export async function saveCategories(stored) {
  const patch = { categories: stored };
  const list = resolveCategories(stored, categoryNameFor);
  if (!list.some((c) => c.id === state.settings.defaultColor)) patch.defaultColor = list[0].id;
  state.settings = await updateSettings(patch);
  applyCategories(state.settings);
  announceCategoriesChanged(state.settings);
}

export async function deleteCategory(category, remaining) {
  const count = categoryCounts().get(category.id) ?? 0;
  const result = await categoryDeleteDialog({ category, others: remaining, count });
  if (!result) return false;
  if (count > 0) await recategorize(category.id, result.moveTo);
  return true;
}
