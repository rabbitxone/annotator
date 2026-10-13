import { buildIndex, resolve } from '../content/anchoring.js';
import { applyHighlightStyle, flash, MARK_TAG, setActive, wrapRange } from '../content/highlighter.js';
import { applyCategories } from '../shared/apply-categories.js';
import { colorById } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import { applyI18n, formatDate, formatNumber, t } from '../shared/i18n.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { renderMarkdown } from '../shared/markdown.js';
import { cleanTree } from '../shared/sanitize.js';
import { deleteSnapshots, getSnapshot, listSnapshots, onSnapshotsChange } from '../shared/snapshots.js';
import { ensureMigrated, getPage, getSettings, onStoreChange } from '../shared/store.js';
import { displayAddress, fileSafeName, pageName } from '../shared/url.js';
import { armOnce } from './components/confirm.js';

const state = { url: '', id: null, focusId: null, versions: [], snapshot: null, page: null, settings: null };
const $ = (id) => document.getElementById(id);
const marksById = new Map();

function readRoute() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.url = params.get('url') ?? '';
  state.id = params.get('id');
  state.focusId = params.get('a');
}

function route(patch) {
  const params = new URLSearchParams({ url: state.url });
  const id = patch.id ?? state.id;
  if (id) params.set('id', id);
  location.hash = params.toString();
}

// The stored HTML came from an arbitrary website: parse it inertly, clean it again,
// and keep images from loading until the reader asks for them.
function articleFrom(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const inert = document.implementation.createHTMLDocument('');
  const clean = cleanTree(parsed.body, inert);
  for (const img of clean.querySelectorAll('img')) {
    img.dataset.src = img.getAttribute('src');
    img.removeAttribute('src');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.setAttribute('loading', 'lazy');
  }
  for (const link of clean.querySelectorAll('a')) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  return document.importNode(clean, true);
}

function highlight(article) {
  marksById.clear();
  const annotations = state.page?.annotations ?? [];
  const index = buildIndex(article);
  for (const annotation of annotations) {
    const hit = resolve(index, annotation);
    const marks = hit ? wrapRange(hit.rawStart, hit.rawEnd, annotation, article) : [];
    if (marks.length) marksById.set(annotation.id, marks);
  }
}

function focusAnnotation(id) {
  const marks = marksById.get(id);
  if (!marks) return;
  for (const [otherId, other] of marksById) setActive(other, otherId === id);
  marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  flash(marks);
  for (const item of document.querySelectorAll('.snap-note')) item.toggleAttribute('data-active', item.dataset.id === id);
}

function noteItem(annotation) {
  const found = marksById.has(annotation.id);
  const color = colorById(annotation.color);
  return h(
    'li',
    {
      class: ['snap-note', !found && 'missing'],
      dataset: { id: annotation.id },
      style: { '--swatch': color.swatch, '--fill': color.fill },
      tabindex: found ? '0' : null,
      role: found ? 'button' : null,
      onclick: (e) => found && !e.target.closest('a') && focusAnnotation(annotation.id),
      onkeydown: (e) => found && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), focusAnnotation(annotation.id)),
    },
    h('p', { class: 'snap-note-quote' }, h('mark', null, annotation.quote?.exact ?? '')),
    annotation.note?.trim() && h('div', { class: 'md snap-note-text' }, renderMarkdown(annotation.note)),
    !found && h('p', { class: 'snap-note-missing' }, icon('alert', { size: 12 }), t('snapshotNoteMissing')),
  );
}

