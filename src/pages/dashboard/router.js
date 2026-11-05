import { state } from './state.js';

export const VIEWS = ['all', 'pages', 'settings'];

export const pageHref = (url) => '#page=' + encodeURIComponent(url);

export function readRoute() {
  let hash = location.hash.slice(1);
  try {
    hash = decodeURIComponent(hash);
  } catch {
    hash = '';
  }
  if (hash.startsWith('page=')) {
    state.view = 'page';
    state.pageUrl = hash.slice(5);
  } else {
    state.view = VIEWS.includes(hash) ? hash : 'all';
    state.pageUrl = null;
  }
  state.selected.clear();
}
