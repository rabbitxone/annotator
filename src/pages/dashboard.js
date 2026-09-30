import { api } from '../shared/api.js';
import { COLORS, colorById } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import { applyI18n, formatNumber, relativeTime, t } from '../shared/i18n.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import {
  deleteAnnotations,
  deleteMany,
  ensureMigrated,
  getSettings,
  listPages,
  onStoreChange,
  updateAnnotation,
} from '../shared/store.js';
import { hostnameOf } from '../shared/url.js';
import { annotationCard, siteAvatar } from './components/card.js';
import { confirmDialog } from './components/confirm.js';
import { privacyNote, settingsPanel } from './components/settings.js';

const REPO_URL = 'https://github.com/RabbitXOne/annotator';

const state = {
  view: 'all',
  pageUrl: null,
  pages: [],
  settings: null,
  query: '',
  color: null,
  withNoteOnly: false,
  sort: 'newest',
  selected: new Set(),
  editing: false,
  dirty: false,
};

const $ = (id) => document.getElementById(id);
const selectionKey = (url, id) => `${url}\n${id}`;

function readRoute() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('page=')) {
    state.view = 'page';
    state.pageUrl = hash.slice(5);
  } else {
    state.view = ['pages', 'settings'].includes(hash) ? hash : 'all';
    state.pageUrl = null;
  }
  state.selected.clear();
}

const pageHref = (url) => '#page=' + encodeURIComponent(url);

function allItems() {
  return state.pages.flatMap((page) => page.annotations.map((annotation) => ({ annotation, page })));
}

function scopeItems() {
  if (state.view === 'page') {
    const page = state.pages.find((p) => p.url === state.pageUrl);
    return page ? page.annotations.map((annotation) => ({ annotation, page })) : [];
  }
  return allItems();
}

function matchesQuery({ annotation, page }) {
  if (!state.query) return true;
  return [annotation.quote?.exact, annotation.note, page.title, page.url].some((v) => v?.toLowerCase().includes(state.query));
}

function filteredItems() {
  const items = scopeItems()
    .filter(matchesQuery)
    .filter(({ annotation }) => !state.color || annotation.color === state.color)
    .filter(({ annotation }) => !state.withNoteOnly || annotation.note?.trim());
  const dir = state.sort === 'oldest' ? 1 : -1;
  return items.sort((a, b) => dir * (a.annotation.createdAt - b.annotation.createdAt));
}

function pill(label, pressed, onClick, lead, count) {
  return h(
    'button',
    { class: 'pill', type: 'button', 'aria-pressed': String(pressed), onclick: onClick },
    lead,
    label,
    count != null && h('span', { class: 'pill-count' }, formatNumber(count)),
  );
}

function renderFilters(visible) {
  const scope = scopeItems();
  const counts = Object.fromEntries(COLORS.map((c) => [c.id, 0]));
  for (const { annotation } of scope) counts[annotation.color] = (counts[annotation.color] ?? 0) + 1;

  const pills = h(
    'div',
    { class: 'pills', role: 'group', 'aria-label': t('filterLabel') },
    pill(t('filterAllColors'), state.color == null, () => setFilter({ color: null })),
    COLORS.filter((c) => counts[c.id] > 0).map((c) =>
      pill(
        t(`color_${c.id}`),
        state.color === c.id,
        () => setFilter({ color: state.color === c.id ? null : c.id }),
        h('span', { class: 'swatch', style: { '--swatch': c.swatch } }),
        counts[c.id],
      ),
    ),
    pill(t('filterWithNote'), state.withNoteOnly, () => setFilter({ withNoteOnly: !state.withNoteOnly }), icon('note', { size: 14 })),
  );

  const visibleKeys = visible.map(({ annotation, page }) => selectionKey(page.url, annotation.id));
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => state.selected.has(k));

  const right = h(
    'div',
    { class: 'toolbar-right' },
    visible.length > 0 &&
    h(
      'label',
      { class: 'select-all' },
      h('input', {
        class: 'checkbox',
        type: 'checkbox',
        checked: allSelected,
        onchange: (e) => {
          for (const key of visibleKeys) {
            if (e.target.checked) state.selected.add(key);
            else state.selected.delete(key);
          }
          render();
        },
      }),
      t('actionSelectAll'),
    ),
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': t('sortLabel') },
      ['newest', 'oldest'].map((sort) =>
        h(
          'button',
          { type: 'button', 'aria-pressed': String(state.sort === sort), onclick: () => setFilter({ sort }) },
          t(sort === 'newest' ? 'sortNewest' : 'sortOldest'),
        ),
      ),
    ),
  );

  $('filters').replaceChildren(pills, right);
}

