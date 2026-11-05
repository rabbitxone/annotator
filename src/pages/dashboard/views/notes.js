import { copyText } from '../../../shared/clipboard.js';
import { colorById, getCategories } from '../../../shared/constants.js';
import { h } from '../../../shared/dom.js';
import { quoteSnippet } from '../../../shared/exchange.js';
import { formatNumber, plural, t } from '../../../shared/i18n.js';
import { icon } from '../../../shared/icons.js';
import { setPageNote, updateAnnotation } from '../../../shared/store.js';
import { confirmAndDelete, openNote } from '../../components/actions.js';
import { annotationCard } from '../../components/card.js';
import { emptyState } from '../../components/empty-state.js';
import { masonry } from '../../components/masonry.js';
import { pageNoteBox } from '../../components/page-note.js';
import { segmented } from '../../components/segmented.js';
import { renderBulkBar } from '../bulk-bar.js';
import { moreButton, rewatch, stopWatching, watchFooter } from '../load-more.js';
import { $, currentPage, filteredItems, isFiltered, PAGE_SIZE, render, scopeItems, selectionKey, setEditing, setFilter, state } from '../state.js';

const SORTS = [
  ['newest', 'sortNewest'],
  ['oldest', 'sortOldest'],
  ['position', 'sortPosition'],
];

let lastItems = [];

function pill(label, pressed, onClick, lead, count) {
  return h(
    'button',
    { class: 'pill', type: 'button', 'aria-pressed': String(pressed), onclick: onClick },
    lead,
    label,
    count != null && h('span', { class: 'pill-count' }, formatNumber(count)),
  );
}

function colorPills() {
  const counts = {};
  let lostCount = 0;
  for (const { annotation } of scopeItems()) {
    counts[annotation.color] = (counts[annotation.color] ?? 0) + 1;
    if (annotation.lostAt) lostCount++;
  }
  const known = new Set(getCategories().map((c) => c.id));
  const inScope = [...getCategories(), ...Object.keys(counts).filter((id) => !known.has(id)).map(colorById)].filter((c) => counts[c.id] > 0);

  return h(
    'div',
    { class: 'pills', role: 'group', 'aria-label': t('filterLabel') },
    pill(t('filterAllColors'), state.color == null, () => setFilter({ color: null })),
    inScope.map((c) =>
      pill(
        c.name,
        state.color === c.id,
        () => setFilter({ color: state.color === c.id ? null : c.id }),
        h('span', { class: 'swatch', style: { '--swatch': c.swatch } }),
        counts[c.id],
      ),
    ),
    pill(t('filterWithNote'), state.withNoteOnly, () => setFilter({ withNoteOnly: !state.withNoteOnly }), icon('note', { size: 14 })),
    (lostCount > 0 || state.lostOnly) &&
    pill(t('filterLost'), state.lostOnly, () => setFilter({ lostOnly: !state.lostOnly }), icon('alert', { size: 14 }), lostCount),
  );
}

function selectAll(visible) {
  const keys = visible.map(({ annotation, page }) => selectionKey(page.url, annotation.id));
  const allSelected = keys.length > 0 && keys.every((k) => state.selected.has(k));
  return h(
    'label',
    { class: 'select-all' },
    h('input', {
      class: 'checkbox',
      type: 'checkbox',
      checked: allSelected,
      onchange: (e) => {
        for (const key of keys) {
          if (e.target.checked) state.selected.add(key);
          else state.selected.delete(key);
        }
        render();
      },
    }),
    visible.length > state.limit ? t('actionSelectAllCount', formatNumber(visible.length)) : t('actionSelectAll'),
  );
}

function renderFilters(visible) {
  $('filters').replaceChildren(
    colorPills(),
    h(
      'div',
      { class: 'toolbar-sub' },
      h(
        'div',
        { class: 'toolbar-left' },
        visible.length > 0 && selectAll(visible),
        h('span', { class: 'result-count' }, plural('noteCount', visible.length)),
      ),
      segmented(
        SORTS.map(([value, label]) => ({ value, label: t(label) })),
        state.sort,
        (sort) => setFilter({ sort }),
        { ariaLabel: t('sortLabel') },
      ),
    ),
  );
}

function cardFor({ annotation, page }, showSource) {
  const key = selectionKey(page.url, annotation.id);
  return annotationCard(annotation, page, {
    showSource,
    goLabel: t('actionOpen'),
    goIcon: 'open',
    selectable: true,
    selected: state.selected.has(key),
    query: state.query,
    onGo: () => openNote(page, annotation.id),
    onCopy: () => copyText(quoteSnippet(annotation, page)),
    onSave: (patch) => updateAnnotation(page.url, annotation.id, patch),
    onDelete: () => confirmAndDelete([{ annotation, page }]),
    onSelect: (checked) => {
      if (checked) state.selected.add(key);
      else state.selected.delete(key);
      renderBulkBar();
      renderFilters(lastItems);
    },
    onEditingChange: setEditing,
  });
}

function cardGrid(items, { showSource }) {
  const grid = masonry(h('div', { class: 'grid' }));
  const footer = h('div', { class: 'list-more' });
  let shown = 0;

  function showNext() {
    const next = items.slice(shown, shown + (shown === 0 ? state.limit : PAGE_SIZE));
    grid.append(...next.map((item) => cardFor(item, showSource)));
    shown += next.length;
    state.limit = Math.max(PAGE_SIZE, shown);
    const remaining = items.length - shown;
    footer.hidden = remaining <= 0;
    footer.replaceChildren(...(remaining > 0 ? [moreButton(remaining, showNext)] : []));
    if (remaining > 0 && shown > next.length) rewatch(footer);
  }

  stopWatching();
  showNext();
  if (!footer.hidden) watchFooter(footer, showNext);
  return [grid, footer];
}

function emptyFor(page) {
  if (isFiltered()) return emptyState('search', t('emptySearchTitle'), t('emptySearchText'), { panel: true });
  return page
    ? emptyState('highlighter', t('emptyPageTitle'), t('emptyPageText'), { panel: true })
    : emptyState('highlighter', t('emptyAllTitle'), t('emptyAllText'), { panel: true });
}

export function notesView() {
  const items = filteredItems();
  lastItems = items;
  renderFilters(items);

  const page = state.view === 'page' ? currentPage() : null;
  if (state.view === 'page' && !page) return [emptyState('globe', t('emptyPageGoneTitle'), t('emptyPageGoneText'), { panel: true })];

  const noteBox =
    page &&
    pageNoteBox(page.note, {
      query: state.query,
      onSave: (note) => setPageNote(page.url, page.title, note),
      onEditingChange: setEditing,
    });
  if (items.length === 0) return [noteBox, emptyFor(page)].filter(Boolean);
  return [noteBox, ...cardGrid(items, { showSource: state.view === 'all' })].filter(Boolean);
}
