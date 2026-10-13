import { categoryNameFor } from '../../shared/apply-categories.js';
import {
  MAX_CATEGORIES,
  MAX_NAME_LENGTH,
  PALETTE,
  compactCategories,
  newCategoryId,
  normalizeHex,
  normalizeKey,
  resolveCategories,
} from '../../shared/categories.js';
import { getCategories } from '../../shared/constants.js';
import { h } from '../../shared/dom.js';
import { formatNumber, plural, t } from '../../shared/i18n.js';
import { confirmDialog } from './dialog.js';
import { icon } from '../../shared/icons.js';

/**
 * Rename, recolor, reorder, add and remove categories, and give each a quick key.
 * `counts` is a Map of category id to how many notes use it.
 * `onChange(stored)` saves the list; `onDelete(category, remaining)` resolves true once it may go.
 */
export function categoryEditor({ counts, onChange, onDelete }) {
  const root = h('div', { class: 'category-editor' });
  const status = h('p', { class: 'category-status', 'aria-live': 'polite' });
  let list = getCategories().map((c) => ({ id: c.id, name: c.name, swatch: c.swatch, key: c.key, builtin: c.builtin }));
  let paletteFor = null;
  let statusTimer = null;

  const save = () => onChange(compactCategories(list, categoryNameFor));

  function say(text) {
    clearTimeout(statusTimer);
    status.textContent = text;
    statusTimer = setTimeout(() => (status.textContent = ''), 3000);
  }

  function setColor(category, hex) {
    if (!hex) return;
    category.swatch = hex;
    paletteFor = null;
    render();
    save();
  }

  function move(index, by) {
    const target = index + by;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    render();
    save();
  }

  async function remove(category) {
    if (list.length <= 1) return;
    const remaining = list.filter((c) => c.id !== category.id);
    if (!(await onDelete(category, remaining))) return;
    list = remaining;
    paletteFor = null;
    render();
    save();
  }

  function add() {
    if (list.length >= MAX_CATEGORIES) return;
    const used = new Set(list.map((c) => c.swatch.toUpperCase()));
    const swatch = PALETTE.find((hex) => !used.has(hex)) ?? PALETTE[list.length % PALETTE.length];
    list.push({ id: newCategoryId(list), name: t('categoryNewName', formatNumber(list.length + 1)), swatch, key: null });
    render();
    save();
    const names = root.querySelectorAll('.category-name');
    names[names.length - 1]?.focus();
    names[names.length - 1]?.select();
  }

  async function resetBuiltIn() {
    const sure = await confirmDialog({ title: t('categoryResetTitle'), text: t('categoryResetText'), confirmLabel: t('categoryResetAction') });
    if (!sure) return;
    const originals = resolveCategories(null, categoryNameFor);
    const custom = list.filter((c) => !c.builtin);
    list = [...originals.map((c) => ({ id: c.id, name: c.name, swatch: c.swatch, key: null, builtin: true })), ...custom];
    paletteFor = null;
    render();
    save();
  }

  function row(category, index) {
    const nameInput = h('input', {
      class: 'input category-name',
      type: 'text',
      value: category.name,
      maxlength: MAX_NAME_LENGTH,
      'aria-label': t('categoryName'),
      onchange: (e) => {
        const value = e.target.value.trim();
        if (!value) {
          e.target.value = category.name;
          return;
        }
        category.name = value;
        save();
      },
    });
    const keyInput = h('input', {
      class: 'input category-key',
      type: 'text',
      value: category.key ?? '',
      maxlength: 1,
      placeholder: '–',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': t('categoryKey'),
      title: t('categoryKeyHint'),
      onfocus: (e) => e.target.select(),
      onchange: (e) => {
        const key = normalizeKey(e.target.value);
        const clash = key && list.find((c) => c !== category && c.key === key);
        if (e.target.value.trim() && !key) say(t('categoryKeyInvalid'));
        else if (clash) say(t('categoryKeyTaken', [key.toUpperCase(), clash.name]));
        else {
          category.key = key;
          e.target.value = key ?? '';
          save();
          return;
        }
        e.target.value = category.key ?? '';
      },
    });
    const count = counts.get(category.id) ?? 0;
    const open = paletteFor === category.id;
    return h(
      'div',
      { class: 'category-block' },
      h(
        'div',
        { class: 'category-row' },
        h(
          'button',
          {
            class: 'category-color',
            type: 'button',
            title: t('categoryColor'),
            'aria-label': t('categoryColor'),
            'aria-expanded': String(open),
            style: { '--swatch': category.swatch },
            onclick: () => {
              paletteFor = open ? null : category.id;
              render();
            },
          },
          h('span', { class: 'swatch' }),
        ),
        nameInput,
        keyInput,
        h('span', { class: 'category-count', title: t('categoryNotes') }, count ? plural('noteCount', count) : ''),
        h(
          'div',
          { class: 'category-actions' },
          h('button', { class: 'icon-btn', type: 'button', title: t('categoryMoveUp'), 'aria-label': t('categoryMoveUp'), disabled: index === 0, onclick: () => move(index, -1) }, icon('up', { size: 14 })),
          h('button', { class: 'icon-btn', type: 'button', title: t('categoryMoveDown'), 'aria-label': t('categoryMoveDown'), disabled: index === list.length - 1, onclick: () => move(index, 1) }, icon('down', { size: 14 })),
          h('button', { class: 'icon-btn danger', type: 'button', title: t('actionDelete'), 'aria-label': t('actionDelete'), disabled: list.length <= 1, onclick: () => remove(category) }, icon('delete', { size: 14 })),
        ),
      ),
      open &&
      h(
        'div',
        { class: 'category-palette', role: 'group', 'aria-label': t('categoryColor') },
        PALETTE.map((hex) =>
          h(
            'button',
            { class: 'swatch-btn', type: 'button', title: hex, 'aria-label': hex, 'aria-pressed': String(hex === category.swatch.toUpperCase()), style: { '--swatch': hex }, onclick: () => setColor(category, hex) },
            h('span', { class: 'swatch' }),
          ),
        ),
        h(
          'label',
          { class: 'palette-custom' },
          h('span', null, t('categoryCustomColor')),
          h('input', { type: 'color', value: category.swatch, onchange: (e) => setColor(category, normalizeHex(e.target.value)) }),
        ),
      ),
    );
  }

  function render() {
    root.replaceChildren(
      h(
        'div',
        { class: 'category-head', 'aria-hidden': 'true' },
        h('span'),
        h('span', null, t('categoryName')),
        h('span', null, t('categoryKey')),
        h('span'),
        h('span'),
      ),
      ...list.map(row),
      h(
        'div',
        { class: 'category-footer' },
        h(
          'button',
          { class: 'btn btn-outline btn-sm', type: 'button', disabled: list.length >= MAX_CATEGORIES, onclick: add },
          icon('add', { size: 14 }),
          t('categoryAdd'),
        ),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: resetBuiltIn }, t('categoryReset')),
        status,
      ),
    );
  }

  render();
  return root;
}
