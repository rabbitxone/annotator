import { api } from '../shared/api.js';
import { copyText } from '../shared/clipboard.js';
import { COLORS, colorById } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import {
  BackupError,
  buildExport,
  byTextPosition,
  CSV_SEPARATORS,
  groupItems,
  localDate,
  parseBackup,
  quoteSnippet,
  toMarkdown,
} from '../shared/exchange.js';
import { exportLabels } from '../shared/export-labels.js';
import { applyI18n, formatNumber, relativeTime, t, uiLanguage } from '../shared/i18n.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import {
  allSnapshotMeta,
  deleteSnapshots,
  exportSnapshots,
  importSnapshots,
  onSnapshotsChange,
  snapshotPageUrl,
} from '../shared/snapshots.js';
import {
  ensureMigrated,
  getSettings,
  importPages,
  listPages,
  onStoreChange,
  setPageNote,
  updateAnnotation,
  updateMany,
} from '../shared/store.js';
import { hostnameOf } from '../shared/url.js';
import { deleteWithUndo } from './components/actions.js';
import { annotationCard, siteAvatar, swatchPicker } from './components/card.js';
import { exportDialog } from './components/export-dialog.js';
import { pageNoteBox } from './components/page-note.js';
import { snapshotBar } from './components/snapshot-bar.js';
import { dataPanel, privacyNote, settingsPanel, shortcutsPanel } from './components/settings.js';
import { toast } from './components/toast.js';
import { whatsNewBanner } from './components/whats-new.js';

const REPO_URL = 'https://github.com/RabbitXOne/annotator';

const state = {
  view: 'all',
  pageUrl: null,
  pages: [],
  snapshots: new Map(),
  settings: null,
  query: '',
  color: null,
  withNoteOnly: false,
  lostOnly: false,
  sort: 'newest',
  grouping: 'recent',
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
    .filter(({ annotation }) => !state.withNoteOnly || annotation.note?.trim())
    .filter(({ annotation }) => !state.lostOnly || annotation.lostAt);
  if (state.sort === 'position') {
    const order = new Map([...state.pages].sort((a, b) => b.updatedAt - a.updatedAt).map((page, i) => [page.url, i]));
    return items.sort((a, b) => order.get(a.page.url) - order.get(b.page.url) || byTextPosition(a.annotation, b.annotation));
  }
  const dir = state.sort === 'oldest' ? 1 : -1;
  return items.sort((a, b) => dir * (a.annotation.createdAt - b.annotation.createdAt));
}

const isFiltered = () => !!(state.query || state.color || state.withNoteOnly || state.lostOnly);

function selectedItems() {
  return allItems().filter(({ annotation, page }) => state.selected.has(selectionKey(page.url, annotation.id)));
}

const dateStamp = () => localDate(Date.now());

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EXPORT_PREFS_KEY = 'annotator-export';

