import { api } from '../../shared/api.js';
import { applyCategories } from '../../shared/apply-categories.js';
import { fileAccessAllowed } from '../../shared/file-access.js';
import { applyI18n, t } from '../../shared/i18n.js';
import { hydrateIcons } from '../../shared/icons.js';
import { enter } from '../../shared/motion.js';
import { loadSupportPrompt } from '../../shared/support-prompt.js';
import { ensureMigrated, getPage, getSettings, onStoreChange } from '../../shared/store.js';
import { installTooltips } from '../../shared/tooltip.js';
import { isFileUrl, isPdfUrl, normalizeUrl, unwrapReaderUrl } from '../../shared/url.js';
import { aboutLinks } from '../components/about-links.js';
import { whatsNewBanner } from '../components/whats-new.js';
import { onRender, renderSoon, state } from './state.js';
import { pageTab } from './tabs/page.js';
import { applyPageChanges, recentTab } from './tabs/recent.js';
import { settingsTab } from './tabs/settings.js';

const TABS = { page: pageTab, recent: recentTab, settings: settingsTab };

const view = document.getElementById('view');
const searchWrap = document.getElementById('search-wrap');
const search = document.getElementById('search');
const openPanel = document.getElementById('open-panel');

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

  view.replaceChildren(...TABS[state.tab]().filter(Boolean));
  if (renderedTab !== null && renderedTab !== state.tab) {
    view.scrollTop = 0;
    enter(view, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 200);
  }
  renderedTab = state.tab;
}

async function refresh() {
  state.page = state.pageUrl ? await getPage(state.pageUrl) : null;
  renderSoon();
}

async function loadStatus() {
  if (!state.tabId || !state.pageUrl) return;
  try {
    const status = await api.runtime.sendMessage({ type: 'tab-command', tabId: state.tabId, message: { type: 'status' } });
    if (status?.pdf) {
      state.pdf = true;
      openPanel.hidden = true;
      if (!state.editing) render();
    } else if (status?.url === state.pageUrl) {
      if (isFileUrl(state.pageUrl) && state.fileAccess === false) {
        state.fileAccess = true;
        openPanel.hidden = state.inReader;
      }
      state.orphans = new Set(status.orphans);
      state.appLike = !!status.appLike;
      if (!state.editing) render();
    }
  } catch { }
}

async function readActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;
  state.tabTitle = tab?.title ?? '';
  state.tabHidden = !!tab && tab.url == null;
  state.fileAccess = await fileAccessAllowed();
  state.inReader = unwrapReaderUrl(tab?.url) !== tab?.url;
  state.pageUrl = tab?.url ? normalizeUrl(unwrapReaderUrl(tab.url)) : null;
  state.pdf = isPdfUrl(state.pageUrl);
  openPanel.hidden = !state.pageUrl || state.inReader || state.pdf || (isFileUrl(state.pageUrl) && state.fileAccess === false);
}

function renderFooter() {
  const openGuide = () => {
    api.tabs.create({ url: api.runtime.getURL('guide.html') });
    window.close();
  };
  document.getElementById('footer').replaceChildren(aboutLinks({ onGuide: openGuide, compact: true }));
}

function installEvents() {
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
  openPanel.addEventListener('click', async () => {
    await api.runtime.sendMessage({ type: 'tab-command', tabId: state.tabId, message: { type: 'toggle-panel' } }).catch(() => { });
    window.close();
  });
  document.getElementById('open-dashboard').addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('dashboard.html') });
    window.close();
  });
}

async function init() {
  applyI18n();
  hydrateIcons();
  installTooltips();
  onRender(render);

  await ensureMigrated().catch(() => { });
  await loadSupportPrompt();
  renderFooter();
  state.settings = await getSettings();
  applyCategories(state.settings);

  await readActiveTab();
  state.whatsNew = await whatsNewBanner(state.settings, { compact: true, onDismiss: () => (state.whatsNew = null) });
  await refresh();
  loadStatus();
  installEvents();

  onStoreChange(({ pages, settings }) => {
    if (settings) {
      state.settings = settings;
      applyCategories(settings);
    }
    if (pages.size) applyPageChanges(pages);
    if (!pages.size && state.tab === 'settings') return;
    renderSoon();
  });
}

init();
