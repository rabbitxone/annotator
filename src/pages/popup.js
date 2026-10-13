import { api } from '../shared/api.js';
import { copyText } from '../shared/clipboard.js';
import { h } from '../shared/dom.js';
import { quoteSnippet } from '../shared/exchange.js';
import { applyI18n, t } from '../shared/i18n.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import {
  ensureMigrated,
  getPage,
  getSettings,
  listPages,
  onStoreChange,
  setPageNote,
  updateAnnotation,
} from '../shared/store.js';
import { isFileUrl, isPdfUrl, hostnameOf, normalizeUrl, siteKey, displayAddress, unwrapReaderUrl } from '../shared/url.js';
import { listSnapshots, onSnapshotsChange, snapshotPageUrl } from '../shared/snapshots.js';
import { deleteWithUndo } from './components/actions.js';
import { annotationCard } from './components/card.js';
import { fileAccessNotice } from './components/file-access.js';
import { notice } from './components/notice.js';
import { fileAccessAllowed, mayBeBlockedFile } from '../shared/file-access.js';
import { applyCategories } from '../shared/apply-categories.js';
import { pageNoteBox } from './components/page-note.js';
import { snapshotBar } from './components/snapshot-bar.js';
import { privacyNote, settingsPanel } from './components/settings.js';
import { toast } from './components/toast.js';
import { whatsNewBanner } from './components/whats-new.js';
import { enter } from '../shared/motion.js';

const RECENT_LIMIT = 30;

const state = {
  tab: 'page',
  query: '',
  tabId: null,
  tabTitle: '',
  pageUrl: null,
  page: null,
  pages: null, // every page with notes: read only when the Recent tab is opened
  orphans: new Set(),
  snapshots: [],
  fileAccess: null,
  fileNotice: null,
  whatsNew: null,
  pdf: false,
  tabHidden: false,
  appLike: false,
  settings: null,
  editing: false,
  dirty: false,
};

const view = document.getElementById('view');
const searchWrap = document.getElementById('search-wrap');
const search = document.getElementById('search');

function matches(annotation, page) {
  if (!state.query) return true;
  const q = state.query;
  return [annotation.quote?.exact, annotation.note, page.title, displayAddress(page.url)].some((v) => v?.toLowerCase().includes(q));
}

function emptyState(iconName, title, text) {
  return h(
    'div',
    { class: 'empty' },
    h('span', { class: 'empty-icon' }, icon(iconName, { size: 22 })),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
  );
}

function setEditing(editing) {
  state.editing = editing;
  if (!editing && state.dirty) render();
}

function card(annotation, page, extra) {
  return annotationCard(annotation, page, {
    query: state.query,
    onSave: (patch) => updateAnnotation(page.url, annotation.id, patch),
    onDelete: () => deleteWithUndo([{ annotation, page }]),
    onCopy: () => copyText(quoteSnippet(annotation, page)),
    onEditingChange: setEditing,
    ...extra,
  });
}

function openSnapshot(annotationId) {
  api.tabs.create({ url: snapshotPageUrl({ url: state.pageUrl, annotationId }) });
  window.close();
}

async function loadSnapshots() {
  if (!state.pageUrl) return;
  state.snapshots = await listSnapshots(state.pageUrl).catch(() => []);
  if (!state.editing) render();
}

async function reanchor(id) {
  let result = null;
  try {
    result = await api.tabs.sendMessage(state.tabId, { type: 'reanchor', id }, { frameId: 0 });
  } catch {
    // Content script gone
  }
  if (!result?.ok) {
    toast(t('toastReanchorNoSelection'));
    return;
  }
  toast(t('toastReanchored'));
  state.orphans.delete(id);
  render();
}

async function goToOnThisPage(id) {
  try {
    await api.tabs.sendMessage(state.tabId, { type: 'go-to', id }, { frameId: 0 });
  } finally {
    window.close();
  }
}

async function openElsewhere(page, id) {
  if (page.url === state.pageUrl) return goToOnThisPage(id);
  await api.runtime.sendMessage({ type: 'open-and-go', url: page.url, id }).catch(() => { });
  window.close();
}

// Built once, so a re-render (typing in search, a store change) doesn't play their entrance again
function fileNotice() {
  state.fileNotice ??= fileAccessNotice();
  return state.fileNotice;
}