function loadExportPrefs() {
  // Excel reads the list separator from the regional settings: places that write 1,5 use ';'.
  const defaults = {
    scope: 'all',
    format: 'json',
    snapshots: true,
    groupBy: 'page',
    separator: (1.5).toLocaleString(uiLanguage()).includes(',') ? 'semicolon' : 'comma',
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

function saveExportPrefs(prefs) {
  try {
    const { scope, ...rest } = prefs;
    localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(rest));
  } catch {
    // Storage unavailable: the dialog just starts from the defaults next time
  }
}

function snapshotsFor(groups) {
  let count = 0;
  let bytes = 0;
  for (const { page } of groups) {
    for (const s of state.snapshots.get(page.url) ?? []) {
      count++;
      bytes += s.size || 0;
    }
  }
  return { count, bytes };
}

function exportScopes() {
  const make = (id, label, groups) => ({
    id,
    label,
    groups,
    notes: groups.reduce((n, g) => n + g.annotations.length, 0),
    pages: groups.length,
    pageNotes: groups.filter((g) => g.includePageNote !== false && g.page.note?.trim()).length,
    snapshots: snapshotsFor(groups),
  });
  const everything = [...state.pages]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((page) => ({ page, annotations: page.annotations, includePageNote: true }));
  const scopes = [make('all', t('exportScopeAll'), everything)];

  const listView = state.view === 'all' || state.view === 'page';
  if (listView && (state.view === 'page' || isFiltered())) {
    const items = filteredItems();
    const page = state.view === 'page' ? state.pages.find((p) => p.url === state.pageUrl) : null;
    const groups = page
      ? [{ page, annotations: items.map((i) => i.annotation), includePageNote: true }]
      : groupItems(items);
    if (groups.length) scopes.push(make('view', page ? t('exportScopeThisPage') : t('exportScopeFiltered'), groups));
  }
  if (state.selected.size) scopes.push(make('selected', t('exportScopeSelected'), groupItems(selectedItems())));
  return scopes;
}

async function openExport(preferred) {
  const scopes = exportScopes();
  const prefs = loadExportPrefs();
  const has = (id) => scopes.some((s) => s.id === id);
  const first = has(preferred) ? preferred : has('selected') ? 'selected' : has('view') ? 'view' : 'all';
  const result = await exportDialog({ scopes, initial: { ...prefs, scope: first } });
  if (!result) return;
  saveExportPrefs(result.remember);

  const { scope, format, options } = result;
  try {
    const urls = new Set(scope.groups.map((g) => g.page.url));
    const snapshots =
      format === 'json' && options.snapshots ? (await exportSnapshots()).filter((s) => urls.has(s.url)) : [];
    const file = buildExport(format, scope.groups, {
      labels: exportLabels(),
      snapshots,
      separator: CSV_SEPARATORS[options.separator],
      groupBy: options.groupBy,
    });
    const name = format === 'json' && scope.id === 'all' ? 'annotator-backup' : 'annotator';
    download(`${name}-${dateStamp()}.${file.extension}`, file.text, `${file.mime};charset=utf-8`);
    toast(t('toastExported', [formatNumber(scope.notes), t(`export${format[0].toUpperCase()}${format.slice(1)}`)]));
  } catch (err) {
    console.error('Annotator: export failed', err);
    toast(t('toastExportFailed'));
  }
}

async function importBackup(file) {
  try {
    const { pages, snapshots } = parseBackup(await file.text());
    const { added, updated } = await importPages(pages);
    const snapshotsAdded = await importSnapshots(snapshots);
    toast(
      added || updated || snapshotsAdded
        ? t('toastImported', [formatNumber(added), formatNumber(updated), formatNumber(snapshotsAdded)])
        : t('toastImportedNothing'),
    );
  } catch (err) {
    if (!(err instanceof BackupError)) console.error('Annotator: import failed', err);
    toast(t(err instanceof BackupError ? 'toastImportInvalid' : 'toastImportFailed'));
  }
}

function setEditing(editing) {
  state.editing = editing;
  if (!editing && state.dirty) render();
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
  let lostCount = 0;
  for (const { annotation } of scope) {
    counts[annotation.color] = (counts[annotation.color] ?? 0) + 1;
    if (annotation.lostAt) lostCount++;
  }

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
    (lostCount > 0 || state.lostOnly) &&
    pill(t('filterLost'), state.lostOnly, () => setFilter({ lostOnly: !state.lostOnly }), icon('alert', { size: 14 }), lostCount),
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
      [
        ['newest', 'sortNewest'],
        ['oldest', 'sortOldest'],
        ['position', 'sortPosition'],
      ].map(([sort, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(state.sort === sort), onclick: () => setFilter({ sort }) }, t(label)),
      ),
    ),
  );

  $('filters').replaceChildren(pills, right);
}

function renderPagesFilters() {
  $('filters').replaceChildren(
    h('span'),
    h(
      'div',
      { class: 'toolbar-right' },
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': t('groupLabel') },
        [
          ['recent', 'groupRecent'],
          ['domain', 'groupDomain'],
        ].map(([grouping, label]) =>
          h('button', { type: 'button', 'aria-pressed': String(state.grouping === grouping), onclick: () => setFilter({ grouping }) }, t(label)),
        ),
      ),
    ),
  );
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
        query: state.query,
        onGo: () => api.runtime.sendMessage({ type: 'open-and-go', url: page.url, id: annotation.id }).catch(() => { }),
        onCopy: () => copyText(quoteSnippet(annotation, page)),
        onSnapshot: state.snapshots.has(page.url) ? () => openSnapshot(page.url, annotation.id) : null,
        onSave: (patch) => updateAnnotation(page.url, annotation.id, patch),
        onDelete: () => deleteWithUndo([{ annotation, page }]),
        onSelect: (checked) => {
          if (checked) state.selected.add(key);
          else state.selected.delete(key);
          renderBulkBar();
          renderFilters(filteredItems());
        },
        onEditingChange: setEditing,
      });
    }),
  );
}

function openSnapshot(url, annotationId) {
  api.tabs.create({ url: snapshotPageUrl({ url, annotationId }) });
}

function snapshotStats() {
  const urls = new Set(state.pages.map((p) => p.url));
  let count = 0;
  let bytes = 0;
  const unused = [];
  for (const [url, list] of state.snapshots) {
    for (const s of list) {
      count++;
      bytes += s.size || 0;
      if (!urls.has(url)) unused.push(s.id);
    }
  }
  return { count, bytes, unused };
}

function pageRow(page) {
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
      page.note?.trim() && h('span', { class: 'page-row-note', title: t('pageNoteLabel') }, icon('pageNote', { size: 14 })),
      state.snapshots.has(page.url) && h('span', { class: 'page-row-note', title: t('snapshotLabel') }, icon('archive', { size: 14 })),
      h(
        'span',
        { class: 'page-row-colors' },
        colors.map((c) => h('span', { class: 'swatch', style: { '--swatch': colorById(c).swatch } })),
      ),
      h('span', { class: 'badge' }, page.annotations.length ? formatNumber(page.annotations.length) : ''),
      h('span', null, relativeTime(page.updatedAt)),
    ),
  );
}