function setFilter(patch) {
  Object.assign(state, patch);
  render();
}

function emptyPanel(iconName, title, text) {
  return h(
    'div',
    { class: 'empty empty-panel' },
    h('span', { class: 'empty-icon' }, icon(iconName, { size: 22 })),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
  );
}

function renderCards(items, { showSource }) {
  return h(
    'div',
    { class: 'grid' },
    items.map(({ annotation, page }) => {
      const key = selectionKey(page.url, annotation.id);
      return annotationCard(annotation, page, {
        showSource,
        goLabel: t('actionOpen'),
        goIcon: 'open',
        selectable: true,
        selected: state.selected.has(key),
        onGo: () => api.runtime.sendMessage({ type: 'open-and-go', url: page.url, id: annotation.id }).catch(() => { }),
        onSave: (patch) => updateAnnotation(page.url, annotation.id, patch),
        onDelete: () => deleteAnnotations(page.url, [annotation.id]),
        onSelect: (checked) => {
          if (checked) state.selected.add(key);
          else state.selected.delete(key);
          renderBulkBar();
          renderFilters(filteredItems());
        },
        onEditingChange: (editing) => {
          state.editing = editing;
          if (!editing && state.dirty) render();
        },
      });
    }),
  );
}

function renderPagesList() {
  const pages = state.pages
    .filter((page) => !state.query || [page.title, page.url].some((v) => v?.toLowerCase().includes(state.query)) || page.annotations.some((a) => matchesQuery({ annotation: a, page })))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (pages.length === 0) {
    return state.query ? emptyPanel('search', t('emptySearchTitle'), t('emptySearchText')) : emptyPanel('globe', t('emptyAllTitle'), t('emptyAllText'));
  }

  return h(
    'div',
    { class: 'page-list' },
    pages.map((page) => {
      const colors = [...new Set(page.annotations.map((a) => a.color))];
      return h(
        'a',
        { class: 'page-row', href: pageHref(page.url) },
        siteAvatar(page.url, 36),
        h(
          'div',
          { class: 'page-row-text' },
          h('p', { class: 'page-row-title' }, page.title || hostnameOf(page.url)),
          h('p', { class: 'page-row-sub' }, page.url),
        ),
        h(
          'div',
          { class: 'page-row-meta' },
          h(
            'span',
            { class: 'page-row-colors' },
            colors.map((c) => h('span', { class: 'swatch', style: { '--swatch': colorById(c).swatch } })),
          ),
          h('span', { class: 'badge' }, formatNumber(page.annotations.length)),
          h('span', null, relativeTime(page.updatedAt)),
        ),
      );
    }),
  );
}

function renderSettings() {
  return h(
    'div',
    { class: 'settings-layout' },
    h('p', { class: 'settings-section-title' }, t('settingsAppearance')),
    settingsPanel(state.settings),
    privacyNote(),
    h(
      'div',
      { class: 'about' },
      h(
        'div',
        null,
        h('p', { class: 'setting-label' }, `Annotator ${api.runtime.getManifest().version}`),
        h('p', { class: 'setting-sublabel' }, t('aboutText')),
      ),
      h(
        'div',
        { class: 'about-links' },
        h('a', { class: 'btn btn-outline btn-sm', href: `${REPO_URL}/blob/main/PRIVACY.md`, target: '_blank', rel: 'noopener' }, t('aboutPrivacy')),
        h('a', { class: 'btn btn-outline btn-sm', href: REPO_URL, target: '_blank', rel: 'noopener' }, 'GitHub'),
      ),
    ),
  );
}

