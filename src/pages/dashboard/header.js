import { h } from '../../shared/dom.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { displayAddress, isFileUrl, pageName } from '../../shared/url.js';
import { fileAccessNotice } from '../components/file-access.js';
import { siteAvatar } from '../components/site-avatar.js';
import { $, allItems, currentPage, state } from './state.js';

const TITLES = { all: 'navAll', pages: 'navPages', settings: 'navSettings' };
let shownView = null;

function replaySwipe(title) {
  if (shownView === state.view) return;
  shownView = state.view;
  title.style.animation = 'none';
  void title.offsetWidth;
  title.style.animation = '';
}

export function renderHeader() {
  const title = $('view-title');
  const subtitle = $('view-subtitle');
  const settings = state.view === 'settings';
  $('back').hidden = state.view !== 'page';
  document.body.dataset.view = state.view;
  $('sidebar-privacy').hidden = settings;
  $('search-wrap').hidden = settings;
  $('export').hidden = settings;

  $('view-icon').replaceChildren(...(state.view === 'page' ? [siteAvatar(state.pageUrl, 40)] : []));
  if (state.view === 'page') {
    title.textContent = pageName(currentPage() ?? { url: state.pageUrl });
    const address = displayAddress(state.pageUrl);
    subtitle.replaceChildren(
      /^(https?|file):/i.test(state.pageUrl) ? h('a', { href: state.pageUrl, target: '_blank', rel: 'noopener', title: state.pageUrl }, address) : address,
    );
    document.title = `${title.textContent} · Annotator`;
  } else {
    const key = TITLES[state.view];
    title.textContent = t(key);
    subtitle.textContent = t(`${key}Subtitle`);
    document.title = `${t(key)} · Annotator`;
  }
  replaySwipe(title);

  for (const item of document.querySelectorAll('.nav-item')) {
    const current = item.dataset.view === state.view || (state.view === 'page' && item.dataset.view === 'pages');
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  const total = allItems().length;
  $('nav-count-all').textContent = total ? formatNumber(total) : '';
  $('nav-count-pages').textContent = state.pages.length ? formatNumber(state.pages.length) : '';
}

export function renderNotices() {
  const blocked = state.view !== 'settings' && state.fileAccess === false && state.pages.some((p) => isFileUrl(p.url));
  if (blocked) state.fileNotice ??= fileAccessNotice();
  $('notices').replaceChildren(...(blocked ? [state.fileNotice] : []));
}
