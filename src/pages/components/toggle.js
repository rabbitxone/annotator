import { h } from '../../shared/dom.js';

/** An on/off switch. */
export function toggle(checked, label, onChange, { disabled = false } = {}) {
  return h(
    'label',
    { class: ['toggle', disabled && 'disabled'] },
    h('input', {
      type: 'checkbox',
      role: 'switch',
      checked,
      disabled,
      'aria-label': label,
      onchange: (e) => onChange(e.target.checked),
    }),
    h('span', { class: 'toggle-track' }),
  );
}
