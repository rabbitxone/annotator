import { colorById } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import { formatNumber, relativeTime, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { renderMarkdown } from '../shared/markdown.js';

const NOTE_SAVE_DELAY = 800;

export function createPanel({ shadowRoot, handlers }) {
  let el = null;
  let model = { items: [], orphans: [], pageNote: '', snapshot: null };
  let refs = null;
  let noteTimer = null;
  let savedNote = '';

  function iconButton(name, label, onclick) {
    return h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick }, icon(name, { size: 16 }));
  }

  function confirmIcon(button, name) {
    button.replaceChildren(icon('tick', { size: 16 }));
    setTimeout(() => button.replaceChildren(icon(name, { size: 16 })), 1500);
  }

  function saveNote() {
    clearTimeout(noteTimer);
    if (!refs || refs.note.value === savedNote) return;
    savedNote = refs.note.value;
    handlers.onPageNoteSave(savedNote);
    refs.noteState.textContent = t('panelSaved');
    setTimeout(() => refs && (refs.noteState.textContent = ''), 1500);
  }

  function autosize() {
    refs.note.style.height = 'auto';
    refs.note.style.height = `${Math.min(refs.note.scrollHeight, 200)}px`;
  }

  function build() {
    const note = h('textarea', {
      class: 'panel-note',
      rows: 2,
      placeholder: t('pageNotePlaceholder'),
      'aria-label': t('pageNoteLabel'),
      spellcheck: 'true',
    });
    note.addEventListener('input', () => {
      autosize();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(saveNote, NOTE_SAVE_DELAY);
    });
    note.addEventListener('blur', saveNote);
    note.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveNote();
        note.blur();
      }
    });

    const copyAll = iconButton('copy', t('panelCopyAll'), async () => {
      if (await handlers.onCopyAll()) confirmIcon(copyAll, 'copy');
    });

    let statusTimer = null;
    const showStatus = (key) => {
      clearTimeout(statusTimer);
      refs.snapshotText.textContent = t(key);
      refs.snapshotText.dataset.status = '';
      statusTimer = setTimeout(() => refs && render(), 2500);
    };
    const saveSnapshot = h(
      'button',
      {
        class: 'btn-outline btn-xs',
        type: 'button',
        onclick: async () => {
          saveSnapshot.disabled = true;
          const result = await handlers.onSaveSnapshot();
          saveSnapshot.disabled = false;
          if (refs) showStatus(result?.unchanged ? 'snapshotUnchanged' : result?.ok ? 'panelSaved' : 'snapshotFailed');
        },
        title: t('snapshotSave'),
      },
      icon('camera', { size: 14 }),
      t('actionSave'),
    );
    const openSnapshot = h(
      'button',
      { class: 'btn-outline btn-xs', type: 'button', onclick: () => handlers.onOpenSnapshot() },
      icon('archive', { size: 14 }),
      t('snapshotOpen'),
    );

    refs = {
      snapshotText: h('span', { class: 'panel-snapshot-text', 'aria-live': 'polite' }),
      openSnapshot,
      note,
      noteState: h('span', { class: 'panel-hint', 'aria-live': 'polite' }),
      count: h('span', { class: 'panel-count' }),
      list: h('div', { class: 'panel-list-wrap' }),
    };

    el = h(
      'aside',
      { class: 'layer panel', role: 'complementary', 'aria-label': t('panelTitle') },
      h(
        'header',
        { class: 'panel-head' },
        h('div', { class: 'panel-title' }, icon('panel', { size: 16 }), h('span', null, t('panelTitle')), refs.count),
        h('div', { class: 'head-actions' }, copyAll, iconButton('close', t('actionClose'), () => close())),
      ),
      h(
        'div',
        { class: 'panel-body' },
        h(
          'section',
          { class: 'panel-section' },
          h('p', { class: 'panel-label' }, icon('pageNote', { size: 14 }), t('pageNoteLabel'), refs.noteState),
          note,
        ),
        h(
          'section',
          { class: 'panel-section' },
          h('p', { class: 'panel-label' }, icon('archive', { size: 14 }), t('snapshotLabel')),
          h('div', { class: 'panel-snapshot' }, refs.snapshotText, h('div', { class: 'panel-snapshot-actions' }, openSnapshot, saveSnapshot)),
        ),
        refs.list,
      ),
    );

    // Keep the page selection alive so "pin to selection" can read it.
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, .panel-item')) e.preventDefault();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  function itemBody(annotation) {
    const note = annotation.note?.trim()
      ? h('div', { class: 'panel-md', onclick: (e) => e.target.closest('a') && e.stopPropagation() }, renderMarkdown(annotation.note))
      : null;
    return [h('p', { class: 'panel-quote' }, annotation.quote?.exact ?? ''), note];
  }

  function item(annotation) {
    const go = () => handlers.onGo(annotation.id);
    return h(
      'li',
      {
        class: 'panel-item',
        tabindex: '0',
        role: 'button',
        style: { '--swatch': colorById(annotation.color).swatch },
        onclick: go,
        onkeydown: (e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            go();
          }
        },
      },
      itemBody(annotation),
    );
  }

  function orphanItem(annotation, hint) {
    const pin = h(
      'button',
      {
        class: 'btn-outline btn-xs',
        type: 'button',
        onclick: () => {
          const result = handlers.onReanchor(annotation.id);
          if (result?.ok) return;
          hint.dataset.alert = '';
          setTimeout(() => delete hint.dataset.alert, 2500);
        },
      },
      icon('pin', { size: 14 }),
      t('actionReanchor'),
    );
    return h(
      'li',
      { class: 'panel-item orphan', style: { '--swatch': colorById(annotation.color).swatch } },
      itemBody(annotation),
      h('div', { class: 'panel-item-actions' }, pin),
    );
  }

  function render() {
    const { items, orphans, pageNote, snapshot } = model;
    const total = items.length + orphans.length;
    refs.count.textContent = total ? formatNumber(total) : '';
    delete refs.snapshotText.dataset.status;
    refs.snapshotText.textContent = snapshot?.count
      ? t('snapshotSummary', [relativeTime(snapshot.latest.capturedAt), formatNumber(snapshot.count)])
      : t('snapshotNone');
    refs.openSnapshot.hidden = !snapshot?.count;

    const editing = refs.note.getRootNode().activeElement === refs.note || refs.note.value !== savedNote;
    if (!editing && pageNote !== savedNote) {
      refs.note.value = pageNote;
      savedNote = pageNote;
      autosize();
    }

    const hint = h('p', { class: 'panel-hint' }, t('panelOrphansHint'));
    const sections = [];
    if (items.length) sections.push(h('ol', { class: 'panel-list' }, items.map(item)));
    else if (!orphans.length) sections.push(h('p', { class: 'panel-empty' }, t('panelEmpty')));
    if (orphans.length) {
      sections.push(
        h(
          'section',
          { class: 'panel-section panel-orphans' },
          h('p', { class: 'panel-label warn' }, icon('alert', { size: 14 }), t('panelOrphansTitle', formatNumber(orphans.length))),
          hint,
          h('ol', { class: 'panel-list' }, orphans.map((a) => orphanItem(a, hint))),
        ),
      );
    }
    refs.list.replaceChildren(...sections);
  }

  function open() {
    if (el) return;
    build();
    savedNote = model.pageNote;
    refs.note.value = model.pageNote;
    shadowRoot().append(el);
    autosize();
    render();
  }

  function slideOut(panel) {
    panel.style.pointerEvents = 'none';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.remove();
      return;
    }
    panel.dataset.closing = '';
    const finish = () => panel.remove();
    panel.addEventListener('animationend', (e) => e.target === panel && finish());
    setTimeout(finish, 250);
  }

  function close() {
    if (!el) return;
    saveNote();
    slideOut(el);
    el = null;
    refs = null;
    handlers.onClose?.();
  }

  return {
    open,
    close,
    toggle: () => (el ? close() : open()),
    update(next) {
      model = next;
      if (el) render();
    },
    get isOpen() {
      return !!el;
    },
  };
}