function renderPageTab() {
  const lead = [state.whatsNew];
  if (!state.pageUrl) {
    const maybeFile = mayBeBlockedFile({ allowed: state.fileAccess, pageUrl: null, tabUrl: state.tabHidden ? null : undefined });
    return [
      maybeFile && fileNotice(),
      ...lead,
      emptyState('alert', t('emptyUnsupportedTitle'), t('emptyUnsupportedText')),
    ].filter(Boolean);
  }
  if (state.pdf) return [...lead, emptyState('alert', t('pdfTitle'), t('pdfText'))].filter(Boolean);
  // Some browsers show a blocked file's address; the page just never answers.
  if (isFileUrl(state.pageUrl) && state.fileAccess === false) lead.unshift(fileNotice());
  const page = state.page ?? { url: state.pageUrl, title: state.tabTitle, annotations: [] };
  const noteBox = pageNoteBox(page.note, {
    query: state.query,
    onSave: (note) => setPageNote(page.url, page.title || state.tabTitle, note),
    onEditingChange: setEditing,
  });
  state.readerHint ??= state.inReader ? notice({ iconName: 'info', text: t('readerViewHint') }) : null;
  const readerHint = state.readerHint;
  const snapshot = snapshotBar(state.snapshots, {
    onOpen: () => openSnapshot(),
    onSave: state.inReader ? null : async () => {
      const result = await api.runtime
        .sendMessage({ type: 'tab-command', tabId: state.tabId, message: { type: 'save-snapshot-now' } })
        .catch(() => null);
      if (result?.ok) await loadSnapshots();
      return result;
    },
  });
  const annotations = [...page.annotations].sort((a, b) => b.createdAt - a.createdAt);
  if (annotations.length === 0) {
    return [...lead, readerHint, noteBox, snapshot, emptyState('highlighter', t('emptyPageTitle'), t('emptyPageText'))].filter(Boolean);
  }
  const visible = annotations.filter((a) => matches(a, page));
  if (visible.length === 0) return [...lead, readerHint, noteBox, snapshot, emptyState('search', t('emptySearchTitle'), t('emptySearchText'))].filter(Boolean);
  return [
    ...lead,
    readerHint,
    noteBox,
    snapshot,
    ...visible.map((a) =>
      card(a, page, {
        orphan: state.orphans.has(a.id),
        onGo: state.orphans.has(a.id) || state.inReader ? null : () => goToOnThisPage(a.id),
        onReanchor: () => reanchor(a.id),
        onSnapshot: state.snapshots.length ? () => openSnapshot(a.id) : null,
      }),
    ),
  ].filter(Boolean);
}

function renderRecentTab() {
  if (!state.pages) {
    loadPages();
    return [h('p', { class: 'popup-loading' }, t('listLoading'))];
  }
  const all = state.pages
    .flatMap((page) => page.annotations.map((annotation) => ({ annotation, page })))
    .filter(({ annotation, page }) => matches(annotation, page))
    .sort((a, b) => Math.max(b.annotation.updatedAt, b.annotation.createdAt) - Math.max(a.annotation.updatedAt, a.annotation.createdAt))
    .slice(0, RECENT_LIMIT);

  if (all.length === 0) {
    return [
      state.query
        ? emptyState('search', t('emptySearchTitle'), t('emptySearchText'))
        : emptyState('note', t('emptyAllTitle'), t('emptyAllText')),
    ];
  }
  return all.map(({ annotation, page }) =>
    card(annotation, page, {
      showSource: true,
      goLabel: t('actionOpen'),
      goIcon: 'open',
      onGo: () => openElsewhere(page, annotation.id),
    }),
  );
}

function renderSettingsTab() {
  return [
    settingsPanel(state.settings, {
      compact: true,
      fileAccess: state.fileAccess,
      site: state.pageUrl ? siteKey(state.pageUrl) : null,
      siteName: state.pageUrl ? (isFileUrl(state.pageUrl) ? t('siteLocalFiles') : hostnameOf(state.pageUrl)) : null,
      siteAppLike: state.appLike,
    }),
    privacyNote(),
    h(
      'p',
      { class: 'popup-footer-note' },
      h('span', null, 'Annotator'),
      h('span', null, `v${api.runtime.getManifest().version}`),
    ),
  ];
}

let renderedTab = null;

