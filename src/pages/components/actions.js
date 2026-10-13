import { api } from '../../shared/api.js';
import { copyText } from '../../shared/clipboard.js';
import { groupItems } from '../../shared/exchange.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { deleteMany, restoreAnnotations } from '../../shared/store.js';
import { confirmDialog } from './dialog.js';
import { toast } from './toast.js';

/**
 * Opens the note's page (or its tab, if open) and scrolls to the note. Firefox doesn't let
 * extensions open files from disk: then the address is copied, and the note shows up as soon
 * as the file is opened. Resolves to true when the page opened by itself.
 */
export async function openNote(page, id) {
  const result = await api.runtime.sendMessage({ type: 'open-and-go', url: page.url, id }).catch(() => null);
  if (!result?.manual) return true;
  await copyText(page.url);
  toast(t('toastOpenFileYourself'), { timeout: 9000 });
  return false;
}

/** Asks first, then deletes; the toast still offers to undo it. */
export async function confirmAndDelete(items) {
  if (items.length === 0) return false;
  const sure = await confirmDialog({
    title: items.length === 1 ? t('confirmDeleteTitle') : t('confirmDeleteManyTitle', plural('noteCount', items.length)),
    text: t('confirmDeleteUndoText'),
  });
  if (sure) await deleteWithUndo(items);
  return sure;
}

export async function deleteWithUndo(items) {
  if (items.length === 0) return;
  const groups = groupItems(items);
  await deleteMany(items.map(({ annotation, page }) => ({ url: page.url, id: annotation.id })));
  toast(t('toastDeleted', formatNumber(items.length)), {
    actionLabel: t('actionUndo'),
    onAction: () => Promise.all(groups.map(({ page, annotations }) => restoreAnnotations(page.url, page.title, annotations))),
  });
}
