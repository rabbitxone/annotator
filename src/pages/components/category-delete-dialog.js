import { h } from '../../shared/dom.js';
import { formatNumber, t } from '../../shared/i18n.js';

/** Resolves to { moveTo } (the category that takes over its notes, if any) or null when cancelled. */
export function categoryDeleteDialog({ category, others, count }) {
  return new Promise((resolve) => {
    const target = h(
      'select',
      { class: 'input', 'aria-label': t('categoryDeleteMoveTo') },
      others.map((c, i) => h('option', { value: c.id, selected: i === 0 }, `${c.emoji ?? ''} ${c.name}`.trim())),
    );
    const dialog = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': 'category-delete-title' },
      h(
        'div',
        { class: 'dialog-body' },
        h('h2', { class: 'dialog-title', id: 'category-delete-title' }, t('categoryDeleteTitle', category.name)),
        count > 0
          ? [h('p', { class: 'choice-hint', style: { margin: '0 0 10px' } }, t('categoryDeleteMove', formatNumber(count))), target]
          : h('p', { class: 'choice-hint' }, t('categoryDeleteUnused')),
      ),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => dialog.close('cancel') }, t('actionCancel')),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: () => dialog.close('confirm') }, t('actionDelete')),
      ),
    );
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      const moveTo = target.value;
      dialog.remove();
      resolve(confirmed ? { moveTo: count > 0 ? moveTo : null } : null);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