function render() {
  state.dirty = false;
  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === state.tab));
  }
  const count = state.page?.annotations.length ?? 0;
  document.getElementById('page-count').textContent = count > 0 ? String(count) : '';
  searchWrap.hidden = state.tab === 'settings' || (state.tab === 'page' && (!state.pageUrl || state.pdf));
  search.placeholder = t(state.tab === 'recent' ? 'searchAllPlaceholder' : 'searchPagePlaceholder');

  const content = state.tab === 'page' ? renderPageTab() : state.tab === 'recent' ? renderRecentTab() : renderSettingsTab();
  view.replaceChildren(...content);
  if (renderedTab !== null && renderedTab !== state.tab) {
    view.scrollTop = 0;
    enter(view, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 200);
  }
  renderedTab = state.tab;
}

async function refresh() {
  state.page = state.pageUrl ? await getPage(state.pageUrl) : null;
  if (state.editing) state.dirty = true;
  else render();
}

let loadingPages = false;
async function loadPages() {
  if (state.pages || loadingPages) return;
  loadingPages = true;
  state.pages = await listPages();
  loadingPages = false;
  if (!state.editing) render();
}

// Keep what is already loaded current without reading every page again
function applyPageChanges(changes) {
  if (state.pageUrl && changes.has(state.pageUrl)) state.page = changes.get(state.pageUrl) ?? null;
  if (!state.pages) return;
  const byUrl = new Map(state.pages.map((p) => [p.url, p]));
  for (const [url, page] of changes) {
    if (page && Array.isArray(page.annotations) && (page.annotations.length > 0 || page.note?.trim())) byUrl.set(url, page);
    else byUrl.delete(url);
  }
  state.pages = [...byUrl.values()];
}

async function loadOrphans() {
  if (!state.tabId || !state.pageUrl) return;
  try {
    const status = await api.tabs.sendMessage(state.tabId, { type: 'status' }, { frameId: 0 });
    if (status?.pdf) {
      state.pdf = true;
      document.getElementById('open-panel').hidden = true;
      if (!state.editing) render();
    } else if (status?.url === state.pageUrl) {
      // The page answered, so the browser lets us in, whatever its setting says
      if (isFileUrl(state.pageUrl) && state.fileAccess === false) {
        state.fileAccess = true;
        document.getElementById('open-panel').hidden = state.inReader;
      }
      state.orphans = new Set(status.orphans);
      state.appLike = !!status.appLike;
      if (!state.editing) render();
    }
  } catch {
    // No content script on this tab (e.g. opened before install)
  }
}

async function init() {
  applyI18n();
  hydrateIcons();

  await ensureMigrated().catch(() => { });
  state.settings = await getSettings();
  applyCategories(state.settings);

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;
  state.tabTitle = tab?.title ?? '';
  state.tabHidden = !!tab && tab.url == null;
  state.fileAccess = await fileAccessAllowed();
  state.inReader = unwrapReaderUrl(tab?.url) !== tab?.url;
  state.pageUrl = tab?.url ? normalizeUrl(unwrapReaderUrl(tab.url)) : null;
  state.pdf = isPdfUrl(state.pageUrl);
  document.getElementById('open-panel').hidden =
    !state.pageUrl || state.inReader || state.pdf || (isFileUrl(state.pageUrl) && state.fileAccess === false);
  state.whatsNew = await whatsNewBanner(state.settings, { compact: true, onDismiss: () => (state.whatsNew = null) });
  await refresh();
  loadOrphans();
  loadSnapshots();
  onSnapshotsChange(loadSnapshots);

  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  }
  search.addEventListener('input', () => {
    state.query = search.value.trim().toLowerCase();
    render();
  });
  document.getElementById('open-panel').addEventListener('click', async () => {
    await api.runtime
      .sendMessage({ type: 'tab-command', tabId: state.tabId, message: { type: 'toggle-panel' } })
      .catch(() => { });
    window.close();
  });
  document.getElementById('open-dashboard').addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('dashboard.html') });
    window.close();
  });

  onStoreChange(({ pages, settings }) => {
    if (settings) {
      state.settings = settings;
      applyCategories(settings);
    }
    if (pages.size) applyPageChanges(pages);
    if (!pages.size && state.tab === 'settings') return;
    if (state.editing) state.dirty = true;
    else render();
  });

}

init();
