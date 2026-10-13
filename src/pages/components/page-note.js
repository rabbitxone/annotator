import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { highlightHits, renderMarkdown } from '../../shared/markdown.js';
import { formatKeys } from '../../shared/platform.js';

export function pageNoteBox(note, { onSave, onEditingChange, query = '' }) {
  const box = h('section', { class: 'page-note' });
  const label = () => h('span', { class: 'page-note-label' }, icon('pageNote', { size: 14 }), t('pageNoteLabel'));

  function renderView() {
    if (!note?.trim()) {
      box.dataset.empty = '';
      box.replaceChildren(
        h('button', { class: 'page-note-add', type: 'button', onclick: renderEdit }, icon('pageNote', { size: 16 }), t('pageNoteAdd')),
      );
      return;
    }
    delete box.dataset.empty;
    const body = h('div', { class: 'md page-note-body' }, renderMarkdown(note));
    highlightHits(body, query);
    box.replaceChildren(
      h(
        'div',
        { class: 'page-note-head' },
        label(),
        h(
          'button',
          { class: 'icon-btn', type: 'button', title: t('actionEdit'), 'aria-label': t('actionEdit'), onclick: renderEdit },
          icon('edit'),
        ),
      ),
      body,
    );
  }

  function renderEdit() {
    onEditingChange?.(true);
    delete box.dataset.empty;
    const textarea = h('textarea', {
      class: 'input',
      value: note || '',
      rows: 3,
      placeholder: t('pageNotePlaceholder'),
      'aria-label': t('pageNoteLabel'),
      title: t('markdownHint'),
    });
    const finish = (save) => {
      if (save && textarea.value !== (note || '')) {
        note = textarea.value;
        onSave(note);
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
    box.replaceChildren(
      h('div', { class: 'page-note-head' }, label()),
      textarea,
      h(
        'div',
        { class: 'card-edit-row' },
        h('p', { class: 'field-hint' }, t('markdownHint')),
        h(
          'div',
          { class: 'card-actions', style: { opacity: '1' } },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => finish(false) }, t('actionCancel')),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', title: `${t('actionSave')} (${formatKeys(['mod', 'Enter'])})`, onclick: () => finish(true) }, t('actionSave')),
        ),
      ),
    );
    textarea.focus();
  }

  renderView();
  return box;
}