function renderNotes() {
  const annotations = [...(state.page?.annotations ?? [])].sort((a, b) => {
    const ma = marksById.get(a.id)?.[0];
    const mb = marksById.get(b.id)?.[0];
    if (ma && mb) return ma.compareDocumentPosition(mb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    return ma ? -1 : mb ? 1 : a.createdAt - b.createdAt;
  });
  const missing = annotations.filter((a) => !marksById.has(a.id)).length;
  $('snap-notes').replaceChildren(
    ...[
      state.page?.note?.trim() &&
      h(
        'section',
        { class: 'snap-page-note' },
        h('p', { class: 'snap-notes-title' }, icon('pageNote', { size: 14 }), t('pageNoteLabel')),
        h('div', { class: 'md' }, renderMarkdown(state.page.note)),
      ),
      h(
        'p',
        { class: 'snap-notes-title' },
        icon('note', { size: 14 }),
        t('snapshotNotesTitle'),
        h('span', { class: 'badge' }, annotations.length ? formatNumber(annotations.length) : ''),
      ),
      missing > 0 && h('p', { class: 'snap-notes-hint' }, t('snapshotNotesMissing', formatNumber(missing))),
      annotations.length
        ? h('ol', { class: 'snap-note-list' }, annotations.map(noteItem))
        : h('p', { class: 'snap-notes-hint' }, t('snapshotNoNotes')),
    ].filter(Boolean),
  );
}

function renderHeader() {
  const { snapshot, versions } = state;
  const title = pageName({ title: snapshot?.title || state.page?.title, url: state.url });
  $('snap-title').textContent = title;
  document.title = `${title} · ${t('snapshotBadge')}`;
  $('snap-source').textContent = displayAddress(state.url);
  $('snap-source').href = /^https?:/i.test(state.url) ? state.url : '#';
  $('back').href = `dashboard.html#page=${encodeURIComponent(state.url)}`;
  $('snap-date').textContent = snapshot ? t('snapshotSavedOn', formatDate(snapshot.capturedAt)) : '';

  const select = $('snap-version');
  $('snap-version-wrap').hidden = versions.length < 2;
  select.replaceChildren(
    ...versions.map((v, i) =>
      h(
        'option',
        { value: v.id, selected: v.id === snapshot?.id },
        `${formatDate(v.capturedAt)}${i === 0 ? ` · ${t('snapshotOriginal')}` : i === versions.length - 1 ? ` · ${t('snapshotLatest')}` : ''}`,
      ),
    ),
  );
  for (const id of ['snap-download', 'snap-delete']) $(id).hidden = !snapshot;
}

function renderImagesButton(article) {
  const pending = article.querySelectorAll('img[data-src]').length;
  $('snap-images').hidden = pending === 0;
  $('snap-images-label').textContent = t('snapshotShowImages', formatNumber(pending));
}

function render() {
  renderHeader();
  const article = $('snap-article');
  if (!state.snapshot) {
    article.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('span', { class: 'empty-icon' }, icon('archive', { size: 22 })),
        h('p', { class: 'empty-title' }, t('snapshotEmptyTitle')),
        h('p', { class: 'empty-text' }, t('snapshotEmptyText')),
      ),
    );
    $('snap-notes').replaceChildren();
    $('snap-images').hidden = true;
    return;
  }
  article.replaceChildren(articleFrom(state.snapshot.html));
  highlight(article);
  renderImagesButton(article);
  renderNotes();
  if (state.focusId) {
    const id = state.focusId;
    state.focusId = null;
    requestAnimationFrame(() => focusAnnotation(id));
  }
}

async function load() {
  state.versions = await listSnapshots(state.url);
  const wanted = state.versions.find((v) => v.id === state.id) ?? state.versions[0];
  [state.snapshot, state.page] = await Promise.all([wanted ? getSnapshot(wanted.id) : null, getPage(state.url)]);
  render();
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function downloadHtml() {
  const clone = $('snap-article').cloneNode(true);
  for (const mark of clone.querySelectorAll(MARK_TAG)) {
    const plain = document.createElement('mark');
    plain.setAttribute('style', `background:${colorById(mark.dataset.color).fill}`);
    plain.append(...mark.childNodes);
    mark.replaceWith(plain);
  }
  for (const img of clone.querySelectorAll('img[data-src]')) {
    img.setAttribute('src', img.dataset.src);
    img.removeAttribute('data-src');
  }
  const { snapshot } = state;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(snapshot.title || state.url)}</title>
<style>body{font:17px/1.65 Georgia,serif;color:#1f2937;max-width:720px;margin:40px auto;padding:0 20px}header{font:13px/1.5 system-ui,sans-serif;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:24px}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #e5e7eb;padding:4px 8px}pre{white-space:pre-wrap}mark{color:inherit;border-radius:2px}</style>
</head><body><header><p>${escapeHtml(t('snapshotSavedOn', formatDate(snapshot.capturedAt)))} · Annotator</p><p><a href="${escapeHtml(state.url)}">${escapeHtml(state.url)}</a></p></header>
<main>${clone.innerHTML}</main></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const name = `${fileSafeName(state.url)}-${new Date(snapshot.capturedAt).toISOString().slice(0, 10)}.html`;
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init() {
  applyI18n();
  hydrateIcons();
  await ensureMigrated().catch(() => { });
  state.settings = await getSettings();
  applyCategories(state.settings);
  applyHighlightStyle(state.settings.highlightStyle);
  readRoute();
  await load();

  window.addEventListener('hashchange', () => {
    readRoute();
    load();
  });
  $('snap-version').addEventListener('change', (e) => route({ id: e.target.value }));
  $('snap-images').addEventListener('click', () => {
    for (const img of $('snap-article').querySelectorAll('img[data-src]')) {
      img.setAttribute('src', img.dataset.src);
      img.removeAttribute('data-src');
    }
    $('snap-images').hidden = true;
  });
  $('snap-download').addEventListener('click', downloadHtml);
  armOnce($('snap-delete'), async () => {
    const id = state.snapshot?.id;
    if (!id) return;
    state.id = null;
    await deleteSnapshots([id]);
    route({ id: '' });
    load();
  });
  $('snap-article').addEventListener('click', (e) => {
    const mark = e.target instanceof Element ? e.target.closest(MARK_TAG) : null;
    if (!mark || e.target.closest('a')) return;
    focusAnnotation(mark.dataset.annotationId);
    document.querySelector(`.snap-note[data-id="${CSS.escape(mark.dataset.annotationId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  onSnapshotsChange(load);
  onStoreChange(({ pages, settings }) => {
    if (settings) {
      applyCategories(settings);
      applyHighlightStyle(settings.highlightStyle);
    }
    if (pages.has(state.url)) load();
  });
}

init();
