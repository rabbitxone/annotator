import { applyCategories } from '../../shared/apply-categories.js';
import { h } from '../../shared/dom.js';
import { applyI18n } from '../../shared/i18n.js';
import { hydrateIcons } from '../../shared/icons.js';
import { enter } from '../../shared/motion.js';
import { loadSupportPrompt } from '../../shared/support-prompt.js';
import { installTooltips } from '../../shared/tooltip.js';
import { ensureMigrated, getSettings, listPages, onStoreChange } from '../../shared/store.js';
import { fileAccessAllowed } from '../../shared/file-access.js';
import { aboutLinks, versionLabel } from '../components/about-links.js';
import { privacyNote } from '../components/settings.js';
import { undoLast } from '../components/toast.js';
import { whatsNewBanner } from '../components/whats-new.js';
import { installBulkBar, renderBulkBar } from './bulk-bar.js';
import { openExport } from './export.js';
import { renderHeader, renderNotices } from './header.js';
import { readRoute } from './router.js';
import { $, applyPageChanges, onRender, pruneSelection, resetLimits, state } from './state.js';
import { notesView } from './views/notes.js';
import { pagesView } from './views/pages.js';
import { settingsView } from './views/settings.js';

const VIEWS = { all: notesView, page: notesView, pages: pagesView, settings: settingsView };

function render() {
  state.dirty = false;
  renderHeader();
  $('filters').hidden = state.view === 'settings';
  $('content').replaceChildren(...VIEWS[state.view]());
  pruneSelection();
  renderBulkBar();
}

let redrawTimer = null;
function redraw() {
  if (state.editing) {
    state.dirty = true;
    return;
  }
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(render, 60);
}

async function refresh() {
  state.pages = await listPages();
  if (state.editing) state.dirty = true;
  else render();
}

function rerenderSettings() {
  if (state.view === 'settings' && !state.editing) render();
}

async function recheckFileAccess() {
  if (document.hidden) return;
  const allowed = await fileAccessAllowed();
  if (allowed === state.fileAccess) return;
  state.fileAccess = allowed;
  renderNotices();
  rerenderSettings();
}

function installRouting() {
  window.addEventListener('hashchange', () => {
    readRoute();
    resetLimits();
    state.editing = false;
    render();
    window.scrollTo({ top: 0 });
    renderNotices();
    enter($('content'));
  });
  $('back').addEventListener('click', () => {
    location.hash = 'pages';
  });
}

function installSearch() {
  let timer = null;
  $('search').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    resetLimits();
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
}

function installUndoShortcut() {
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.defaultPrevented) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || document.querySelector('dialog[open]')) return;
    if (undoLast()) e.preventDefault();
  });
}

async function init() {
  applyI18n();
  hydrateIcons();
  installTooltips();
  onRender(render);
  $('sidebar-privacy').append(privacyNote());

  await ensureMigrated().catch((err) => console.error('Annotator: migration failed', err));
  await loadSupportPrompt();
  $('sidebar-meta').append(aboutLinks({ guide: false }), h('span', { class: 'sidebar-version' }, versionLabel()));
  state.settings = await getSettings();
  applyCategories(state.settings);
  readRoute();
  await refresh();
  whatsNewBanner(state.settings).then((banner) => banner && $('whats-new').append(banner));
  state.fileAccess = await fileAccessAllowed();
  renderNotices();
  rerenderSettings();
  window.addEventListener('focus', recheckFileAccess);
  document.addEventListener('visibilitychange', recheckFileAccess);

  installRouting();
  installSearch();
  installUndoShortcut();
  installBulkBar();
  $('export').addEventListener('click', () => openExport());

  onStoreChange(({ pages, settings }) => {
    if (settings) {
      state.settings = settings;
      applyCategories(settings);
    }
    if (pages.size) applyPageChanges(pages);
    if (pages.size || (settings && state.view !== 'settings')) redraw();
  });
}

init();
