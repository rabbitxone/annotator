import { copyText } from '../../shared/clipboard.js';
import { quoteSnippet } from '../../shared/exchange.js';
import { updateAnnotation } from '../../shared/store.js';
import { displayAddress } from '../../shared/url.js';
import { confirmAndDelete } from '../components/actions.js';
import { annotationCard } from '../components/card.js';

export const state = {
  tab: 'page',
  query: '',
  tabId: null,
  tabTitle: '',
  pageUrl: null,
  page: null,
  pages: null,
  recent: null,
  orphans: new Set(),
  fileAccess: null,
  fileNotice: null,
  readerHint: undefined,
  whatsNew: null,
  pdf: false,
  inReader: false,
  tabHidden: false,
  appLike: false,
  settings: null,
  editing: false,
  dirty: false,
};

let renderHook = () => { };
export const onRender = (fn) => (renderHook = fn);
export const render = () => renderHook();

export function renderSoon() {
  if (state.editing) state.dirty = true;
  else render();
}

export function setEditing(editing) {
  state.editing = editing;
  if (!editing && state.dirty) render();
}

export function matches(annotation, page) {
  if (!state.query) return true;
  const q = state.query;
  return [annotation.quote?.exact, annotation.note, page.title, displayAddress(page.url)].some((v) => v?.toLowerCase().includes(q));
}

export function card(annotation, page, extra) {
  return annotationCard(annotation, page, {
    query: state.query,
    onSave: (patch) => updateAnnotation(page.url, annotation.id, patch),
    onDelete: () => confirmAndDelete([{ annotation, page }]),
    onCopy: () => copyText(quoteSnippet(annotation, page)),
    onEditingChange: setEditing,
    ...extra,
  });
}
