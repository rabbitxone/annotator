import { colorById } from '../../../shared/constants.js';
import { h } from '../../../shared/dom.js';
import { formatNumber, plural, relativeTime, t } from '../../../shared/i18n.js';
import { icon } from '../../../shared/icons.js';
import { displayAddress, pageName, siteLabel } from '../../../shared/url.js';
import { emptyState } from '../../components/empty-state.js';
import { segmented } from '../../components/segmented.js';
import { siteAvatar } from '../../components/site-avatar.js';
import { moreButton, stopWatching, watchFooter } from '../load-more.js';
import { pageHref } from '../router.js';
import { $, matchesQuery, PAGES_PAGE_SIZE, render, setFilter, state } from '../state.js';

function renderFilters(count) {
  $('filters').replaceChildren(
    h(
      'div',
      { class: 'toolbar-sub' },
      h('div', { class: 'toolbar-left' }, h('span', { class: 'result-count' }, plural('pageCount', count))),
      segmented(
        [
          { value: 'recent', label: t('groupRecent') },
          { value: 'domain', label: t('groupDomain') },
        ],
        state.grouping,
        (grouping) => setFilter({ grouping }),
        { ariaLabel: t('groupLabel') },
      ),
    ),
  );
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
      h('p', { class: 'page-row-title' }, pageName(page)),
      h('p', { class: 'page-row-sub', title: page.url }, displayAddress(page.url)),
    ),
    h(
      'div',
      { class: 'page-row-meta' },
      page.note?.trim() && h('span', { class: 'page-row-note', title: t('pageNoteLabel') }, icon('pageNote', { size: 14 })),
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

function loadMore() {
  stopWatching();
  state.pagesLimit += PAGES_PAGE_SIZE;
  render();
}

function footer(remaining) {
  const el = h('div', { class: 'list-more' }, moreButton(remaining, loadMore));
  watchFooter(el, loadMore);
  return el;
}

function byDomain(pages) {
  const groups = new Map();
  for (const page of pages) {
    const host = siteLabel(page.url);
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
        h('p', { class: 'page-group-title' }, siteAvatar(list[0].url, 20), h('span', null, host), h('span', { class: 'badge' }, formatNumber(list.length))),
        h('div', { class: 'page-list' }, list.map(pageRow)),
      ),
    ),
  );
}

export function pagesView() {
  stopWatching();
  const matching = state.pages
    .filter(
      (page) =>
        !state.query ||
        [page.title, displayAddress(page.url), page.note].some((v) => v?.toLowerCase().includes(state.query)) ||
        page.annotations.some((a) => matchesQuery({ annotation: a, page })),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  renderFilters(matching.length);

  if (matching.length === 0) {
    return [
      state.query
        ? emptyState('search', t('emptySearchTitle'), t('emptySearchText'), { panel: true })
        : emptyState('globe', t('emptyAllTitle'), t('emptyAllText'), { panel: true }),
    ];
  }

  const pages = matching.slice(0, state.pagesLimit);
  const more = matching.length > pages.length ? footer(matching.length - pages.length) : null;
  const list = state.grouping === 'domain' ? byDomain(pages) : h('div', { class: 'page-list' }, pages.map(pageRow));
  return [list, more].filter(Boolean);
}
