import { h } from '../../shared/dom.js';
import { buildDialog, closeDialog, showDialog } from './dialog.js';
import { dropdown } from './dropdown.js';
import { formatNumber, t } from '../../shared/i18n.js';

/** Resolves to { moveTo } (the category that takes over its notes, if any) or null when cancelled. */
export function categoryDeleteDialog({ category, others, count }) {
  return new Promise((resolve) => {
    const target = dropdown({
      options: others.map((c) => ({ value: c.id, label: c.name, swatch: c.swatch })),
      value: others[0]?.id ?? null,
      ariaLabel: t('categoryDeleteMoveTo'),
    });
    const dialog = buildDialog({
      role: 'alertdialog',
      title: t('categoryDeleteTitle', category.name),
      body:
        count > 0
          ? [h('p', { class: 'dialog-text', style: { margin: '0 0 10px' } }, t('categoryDeleteMove', formatNumber(count))), target]
          : h('p', { class: 'dialog-text' }, t('categoryDeleteUnused')),
      actions: [
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => closeDialog(dialog, 'cancel') }, t('actionCancel')),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: () => closeDialog(dialog, 'confirm') }, t('actionDelete')),
      ],
    });
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      const moveTo = target.value;
      dialog.remove();
      resolve(confirmed ? { moveTo: count > 0 ? moveTo : null } : null);
    });
    showDialog(dialog);
  });
}
