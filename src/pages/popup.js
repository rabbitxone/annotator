import { api } from '../shared/api.js';
import { h } from '../shared/dom.js';
import { applyI18n, t } from '../shared/i18n.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import {
  deleteAnnotations,
  ensureMigrated,
  getPage,
  getSettings,
  listPages,
  onStoreChange,
  updateAnnotation,
} from '../shared/store.js';
import { hostnameOf, normalizeUrl } from '../shared/url.js';
import { annotationCard } from './components/card.js';
import { privacyNote, settingsPanel } from './components/settings.js';

const RECENT_LIMIT = 30;

const state = {
  tab: 'page',
  query: '',
  tabId: null,
  pageUrl: null,
  page: null,
  pages: [],
  orphans: new Set(),
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
  return [annotation.quote?.exact, annotation.note, page.title, page.url].some((v) => v?.toLowerCase().includes(q));
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

function card(annotation, page, extra) {
  return annotationCard(annotation, page, {
    onSave: (patch) => updateAnnotation(page.url, annotation.id, patch),
    onDelete: () => deleteAnnotations(page.url, [annotation.id]),
    onEditingChange: (editing) => {
      state.editing = editing;
      if (!editing && state.dirty) render();
    },
    ...extra,
  });
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

function renderPageTab() {
  if (!state.pageUrl) {
    return [emptyState('alert', t('emptyUnsupportedTitle'), t('emptyUnsupportedText'))];
  }
  const annotations = [...(state.page?.annotations ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  if (annotations.length === 0) {
    return [emptyState('highlighter', t('emptyPageTitle'), t('emptyPageText'))];
  }
  const visible = annotations.filter((a) => matches(a, state.page));
  if (visible.length === 0) return [emptyState('search', t('emptySearchTitle'), t('emptySearchText'))];
  return visible.map((a) =>
    card(a, state.page, {
      orphan: state.orphans.has(a.id),
      onGo: state.orphans.has(a.id) ? null : () => goToOnThisPage(a.id),
    }),
  );
}

function renderRecentTab() {
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
      site: state.pageUrl ? hostnameOf(state.pageUrl) : null,
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

function render() {
  state.dirty = false;
  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === state.tab));
  }
  const count = state.page?.annotations.length ?? 0;
  document.getElementById('page-count').textContent = count > 0 ? String(count) : '';
  searchWrap.hidden = state.tab === 'settings';
  search.placeholder = t(state.tab === 'recent' ? 'searchAllPlaceholder' : 'searchPagePlaceholder');

  const content = state.tab === 'page' ? renderPageTab() : state.tab === 'recent' ? renderRecentTab() : renderSettingsTab();
  view.replaceChildren(...content);
}

async function refresh() {
  const [page, pages] = await Promise.all([state.pageUrl ? getPage(state.pageUrl) : null, listPages()]);
  state.page = page;
  state.pages = pages;
  if (state.editing) state.dirty = true;
  else render();
}

async function loadOrphans() {
  if (!state.tabId || !state.pageUrl) return;
  try {
    const status = await api.tabs.sendMessage(state.tabId, { type: 'status' }, { frameId: 0 });
    if (status?.url === state.pageUrl) {
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

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;
  state.pageUrl = tab?.url ? normalizeUrl(tab.url) : null;
  await refresh();
  loadOrphans();

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
  document.getElementById('open-dashboard').addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('dashboard.html') });
    window.close();
  });

  onStoreChange(({ settings }) => {
    if (settings) {
      state.settings = settings;
      if (state.tab === 'settings') return;
    }
    refresh();
  });

}

init();
