import { h } from '../../../shared/dom.js';
import { t } from '../../../shared/i18n.js';
import { listPages } from '../../../shared/store.js';
import { openNote } from '../../components/actions.js';
import { emptyState } from '../../components/empty-state.js';
import { goToOnThisPage } from './page.js';
import { card, matches, renderSoon, state } from '../state.js';

const RECENT_LIMIT = 30;

let loading = false;
async function loadPages() {
  if (state.pages || loading) return;
  loading = true;
  try {
    state.pages = await listPages();
  } catch (err) {
    console.error('Annotator: loading notes failed', err);
    state.pages = [];
  } finally {
    loading = false;
  }
  state.recent = null;
  if (!state.editing) renderSoon();
}

async function openElsewhere(page, id) {
  if (page.url === state.pageUrl) return goToOnThisPage(id);
  if (await openNote(page, id)) window.close();
}

export function applyPageChanges(changes) {
  if (state.pageUrl && changes.has(state.pageUrl)) state.page = changes.get(state.pageUrl) ?? null;
  if (!state.pages) return;
  const byUrl = new Map(state.pages.map((p) => [p.url, p]));
  for (const [url, page] of changes) {
    if (page && Array.isArray(page.annotations) && (page.annotations.length > 0 || page.note?.trim())) byUrl.set(url, page);
    else byUrl.delete(url);
  }
  state.pages = [...byUrl.values()];
  state.recent = null;
}

export function recentTab() {
  if (!state.pages) {
    loadPages();
    return [h('p', { class: 'popup-loading' }, t('listLoading'))];
  }
  const touched = (a) => Math.max(a.updatedAt ?? 0, a.createdAt ?? 0);
  state.recent ??= state.pages
    .flatMap((page) => page.annotations.map((annotation) => ({ annotation, page })))
    .sort((a, b) => touched(b.annotation) - touched(a.annotation));
  const shown = [];
  for (const item of state.recent) {
    if (shown.length === RECENT_LIMIT) break;
    if (matches(item.annotation, item.page)) shown.push(item);
  }

  if (shown.length === 0) {
    return [state.query ? emptyState('search', t('emptySearchTitle'), t('emptySearchText')) : emptyState('note', t('emptyAllTitle'), t('emptyAllText'))];
  }
  return shown.map(({ annotation, page }) =>
    card(annotation, page, {
      showSource: true,
      goLabel: t('actionOpen'),
      goIcon: 'open',
      onGo: () => openElsewhere(page, annotation.id),
    }),
  );
}
