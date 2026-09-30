import { COLORS, colorById } from '../../shared/constants.js';
import { h } from '../../shared/dom.js';
import { formatDate, relativeTime, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { hostnameOf } from '../../shared/url.js';
import { armOnce } from './confirm.js';

function hueOf(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function siteAvatar(url, size = 32) {
  const host = hostnameOf(url);
  return h(
    'span',
    {
      class: 'avatar',
      'aria-hidden': 'true',
      style: { '--hue': String(hueOf(host)), width: `${size}px`, height: `${size}px`, 'font-size': `${Math.round(size * 0.44)}px` },
    },
    (host.match(/[\p{L}\p{N}]/u)?.[0] ?? '#').toUpperCase(),
  );
}

export function swatchPicker(selected, onPick) {
  const group = h(
    'div',
    { class: 'swatches', role: 'group', 'aria-label': t('colorLabel') },
    COLORS.map((color) =>
      h(
        'button',
        {
          class: 'swatch-btn',
          type: 'button',
          title: t(`color_${color.id}`),
          'aria-label': t(`color_${color.id}`),
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

export function annotationCard(annotation, page, options) {
  const {
    showSource = false,
    goLabel = t('actionGoTo'),
    goIcon = 'target',
    orphan = false,
    selectable = false,
    selected = false,
    onGo,
    onSave,
    onDelete,
    onSelect,
    onEditingChange,
  } = options;

  const color = colorById(annotation.color);
  const card = h('article', {
    class: 'card',
    style: { '--swatch': color.swatch, '--fill': color.fill },
    dataset: { id: annotation.id },
  });
  let isSelected = selected;
  if (isSelected) card.dataset.selected = '';

  const fill = (...children) => card.replaceChildren(...children.filter(Boolean));
  const quote = () => h('p', { class: 'card-quote' }, h('mark', null, annotation.quote?.exact ?? ''));

  function renderView() {
    const deleteBtn = h(
      'button',
      { class: 'icon-btn danger', type: 'button', title: t('actionDelete'), 'aria-label': t('actionDelete') },
      icon('delete'),
    );
    armOnce(deleteBtn, onDelete);

    const edited = annotation.updatedAt - annotation.createdAt > 1000;
    const when = edited ? annotation.updatedAt : annotation.createdAt;

    fill(
      showSource &&
      h(
        'div',
        { class: 'card-source', title: page.url },
        siteAvatar(page.url, 18),
        h('span', null, page.title || hostnameOf(page.url)),
      ),
      selectable &&
      h('input', {
        class: 'checkbox card-check',
        type: 'checkbox',
        checked: isSelected,
        'aria-label': t('actionSelect'),
        onchange: (e) => {
          isSelected = e.target.checked;
          if (isSelected) card.dataset.selected = '';
          else delete card.dataset.selected;
          onSelect(e.target.checked);
        },
      }),
      quote(),
      annotation.note && h('p', { class: 'card-note' }, annotation.note),
      h(
        'div',
        { class: 'card-foot' },
        h(
          'div',
          { class: 'card-meta', title: formatDate(when) },
          icon('clock', { size: 14 }),
          h('span', null, relativeTime(when)),
          orphan &&
          h('span', { class: 'badge badge-warning', title: t('orphanHint') }, icon('alert', { size: 12 }), t('orphanBadge')),
        ),
        h(
          'div',
          { class: 'card-actions' },
          onGo &&
          h('button', { class: 'icon-btn', type: 'button', title: goLabel, 'aria-label': goLabel, onclick: onGo }, icon(goIcon)),
          h(
            'button',
            { class: 'icon-btn', type: 'button', title: t('actionEdit'), 'aria-label': t('actionEdit'), onclick: renderEdit },
            icon('edit'),
          ),
          deleteBtn,
        ),
      ),
    );
  }

  function renderEdit() {
    onEditingChange?.(true);
    let nextColor = annotation.color;
    const textarea = h('textarea', {
      class: 'input',
      value: annotation.note || '',
      placeholder: t('notePlaceholder'),
      'aria-label': t('noteLabel'),
      rows: 3,
    });

    const finish = (save) => {
      if (save) {
        annotation.note = textarea.value;
        annotation.color = nextColor;
        onSave({ note: textarea.value, color: nextColor });
      } else {
        const original = colorById(annotation.color);
        card.style.setProperty('--swatch', original.swatch);
        card.style.setProperty('--fill', original.fill);
      }
      onEditingChange?.(false);
      renderView();
    };

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(true);
      }
    });

    fill(
      quote(),
      h(
        'div',
        { class: 'card-edit' },
        textarea,
        h(
          'div',
          { class: 'card-edit-row' },
          swatchPicker(nextColor, (id) => {
            nextColor = id;
            card.style.setProperty('--swatch', colorById(id).swatch);
            card.style.setProperty('--fill', colorById(id).fill);
          }),
          h(
            'div',
            { class: 'card-actions', style: { opacity: '1' } },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => finish(false) }, t('actionCancel')),
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => finish(true) }, t('actionSave')),
          ),
        ),
      ),
    );
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  renderView();
  return card;
}
