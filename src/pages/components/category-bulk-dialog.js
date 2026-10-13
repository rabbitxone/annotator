import { h } from '../../shared/dom.js';
import { plural, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { buildDialog, closeDialog, showDialog } from './dialog.js';

/**
 * Names typed or pasted one per line (say, the variables of a review, straight from a
 * spreadsheet column). Blank lines and names already in use are skipped.
 * Resolves to the new names, or null when cancelled.
 */
export function bulkCategoriesDialog({ existing, room, maxLength }) {
  return new Promise((resolve) => {
    const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
    let names = [];
    const input = h('textarea', {
      class: 'input bulk-names',
      rows: 8,
      spellcheck: 'false',
      placeholder: t('categoryBulkPlaceholder'),
      'aria-label': t('categoryBulkTitle'),
      oninput: update,
    });
    const preview = h('p', { class: 'relocate-preview', 'aria-live': 'polite' });
    const submit = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onclick: () => closeDialog(dialog, 'confirm') }, icon('add', { size: 14 }), t('categoryBulkAction'));

    function update() {
      const seen = new Set(taken);
      const all = input.value
        .split(/\r?\n|\t/)
        .map((line) => line.trim().slice(0, maxLength))
        .filter((name) => {
          const key = name.toLowerCase();
          if (!name || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      names = all.slice(0, room);
      preview.dataset.state = names.length ? 'ok' : '';
      preview.textContent = names.length
        ? t('categoryBulkCount', plural('categoryCount', names.length)) + (all.length > room ? ` ${t('categoryBulkLimit', plural('categoryCount', all.length - room))}` : '')
        : t('categoryBulkHint');
      submit.disabled = names.length === 0;
    }

    const dialog = buildDialog({
      title: t('categoryBulkTitle'),
      body: [h('p', { class: 'dialog-text bulk-intro' }, t('categoryBulkIntro')), input, preview],
      actions: [h('button', { class: 'btn btn-outline', type: 'button', onclick: () => closeDialog(dialog, 'cancel') }, t('actionCancel')), submit],
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'confirm' ? names : null);
    });
    update();
    showDialog(dialog);
    input.focus();
  });
}
