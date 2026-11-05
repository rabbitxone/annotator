import { byTextPosition } from '../../shared/exchange.js';
import { displayAddress } from '../../shared/url.js';

export const PAGE_SIZE = 60;
export const PAGES_PAGE_SIZE = 200;

export const state = {
  limit: PAGE_SIZE,
  pagesLimit: PAGES_PAGE_SIZE,
  view: 'all',
  pageUrl: null,
  pages: [],
  fileAccess: null,
  fileNotice: null,
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

let renderHook = () => { };
export const onRender = (fn) => (renderHook = fn);
export const render = () => renderHook();

export const $ = (id) => document.getElementById(id);
export const selectionKey = (url, id) => `${url}\n${id}`;

export function resetLimits() {
  state.limit = PAGE_SIZE;
  state.pagesLimit = PAGES_PAGE_SIZE;
}

export function setFilter(patch) {
  Object.assign(state, patch);
  resetLimits();
  render();
}

export function setEditing(editing) {
  state.editing = editing;
  if (!editing && state.dirty) render();
}

export const currentPage = () => state.pages.find((p) => p.url === state.pageUrl) ?? null;

export function allItems() {
  return state.pages.flatMap((page) => page.annotations.map((annotation) => ({ annotation, page })));
}

export function scopeItems() {
  if (state.view === 'page') {
    const page = currentPage();
    return page ? page.annotations.map((annotation) => ({ annotation, page })) : [];
  }
  return allItems();
}

export function matchesQuery({ annotation, page }) {
  if (!state.query) return true;
  return [annotation.quote?.exact, annotation.note, page.title, displayAddress(page.url)].some((v) => v?.toLowerCase().includes(state.query));
}

export function filteredItems() {
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

export const isFiltered = () => !!(state.query || state.color || state.withNoteOnly || state.lostOnly);

export function selectedItems() {
  return allItems().filter(({ annotation, page }) => state.selected.has(selectionKey(page.url, annotation.id)));
}

export function pruneSelection() {
  if (!state.selected.size) return;
  const existing = new Set(allItems().map(({ annotation, page }) => selectionKey(page.url, annotation.id)));
  for (const key of state.selected) if (!existing.has(key)) state.selected.delete(key);
}

export function categoryCounts() {
  const counts = new Map();
  for (const page of state.pages) for (const a of page.annotations) counts.set(a.color, (counts.get(a.color) ?? 0) + 1);
  return counts;
}

export function applyPageChanges(changes) {
  const byUrl = new Map(state.pages.map((p) => [p.url, p]));
  for (const [url, page] of changes) {
    if (page && Array.isArray(page.annotations) && (page.annotations.length > 0 || page.note?.trim())) byUrl.set(url, page);
    else byUrl.delete(url);
  }
  state.pages = [...byUrl.values()];
}