function renderPagesList() {
  const pages = state.pages
    .filter((page) => !state.query || [page.title, page.url, page.note].some((v) => v?.toLowerCase().includes(state.query)) || page.annotations.some((a) => matchesQuery({ annotation: a, page })))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (pages.length === 0) {
    return state.query ? emptyPanel('search', t('emptySearchTitle'), t('emptySearchText')) : emptyPanel('globe', t('emptyAllTitle'), t('emptyAllText'));
  }

  if (state.grouping !== 'domain') return h('div', { class: 'page-list' }, pages.map(pageRow));

  const groups = new Map();
  for (const page of pages) {
    const host = hostnameOf(page.url);
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(page);
  }
  return h(
    'div',
    { class: 'page-groups' },
    [...groups].map(([host, list]) =>
      h(
        'section',
        { class: 'page-group' },
        h(
          'p',
          { class: 'page-group-title' },
          siteAvatar(list[0].url, 20),
          h('span', null, host),
          h('span', { class: 'badge' }, formatNumber(list.length)),
        ),
        h('div', { class: 'page-list' }, list.map(pageRow)),
      ),
    ),
  );
}

function renderSettings() {
  return h(
    'div',
    { class: 'settings-layout' },
    h('p', { class: 'settings-section-title' }, t('settingsAppearance')),
    settingsPanel(state.settings),
    h('p', { class: 'settings-section-title' }, t('settingsShortcuts')),
    shortcutsPanel(),
    h('p', { class: 'settings-section-title' }, t('settingsData')),
    dataPanel({
      settings: state.settings,
      onExport: () => openExport('all'),
      snapshots: { ...snapshotStats(), unused: snapshotStats().unused.length },
      onCleanSnapshots: async () => {
        const { unused } = snapshotStats();
        await deleteSnapshots(unused);
        toast(t('toastSnapshotsCleaned', formatNumber(unused.length)));
      },
      onImport: importBackup,
    }),
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
  $('export').hidden = state.view === 'settings';

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
  $('filters').hidden = state.view === 'settings';

  if (state.view === 'settings') {
    content.replaceChildren(renderSettings());
  } else if (state.view === 'pages') {
    renderPagesFilters();
    content.replaceChildren(renderPagesList());
  } else {
    const items = filteredItems();
    renderFilters(items);
    const page = state.view === 'page' ? state.pages.find((p) => p.url === state.pageUrl) : null;
    const noteBox =
      page &&
      h(
        'div',
        { class: 'page-extras' },
        pageNoteBox(page.note, {
          query: state.query,
          onSave: (note) => setPageNote(page.url, page.title, note),
          onEditingChange: setEditing,
        }),
        snapshotBar(state.snapshots.get(page.url) ?? [], {
          onOpen: () => openSnapshot(page.url),
          emptyHint: t('snapshotNoneDashboard'),
        }),
      );
    if (state.view === 'page' && !page) {
      content.replaceChildren(emptyPanel('globe', t('emptyPageGoneTitle'), t('emptyPageGoneText')));
    } else if (items.length === 0) {
      content.replaceChildren(
        ...[
          noteBox,
          isFiltered()
            ? emptyPanel('search', t('emptySearchTitle'), t('emptySearchText'))
            : page
              ? emptyPanel('highlighter', t('emptyPageTitle'), t('emptyPageText'))
              : emptyPanel('highlighter', t('emptyAllTitle'), t('emptyAllText')),
        ].filter(Boolean),
      );
    } else {
      content.replaceChildren(...[noteBox, renderCards(items, { showSource: state.view === 'all' })].filter(Boolean));
    }
  }

  const existing = new Set(allItems().map(({ annotation, page }) => selectionKey(page.url, annotation.id)));
  for (const key of state.selected) if (!existing.has(key)) state.selected.delete(key);
  renderBulkBar();
}

async function loadSnapshots() {
  const grouped = new Map();
  for (const meta of await allSnapshotMeta().catch(() => [])) {
    if (!grouped.has(meta.url)) grouped.set(meta.url, []);
    grouped.get(meta.url).push(meta);
  }
  state.snapshots = grouped;
}

async function refresh() {
  [state.pages] = await Promise.all([listPages(), loadSnapshots()]);
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
  whatsNewBanner(state.settings).then((banner) => banner && $('whats-new').append(banner));

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
    const items = selectedItems();
    state.selected.clear();
    await deleteWithUndo(items);
  });
  $('bulk-colors').append(
    swatchPicker(null, async (color) => {
      const items = selectedItems();
      await updateMany(
        items.map(({ annotation, page }) => ({ url: page.url, id: annotation.id })),
        { color },
      );
      toast(t('toastRecolored', formatNumber(items.length)));
    }),
  );
  $('bulk-copy').addEventListener('click', async () => {
    const ok = await copyText(toMarkdown(groupItems(selectedItems()), exportLabels()));
    toast(t(ok ? 'toastCopied' : 'toastCopyFailed'));
  });
  $('bulk-export').addEventListener('click', () => openExport('selected'));
  $('export').addEventListener('click', () => openExport());

  onStoreChange(({ settings }) => {
    if (settings) {
      state.settings = settings;
      if (state.view === 'settings') return;
    }
    refresh();
  });
  onSnapshotsChange(refresh);
}

init();
