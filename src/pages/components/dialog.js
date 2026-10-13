import { afterAnimations } from '../../shared/motion.js';

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
