import { h } from '../../shared/dom.js';
import { buildDialog, closeDialog, showDialog } from './dialog.js';
import { suggestions } from './dropdown.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { planRelocation } from '../../shared/relocate.js';
import { displayAddress, folderOf, isFileUrl, toAddress } from '../../shared/url.js';

/** Resolves to { moves, merges } for the pages to point at a new location, or null when cancelled. */
export function relocateDialog({ urls }) {
  return new Promise((resolve) => {
    const folders = [...new Set(urls.filter(isFileUrl).map(folderOf))].sort().slice(0, 300);
    let plan = { moves: [], merges: 0 };

    const input = (label, placeholder) =>
      h('input', {
        class: 'input',
        type: 'text',
        placeholder,
        spellcheck: 'false',
        autocomplete: 'off',
        'aria-label': label,
        oninput: update,
      });
    const from = input(t('relocateFrom'), 'C:\\papers');
    const to = input(t('relocateTo'), 'D:\\archive\\papers');
    const preview = h('p', { class: 'relocate-preview', 'aria-live': 'polite' });
    const resolved = h('p', { class: 'relocate-resolved' });
    const submit = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onclick: () => closeDialog(dialog, 'confirm') }, icon('folder', { size: 14 }), t('relocateAction'));

    function update() {
      const fromAddress = toAddress(from.value);
      const toAddressValue = toAddress(to.value);
      plan = { moves: [], merges: 0 };
      resolved.textContent = '';
      preview.dataset.state = '';
      if (!from.value.trim() || !to.value.trim()) {
        preview.textContent = t('relocateHint');
      } else if (!fromAddress || !toAddressValue) {
        preview.textContent = t('relocateInvalid');
        preview.dataset.state = 'warn';
      } else {
        plan = planRelocation(urls, fromAddress, toAddressValue);
        resolved.textContent = `${displayAddress(fromAddress)}  →  ${displayAddress(toAddressValue)}`;
        if (plan.moves.length === 0) {
          preview.textContent = fromAddress === toAddressValue ? t('relocateSame') : t('relocateNone');
          preview.dataset.state = 'warn';
        } else {
          preview.textContent = t('relocateCount', formatNumber(plan.moves.length)) + (plan.merges ? `. ${t('relocateMerge', formatNumber(plan.merges))}` : '');
          preview.dataset.state = 'ok';
        }
      }
      submit.disabled = plan.moves.length === 0;
    }

    const field = (label, control) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);

    const dialog = buildDialog({
      className: 'export-dialog',
      title: t('relocateTitle'),
      body: [
        h('p', { class: 'choice-hint relocate-intro' }, t('relocateIntro')),
        field(t('relocateFrom'), from),
        field(t('relocateTo'), to),
        preview,
        resolved,
        h('p', { class: 'export-note relocate-note' }, icon('info', { size: 14 }), h('span', null, t('relocateReminder'))),
      ],
      actions: [h('button', { class: 'btn btn-outline', type: 'button', onclick: () => closeDialog(dialog, 'cancel') }, t('actionCancel')), submit],
    });
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm' && plan.moves.length > 0;
      dialog.remove();
      resolve(confirmed ? plan : null);
    });
    suggestions(from, folders);
    suggestions(to, folders);
    update();
    showDialog(dialog);
    from.focus();
  });
}
