import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { t } from '../../shared/i18n.js';
import { formatKeys } from '../../shared/platform.js';

let current = null;
// The last undoable change stays reachable by ⌘Z/Ctrl+Z after its toast fades
let pendingUndo = null;

export function undoLast() {
  const undo = pendingUndo;
  pendingUndo = null;
  if (!undo) return false;
  undo();
  toast(t('toastUndone'));
  return true;
}

export function toast(text, { actionLabel, actionIcon = 'undo', onAction, timeout = 6000 } = {}) {
  current?.dismiss();

  const isUndo = actionIcon === 'undo' && typeof onAction === 'function';
  const undo = isUndo
    ? () => {
      if (pendingUndo === undo) pendingUndo = null;
      onAction();
    }
    : null;
  if (undo) pendingUndo = undo;

  let timer = null;
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', { class: 'toast-text' }, text),
    actionLabel &&
    h(
      'button',
      {
        class: 'btn btn-ghost btn-sm toast-action',
        type: 'button',
        title: isUndo ? formatKeys(['mod', 'z']) : null,
        onclick: () => {
          dismiss();
          (undo ?? onAction)?.();
        },
      },
      icon(actionIcon, { size: 14 }),
      actionLabel,
    ),
  );

  function dismiss() {
    clearTimeout(timer);
    if (current?.el === el) current = null;
    el.dataset.closing = '';
    setTimeout(() => el.remove(), 160);
  }

  document.body.append(el);
  timer = setTimeout(dismiss, timeout);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => (timer = setTimeout(dismiss, 2500)));
  current = { el, dismiss };
  return dismiss;
}
