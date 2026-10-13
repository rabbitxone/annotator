import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { afterAnimations } from '../../shared/motion.js';

let ids = 0;

/**
 * Every dialog has the same shape: a grey frame with the title on it, holding two white
 * blocks, the content and under it the buttons, set slightly apart with softly rounded corners
 * where they meet.
 */
export function buildDialog({ className = '', title, body, actions, role = 'dialog' }) {
  const titleId = `dialog-title-${++ids}`;
  return h(
    'dialog',
    { class: ['dialog', className], role: role === 'dialog' ? null : role, 'aria-labelledby': titleId },
    h('div', { class: 'dialog-head' }, h('h2', { class: 'dialog-title', id: titleId }, title)),
    [body].flat().some(Boolean) && h('div', { class: 'dialog-panel' }, h('div', { class: 'dialog-body' }, body)),
    h('div', { class: 'dialog-actions' }, actions),
  );
}

/** Closes with the exit animation first; the dialog's own "close" event fires afterwards. */
export function closeDialog(dialog, value = '') {
  if (!dialog.open || dialog.dataset.closing != null) return;
  dialog.dataset.closing = '';
  afterAnimations(dialog, () => {
    delete dialog.dataset.closing;
    if (dialog.open) dialog.close(value);
  }, 250);
}

/** Adds the dialog to the page and opens it; Esc closes it the same animated way. */
export function showDialog(dialog) {
  dialog.addEventListener('cancel', (e) => {
    // Chrome won't let a second Esc in a row be held back; then the dialog just closes.
    if (!e.cancelable) return;
    e.preventDefault();
    closeDialog(dialog, 'cancel');
  });
  document.body.append(dialog);
  dialog.showModal();
}

/** "Are you sure?" Resolves to true only when the person confirms. */
export function confirmDialog({ title, text, confirmLabel = t('actionDelete'), danger = true }) {
  return new Promise((resolve) => {
    const cancel = h('button', { class: 'btn btn-outline', type: 'button', onclick: () => closeDialog(dialog, 'cancel') }, t('actionCancel'));
    const dialog = buildDialog({
      className: 'dialog-confirm',
      role: 'alertdialog',
      title,
      body: text && h('p', { class: 'dialog-text' }, text),
      actions: [
        cancel,
        h('button', { class: ['btn', danger ? 'btn-danger' : 'btn-primary'], type: 'button', onclick: () => closeDialog(dialog, 'confirm') }, confirmLabel),
      ],
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'confirm');
    });
    showDialog(dialog);
    // The safe choice has focus, so Enter alone never deletes
    cancel.focus();
  });
}
