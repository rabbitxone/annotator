import { groupItems } from '../../shared/exchange.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { deleteMany, restoreAnnotations } from '../../shared/store.js';
import { confirmDialog } from './dialog.js';
import { toast } from './toast.js';

/** Asks first, then deletes; the toast still offers to undo it. */
export async function confirmAndDelete(items) {
  if (items.length === 0) return false;
  const sure = await confirmDialog({
    title: items.length === 1 ? t('confirmDeleteTitle') : t('confirmDeleteManyTitle', formatNumber(items.length)),
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
