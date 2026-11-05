import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

export function segmented(options, value, onChange, { ariaLabel = null } = {}) {
  const group = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': ariaLabel },
    options.map((opt) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(opt.value === value),
          title: opt.showLabel === false ? opt.label : null,
          'aria-label': opt.showLabel === false ? opt.label : null,
          dataset: { value: opt.value },
          onclick: () => {
            for (const btn of group.children) btn.setAttribute('aria-pressed', String(btn.dataset.value === opt.value));
            onChange(opt.value);
          },
        },
        opt.icon ? icon(opt.icon, { size: 15 }) : null,
        opt.showLabel === false ? null : opt.label,
      ),
    ),
  );
  return group;
}
