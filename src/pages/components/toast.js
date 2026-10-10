import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

let current = null;

export function toast(text, { actionLabel, actionIcon = 'undo', onAction, timeout = 6000 } = {}) {
  current?.dismiss();

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
        onclick: () => {
          dismiss();
          onAction?.();
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
