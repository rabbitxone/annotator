import { colorById } from '../../shared/constants.js';
import { h } from '../../shared/dom.js';
import { formatDate, relativeTime, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { highlightHits, renderMarkdown } from '../../shared/markdown.js';
import { markdownHelp } from '../../shared/markdown-help.js';
import { createNoteEditor } from '../../shared/note-editor.js';
import { pageName } from '../../shared/url.js';
import { siteAvatar } from './site-avatar.js';
import { swatchPicker } from './swatch-picker.js';

export function annotationCard(annotation, page, options) {
  const {
    showSource = false,
    goLabel = t('actionGoTo'),
    goIcon = 'target',
    orphan = !!annotation.lostAt,
    selectable = false,
    selected = false,
    query = '',
    onGo,
    onCopy,
    onReanchor,
    onSave,
    onDelete,
    onSelect,
    onEditingChange,
  } = options;

  const color = colorById(annotation.color);
  const card = h('article', {
    class: 'card',
    style: { '--swatch': color.swatch, '--fill': color.fill, '--fill-dark': color.fillDark },
    dataset: { id: annotation.id },
  });
  let isSelected = selected;
  if (isSelected) card.dataset.selected = '';

  const tint = (c) => {
    card.style.setProperty('--swatch', c.swatch);
    card.style.setProperty('--fill', c.fill);
    card.style.setProperty('--fill-dark', c.fillDark);
  };
  const fill = (...children) => card.replaceChildren(...children.filter(Boolean));
  const withHits = (el) => {
    highlightHits(el, query);
    return el;
  };
  const quote = () => withHits(h('p', { class: 'card-quote' }, h('mark', null, annotation.quote?.exact ?? '')));

  function copyButton() {
    const button = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: t('actionCopyQuote'),
        'aria-label': t('actionCopyQuote'),
        onclick: async () => {
          if (!(await onCopy())) return;
          button.replaceChildren(icon('tick'));
          setTimeout(() => button.replaceChildren(icon('copy')), 1500);
        },
      },
      icon('copy'),
    );
    return button;
  }

  function renderView() {
    const deleteBtn = h(
      'button',
      { class: 'icon-btn danger', type: 'button', title: t('actionDelete'), 'aria-label': t('actionDelete'), onclick: () => onDelete?.() },
      icon('delete'),
    );

    const edited = annotation.updatedAt - annotation.createdAt > 1000;
    const when = edited ? annotation.updatedAt : annotation.createdAt;

    fill(
      showSource &&
      h(
        'div',
        { class: 'card-source', title: page.url },
        siteAvatar(page.url, 18),
        withHits(h('span', null, pageName(page))),
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
      annotation.note?.trim() && withHits(h('div', { class: 'card-note md' }, renderMarkdown(annotation.note))),
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
          orphan &&
          onReanchor &&
          h(
            'button',
            { class: 'icon-btn', type: 'button', title: t('actionReanchorHint'), 'aria-label': t('actionReanchor'), onclick: onReanchor },
            icon('pin'),
          ),
          onGo &&
          h('button', { class: 'icon-btn', type: 'button', title: goLabel, 'aria-label': goLabel, onclick: onGo }, icon(goIcon)),
          onCopy && copyButton(),
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
    const editor = createNoteEditor({
      value: annotation.note || '',
      placeholder: t('notePlaceholder'),
      label: t('noteLabel'),
      openTip: t('mdOpenLink'),
      openKeys: `mod+${t('mdClick')}`,
    });
    editor.el.classList.add('input', 'note-field');

    const finish = (save) => {
      if (save) {
        annotation.note = editor.value;
        annotation.color = nextColor;
        onSave({ note: editor.value, color: nextColor });
      } else {
        tint(colorById(annotation.color));
      }
      onEditingChange?.(false);
      renderView();
    };

    const md = markdownHelp();

    editor.el.addEventListener('keydown', (e) => {
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
        editor.el,
        md.help,
        h(
          'div',
          { class: 'card-edit-row' },
          swatchPicker(nextColor, (id) => {
            nextColor = id;
            tint(colorById(id));
          }),
          h(
            'div',
            { class: 'card-actions', style: { opacity: '1' } },
            md.button,
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => finish(false) }, t('actionCancel')),
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', title: t('actionSave'), 'data-tip-keys': 'mod+Enter', onclick: () => finish(true) }, t('actionSave')),
          ),
        ),
      ),
    );
    editor.focus();
    editor.setCaret(editor.value.length);
  }

  renderView();
  return card;
}
