import { getCategories } from '../../shared/constants.js';
import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { dropdown } from './dropdown.js';

const SWATCH_LIMIT = 8;

export function swatchPicker(selected, onPick) {
  const categories = getCategories();
  if (categories.length > SWATCH_LIMIT) {
    return dropdown({
      options: categories.map((c) => ({ value: c.id, label: c.name, swatch: c.swatch })),
      value: selected ?? null,
      placeholder: t('categoryChoose'),
      ariaLabel: t('colorLabel'),
      className: 'category-select',
      onChange: onPick,
    });
  }
  const group = h(
    'div',
    { class: 'swatches', role: 'group', 'aria-label': t('colorLabel') },
    categories.map((color) =>
      h(
        'button',
        {
          class: 'swatch-btn',
          type: 'button',
          title: color.name,
          'aria-label': color.name,
          'aria-pressed': String(color.id === selected),
          dataset: { color: color.id },
          style: { '--swatch': color.swatch },
          onclick: () => {
            for (const btn of group.children) btn.setAttribute('aria-pressed', String(btn.dataset.color === color.id));
            onPick(color.id);
          },
        },
        h('span', { class: 'swatch' }),
      ),
    ),
  );
  return group;
}

const CATEGORIES_CHANGED = 'annotator:categories-changed';

export const announceCategoriesChanged = (settings) => document.dispatchEvent(new CustomEvent(CATEGORIES_CHANGED, { detail: settings }));

export function liveSwatchPicker(getSelected, onPick) {
  const wrap = h('span', { class: 'swatch-picker-live' });
  const draw = (settings) => wrap.replaceChildren(swatchPicker(getSelected(settings), onPick));
  const onChange = (e) => {
    if (!wrap.isConnected) return document.removeEventListener(CATEGORIES_CHANGED, onChange);
    draw(e.detail);
  };
  document.addEventListener(CATEGORIES_CHANGED, onChange);
  draw();
  return wrap;
}
