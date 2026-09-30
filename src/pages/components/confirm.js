import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';

export function confirmDialog({ title, text, confirmLabel, danger = true }) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'dialog' },
      h('div', { class: 'dialog-body' }, h('h2', { class: 'dialog-title' }, title), text && h('p', { class: 'dialog-text' }, text)),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => dialog.close('cancel') }, t('actionCancel')),
        h(
          'button',
          { class: ['btn', danger ? 'btn-danger' : 'btn-primary'], type: 'button', onclick: () => dialog.close('confirm') },
          confirmLabel,
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function armOnce(button, onConfirm) {
  let timer = null;
  button.addEventListener('click', () => {
    if (button.dataset.confirm != null) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    button.dataset.confirm = '';
    const label = h('span', null, t('actionDeleteConfirm'));
    button.append(label);
    timer = setTimeout(() => {
      delete button.dataset.confirm;
      label.remove();
    }, 3000);
  });
}
