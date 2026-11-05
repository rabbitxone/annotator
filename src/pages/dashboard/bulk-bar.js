import { copyText } from '../../shared/clipboard.js';
import { groupItems, toMarkdown } from '../../shared/exchange.js';
import { exportLabels } from '../../shared/export-labels.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { updateMany } from '../../shared/store.js';
import { confirmAndDelete } from '../components/actions.js';
import { liveSwatchPicker } from '../components/swatch-picker.js';
import { toast } from '../components/toast.js';
import { openExport } from './export.js';
import { $, render, selectedItems, state } from './state.js';

let hideTimer = null;

export function renderBulkBar() {
  const count = state.selected.size;
  const bar = $('bulk-bar');
  clearTimeout(hideTimer);
  if (count > 0) {
    $('bulk-count').textContent = t('bulkSelected', formatNumber(count));
    bar.hidden = false;
    bar.inert = false;
    requestAnimationFrame(() => requestAnimationFrame(() => bar.toggleAttribute('data-open', state.selected.size > 0)));
  } else {
    bar.removeAttribute('data-open');
    bar.inert = true;
    hideTimer = setTimeout(() => (bar.hidden = true), 200);
  }
}

async function recolor(color) {
  const items = selectedItems();
  const previous = new Map();
  for (const item of items) previous.set(item.annotation.color, [...(previous.get(item.annotation.color) ?? []), item]);
  const restore = () =>
    Promise.all(
      [...previous].map(([before, group]) => updateMany(group.map(({ annotation, page }) => ({ url: page.url, id: annotation.id })), { color: before })),
    ).catch((err) => {
      console.error('Annotator: undoing recolor failed', err);
      toast(t('toastUndoFailed'));
    });
  try {
    await updateMany(
      items.map(({ annotation, page }) => ({ url: page.url, id: annotation.id })),
      { color },
    );
    toast(t('toastRecolored', formatNumber(items.length)), { actionLabel: t('actionUndo'), onAction: restore });
  } catch (err) {
    console.error('Annotator: recolor failed', err);
    toast(t('toastSaveFailed'));
  }
}

export function installBulkBar() {
  $('bulk-colors').append(liveSwatchPicker(() => null, recolor));
  $('bulk-clear').addEventListener('click', () => {
    state.selected.clear();
    render();
  });
  $('bulk-delete').addEventListener('click', async () => {
    if (await confirmAndDelete(selectedItems())) state.selected.clear();
    renderBulkBar();
  });
  $('bulk-copy').addEventListener('click', async () => {
    const ok = await copyText(toMarkdown(groupItems(selectedItems()), exportLabels()));
    toast(t(ok ? 'toastCopied' : 'toastCopyFailed'));
  });
  $('bulk-export').addEventListener('click', () => openExport('selected'));
}