let bulkHideTimer = null;
function renderBulkBar() {
  const count = state.selected.size;
  const bar = $('bulk-bar');
  clearTimeout(bulkHideTimer);
  if (count > 0) {
    $('bulk-count').textContent = t('bulkSelected', formatNumber(count));
    bar.hidden = false;
    bar.inert = false;
    requestAnimationFrame(() => requestAnimationFrame(() => bar.toggleAttribute('data-open', state.selected.size > 0)));
  } else {
    bar.removeAttribute('data-open');
    bar.inert = true;
    bulkHideTimer = setTimeout(() => (bar.hidden = true), 200);
  }
}

function renderHeader() {
  const title = $('view-title');
  const subtitle = $('view-subtitle');
  $('back').hidden = state.view !== 'page';
  $('sidebar-privacy').hidden = state.view === 'settings';
  $('search-wrap').hidden = state.view === 'settings';

  if (state.view === 'page') {
    const page = state.pages.find((p) => p.url === state.pageUrl);
    title.textContent = page?.title || hostnameOf(state.pageUrl);
    subtitle.replaceChildren(h('a', { href: state.pageUrl, target: '_blank', rel: 'noopener' }, state.pageUrl));
    document.title = `${title.textContent} · Annotator`;
  } else {
    const key = { all: 'navAll', pages: 'navPages', settings: 'navSettings' }[state.view];
    title.textContent = t(key);
    subtitle.textContent = t(`${key}Subtitle`);
    document.title = `${t(key)} · Annotator`;
  }

  for (const item of document.querySelectorAll('.nav-item')) {
    const current = item.dataset.view === state.view || (state.view === 'page' && item.dataset.view === 'pages');
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  const total = allItems().length;
  $('nav-count-all').textContent = total ? formatNumber(total) : '';
  $('nav-count-pages').textContent = state.pages.length ? formatNumber(state.pages.length) : '';
}

function render() {
  state.dirty = false;
  renderHeader();

  const content = $('content');
  const listView = state.view === 'all' || state.view === 'page';
  $('filters').hidden = !listView;

  if (state.view === 'settings') {
    content.replaceChildren(renderSettings());
  } else if (state.view === 'pages') {
    content.replaceChildren(renderPagesList());
  } else {
    const items = filteredItems();
    renderFilters(items);
    if (state.view === 'page' && scopeItems().length === 0) {
      content.replaceChildren(emptyPanel('globe', t('emptyPageGoneTitle'), t('emptyPageGoneText')));
    } else if (items.length === 0) {
      const filtered = state.query || state.color || state.withNoteOnly;
      content.replaceChildren(
        filtered
          ? emptyPanel('search', t('emptySearchTitle'), t('emptySearchText'))
          : emptyPanel('highlighter', t('emptyAllTitle'), t('emptyAllText')),
      );
    } else {
      content.replaceChildren(renderCards(items, { showSource: state.view === 'all' }));
    }
  }

  const existing = new Set(allItems().map(({ annotation, page }) => selectionKey(page.url, annotation.id)));
  for (const key of state.selected) if (!existing.has(key)) state.selected.delete(key);
  renderBulkBar();
}

async function refresh() {
  state.pages = await listPages();
  if (state.editing) state.dirty = true;
  else render();
}

async function init() {
  applyI18n();
  hydrateIcons();
  $('sidebar-privacy').append(privacyNote());

  await ensureMigrated().catch((err) => console.error('Annotator: migration failed', err));
  state.settings = await getSettings();
  readRoute();
  await refresh();

  window.addEventListener('hashchange', () => {
    readRoute();
    state.editing = false;
    render();
    window.scrollTo({ top: 0 });
  });

  $('search').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
  $('back').addEventListener('click', () => {
    location.hash = 'pages';
  });
  $('bulk-clear').addEventListener('click', () => {
    state.selected.clear();
    render();
  });
  $('bulk-delete').addEventListener('click', async () => {
    const count = state.selected.size;
    const ok = await confirmDialog({
      title: t('bulkDeleteTitle', formatNumber(count)),
      text: t('bulkDeleteText'),
      confirmLabel: t('actionDelete'),
    });
    if (!ok) return;
    const items = [...state.selected].map((key) => {
      const [url, id] = key.split('\n');
      return { url, id };
    });
    state.selected.clear();
    await deleteMany(items);
  });

  onStoreChange(({ settings }) => {
    if (settings) {
      state.settings = settings;
      if (state.view === 'settings') return;
    }
    refresh();
  });
}

init();
