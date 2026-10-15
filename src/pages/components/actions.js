import { api } from '../../shared/api.js';
import { copyText } from '../../shared/clipboard.js';
import { groupItems } from '../../shared/exchange.js';
import { formatNumber, plural, t } from '../../shared/i18n.js';
import { deleteMany, restoreAnnotations } from '../../shared/store.js';
import { confirmDialog } from './dialog.js';
import { toast } from './toast.js';

export async function openNote(page, id) {
  const result = await api.runtime.sendMessage({ type: 'open-and-go', url: page.url, id }).catch(() => null);
  if (result?.ok) return true;
  if (!result?.manual) {
    toast(t('toastOpenFailed'));
    return false;
  }
  if (await copyText(page.url)) toast(t('toastOpenFileYourself'), { timeout: 9000 });
  else toast(t('toastCopyFailed'));
  return false;
}

export async function confirmAndDelete(items) {
  if (items.length === 0) return false;
  const sure = await confirmDialog({
    title: items.length === 1 ? t('confirmDeleteTitle') : t('confirmDeleteManyTitle', plural('noteCount', items.length)),
    text: t('confirmDeleteUndoText'),
  });
  return sure && deleteWithUndo(items);
}

export async function deleteWithUndo(items) {
  if (items.length === 0) return false;
  const groups = groupItems(items);
  try {
    await deleteMany(items.map(({ annotation, page }) => ({ url: page.url, id: annotation.id })));
  } catch (err) {
    console.error('Annotator: delete failed', err);
    toast(t('toastSaveFailed'));
    return false;
  }
  toast(t('toastDeleted', formatNumber(items.length)), {
    actionLabel: t('actionUndo'),
    onAction: () =>
      Promise.all(groups.map(({ page, annotations }) => restoreAnnotations(page.url, page.title, annotations))).catch((err) => {
        console.error('Annotator: undo failed', err);
        toast(t('toastUndoFailed'));
      }),
  });
  return true;
}
