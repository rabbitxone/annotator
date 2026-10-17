import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { highlightHits, renderMarkdown } from '../../shared/markdown.js';
import { markdownHelp } from '../../shared/markdown-help.js';
import { createNoteEditor } from '../../shared/note-editor.js';

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
    const editor = createNoteEditor({
      value: note || '',
      placeholder: t('pageNotePlaceholder'),
      label: t('pageNoteLabel'),
      openTip: t('mdOpenLink'),
      openKeys: `mod+${t('mdClick')}`,
    });
    editor.el.classList.add('input', 'note-field');
    const finish = (save) => {
      if (save && editor.value !== (note || '')) {
        note = editor.value;
        onSave(note);
      }
      onEditingChange?.(false);
      renderView();
    };
    editor.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(true);
      }
    });
    const md = markdownHelp();
    box.replaceChildren(
      h('div', { class: 'page-note-head' }, label()),
      editor.el,
      md.help,
      h(
        'div',
        { class: 'card-edit-row' },
        md.button,
        h(
          'div',
          { class: 'card-actions', style: { opacity: '1' } },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => finish(false) }, t('actionCancel')),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', title: t('actionSave'), 'data-tip-keys': 'mod+Enter', onclick: () => finish(true) }, t('actionSave')),
        ),
      ),
    );
    editor.focus();
    editor.setCaret(editor.value.length);
  }

  renderView();
  return box;
}
