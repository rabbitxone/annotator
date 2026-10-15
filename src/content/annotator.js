import { api } from '../shared/api.js';
import { applyCategories } from '../shared/apply-categories.js';
import { categoryForKey } from '../shared/categories.js';
import { copyText } from '../shared/clipboard.js';
import { getCategories } from '../shared/constants.js';
import { quoteSnippet, toMarkdown } from '../shared/exchange.js';
import { exportLabels } from '../shared/export-labels.js';
import { normalizeUrl, siteKey } from '../shared/url.js';
import { uuid } from '../shared/uuid.js';
import { buildIndex, describeRange, resolve, UI_HOST_TAG } from './anchoring.js';
import { collectSignals, isAppLike, isSelectionAnnotatable } from './context.js';
import {
  applyHighlightStyle,
  boundsOf,
  flash,
  MARK_TAG,
  refreshTones,
  selectionEndRect,
  setActive,
  setColor,
  unwrap,
  wrapRange,
} from './highlighter.js';
import { createPanel } from './panel.js';
import { createUi, pressedKey } from './ui.js';

const logSaveError = (err) => console.error('Annotator: saving failed', err);

function alive() {
  try {
    return !!api.runtime?.id;
  } catch {
    return false;
  }
}

// env.store, address(), allows(el) and alwaysOn let the guide's demo run the same code.
export function startAnnotator(env) {
  const {
    addAnnotation,
    deleteAnnotations,
    ensureMigrated,
    getPage,
    getSettings,
    onStoreChange,
    reanchorAnnotation,
    setLost,
    setPageNote,
    updateAnnotation,
  } = env.store;
  const address = env.address ?? (() => normalizeUrl(location.href));
  const allows = env.allows ?? (() => true);

  for (const host of Array.from(document.querySelectorAll(UI_HOST_TAG))) host.remove();
  unwrap(Array.from(document.querySelectorAll(MARK_TAG)));

  let pageUrl = null;
  let pageNote = '';
  let annotations = [];
  let settings = null;
  const anchors = new Map();
  const orphans = new Set();
  const unsaved = new Set();
  let styleApplied = false;
  let orphanRetries = 0;
  let lastCount = 0;
  let shutDown = false;

  const defaultColor = () => {
    const categories = getCategories();
    return categories.some((c) => c.id === settings?.defaultColor) ? settings.defaultColor : categories[0].id;
  };

  const ui = createUi({
    onHighlight: (color) => createFromSelection(color, false),
    onHighlightWithNote: () => createFromSelection(defaultColor(), true),
    onColorChange: (id, color) => {
      setColor(anchors.get(id) ?? [], color);
      const a = annotations.find((x) => x.id === id);
      if (a) a.color = color;
      updateAnnotation(pageUrl, id, { color }).catch(logSaveError);
      refreshPanel();
    },
    onNoteSave: (id, note) => {
      const a = annotations.find((x) => x.id === id);
      if (a) a.note = note;
      updateAnnotation(pageUrl, id, { note }).catch(logSaveError);
      refreshPanel();
    },
    onCopy: (id) => {
      const a = annotations.find((x) => x.id === id);
      return a ? copyText(quoteSnippet(a, currentPage()), ui.shadowRoot()) : false;
    },
    onDelete: (id) => {
      removeLocal([id]);
      deleteAnnotations(pageUrl, [id]).catch(logSaveError);
    },
    onPopoverClose: (id) => setActive(anchors.get(id) ?? [], false),
  });

  const panel = createPanel({
    shadowRoot: () => ui.shadowRoot(),
    handlers: {
      onGo: (id) => {
        const marks = anchors.get(id);
        if (!marks?.[0]?.isConnected) return;
        marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(marks);
        openEditor(id, { focus: false });
      },
      onReanchor: (id) => reanchor(id),
      onPageNoteSave: (note) => {
        if (!pageUrl) return;
        pageNote = note;
        return setPageNote(pageUrl, document.title, note);
      },
      onCopyAll: () =>
        copyText(
          toMarkdown([{ page: { ...currentPage(), note: pageNote }, annotations }], { ...exportLabels(), title: '' }),
          ui.shadowRoot(),
        ),
    },
  });

  const currentPage = () => ({ url: pageUrl, title: document.title });

  function panelModel() {
    const head = (a) => anchors.get(a.id)?.[0];
    const items = annotations
      .filter((a) => head(a)?.isConnected)
      .sort((a, b) => (head(a).compareDocumentPosition(head(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const placed = new Set(items);
    return { items, orphans: annotations.filter((a) => !placed.has(a)), pageNote };
  }

  function refreshPanel() {
    if (panel.isOpen) panel.update(panelModel());
  }

  function togglePanel() {
    if (!pageUrl) return;
    panel.update(panelModel());
    panel.toggle();
  }

  let observer = null;
  function withoutObserver(fn) {
    try {
      return fn();
    } finally {
      observer?.takeRecords();
    }
  }

  const allMarks = () => [...anchors.values()].flat();

  let toneTimer = null;
  let themeObserver = null;
  function scheduleTones() {
    clearTimeout(toneTimer);
    toneTimer = setTimeout(() => {
      if (checkAlive()) refreshTones(allMarks());
    }, 250);
  }

  function ensureStyle() {
    if (styleApplied) return;
    styleApplied = true;
    applyHighlightStyle(settings.highlightStyle);
  }

  function anchorPending() {
    const pending = annotations.filter((a) => {
      const marks = anchors.get(a.id);
      return !marks || marks.length === 0 || !marks.every((m) => m.isConnected);
    });
    if (pending.length === 0) return;

    ensureStyle();
    withoutObserver(() => {
      const index = buildIndex();
      for (const annotation of pending) {
        unwrap(anchors.get(annotation.id) ?? []);
        anchors.delete(annotation.id);

        const hit = resolve(index, annotation);
        const marks = hit ? wrapRange(hit.rawStart, hit.rawEnd, annotation) : [];
        if (marks.length > 0) {
          anchors.set(annotation.id, marks);
          orphans.delete(annotation.id);
        } else {
          orphans.add(annotation.id);
        }
      }
      refreshTones(allMarks());
    });
    reportCount();
    syncLost();
    refreshPanel();
  }

  let lostTimer = null;
  let loadedAt = Date.now();
  function syncLost() {
    const url = pageUrl;
    const found = annotations.filter((a) => a.lostAt && anchors.get(a.id)?.length).map((a) => a.id);
    if (found.length) setLost(url, found, false).catch(() => { });

    clearTimeout(lostTimer);
    if (!annotations.some((a) => !a.lostAt && orphans.has(a.id))) return;
    lostTimer = setTimeout(
      () => {
        if (!checkAlive() || pageUrl !== url) return;
        const lost = annotations.filter((a) => !a.lostAt && orphans.has(a.id) && !unsaved.has(a.id)).map((a) => a.id);
        if (lost.length) setLost(url, lost, true).catch(() => { });
      },
      Math.max(4000, loadedAt + 10000 - Date.now()),
    );
  }

  function removeLocal(ids) {
    const drop = new Set(ids);
    withoutObserver(() => {
      for (const id of drop) {
        unwrap(anchors.get(id) ?? []);
        anchors.delete(id);
        orphans.delete(id);
      }
    });
    if (drop.has(ui.openAnnotationId)) ui.close();
    annotations = annotations.filter((a) => !drop.has(a.id));
    reportCount();
    refreshPanel();
  }

  function reportCount() {
    const count = annotations.length;
    if (count === lastCount || !alive()) return;
    lastCount = count;
    api.runtime.sendMessage({ type: 'count', count }).catch(() => { });
  }

  function checkAlive() {
    if (shutDown) return false;
    if (alive()) return true;
    shutDown = true;
    observer?.disconnect();
    themeObserver?.disconnect();
    clearInterval(urlTimer);
    clearTimeout(lostTimer);
    ui.close();
    panel.close();
    return false;
  }

  async function loadPage() {
    pageUrl = address();
    orphanRetries = 0;
    loadedAt = Date.now();
    if (!pageUrl) {
      panel.close();
      return;
    }
    const url = pageUrl;
    const page = await getPage(url);
    if (pageUrl !== url) return;
    annotations = page?.annotations ?? [];
    pageNote = page?.note ?? '';
    anchorPending();
    reportCount();
    refreshPanel();
  }

  function teardown() {
    panel.flush();
    ui.close();
    clearTimeout(lostTimer);
    pageNote = '';
    withoutObserver(() => {
      for (const marks of anchors.values()) unwrap(marks);
    });
    anchors.clear();
    orphans.clear();
    annotations = [];
  }

  function selectionRange() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el || el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) return null;
    if (!allows(el)) return null;
    if (!document.body?.contains(el) && el !== document.body) return null;
    return range;
  }

  function createFromSelection(color, withNote) {
    if (!pageUrl) return;
    const range = selectionRange();
    if (!range) return;

    ensureStyle();
    let created = null;
    withoutObserver(() => {
      const index = buildIndex();
      const described = describeRange(index, range);
      if (!described) return;
      const now = Date.now();
      const annotation = {
        id: uuid(),
        color,
        note: '',
        ...described.selector,
        createdAt: now,
        updatedAt: now,
      };
      const marks = wrapRange(described.rawStart, described.rawEnd, annotation);
      if (marks.length === 0) return;
      refreshTones(marks);
      anchors.set(annotation.id, marks);
      annotations.push(annotation);
      created = annotation;
    });
    if (!created) return;

    window.getSelection()?.removeAllRanges();
    ui.close();
    unsaved.add(created.id);
    addAnnotation(pageUrl, document.title, created)
      .catch((err) => {
        logSaveError(err);
        removeLocal([created.id]);
      })
      .finally(() => unsaved.delete(created.id));
    reportCount();
    refreshPanel();
    if (withNote) openEditor(created.id, { focus: true });
  }

  function reanchor(id) {
    const annotation = annotations.find((a) => a.id === id);
    const range = selectionRange();
    if (!annotation || !pageUrl) return { ok: false, reason: 'missing' };
    if (!range) return { ok: false, reason: 'no-selection' };

    let selector = null;
    withoutObserver(() => {
      const index = buildIndex();
      const described = describeRange(index, range);
      if (!described) return;
      unwrap(anchors.get(id) ?? []);
      anchors.delete(id);
      const marks = wrapRange(described.rawStart, described.rawEnd, annotation);
      if (marks.length === 0) return;
      refreshTones(marks);
      anchors.set(id, marks);
      orphans.delete(id);
      selector = described.selector;
      Object.assign(annotation, selector);
      delete annotation.lostAt;
      flash(marks);
    });
    if (!selector) return { ok: false, reason: 'no-selection' };

    window.getSelection()?.removeAllRanges();
    ui.close();
    reanchorAnnotation(pageUrl, id, selector).catch(logSaveError);
    refreshPanel();
    return { ok: true };
  }

  function openEditor(id, options) {
    const annotation = annotations.find((a) => a.id === id);
    const marks = anchors.get(id);
    if (!annotation || !marks) return;
    ui.openPopover(annotation, () => boundsOf(marks), options);
    setActive(marks, true);
  }

  async function goTo(id) {
    for (let waited = 0; !anchors.get(id)?.[0]?.isConnected && waited < 8000; waited += 250) {
      await new Promise((r) => setTimeout(r, 250));
      if (orphans.has(id)) anchorPending();
    }
    const marks = anchors.get(id);
    if (!marks?.[0]?.isConnected) return false;
    marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(marks);
    return true;
  }

  document.addEventListener('click', (e) => {
    if (!checkAlive() || ui.isInside(e)) return;
    const mark = e.target instanceof Element ? e.target.closest(MARK_TAG) : null;
    if (!mark) return;
    if (mark.closest('a[href]')) return;
    if (window.getSelection()?.isCollapsed === false) return;
    openEditor(mark.dataset.annotationId, { focus: false });
  });

  let appLikeCache = null;
  function pageLooksLikeAnApp() {
    const now = Date.now();
    if (appLikeCache && appLikeCache.href === location.href && now - appLikeCache.at < 5000) return appLikeCache.value;
    appLikeCache = { href: location.href, at: now, value: isAppLike(collectSignals()) };
    return appLikeCache.value;
  }

  function siteRule() {
    return settings?.siteRules?.[siteKey(location.href)];
  }

  function siteEnabled() {
    if (env.alwaysOn) return true;
    const rule = siteRule();
    if (rule === 'never') return false;
    return rule === 'always' || !pageLooksLikeAnApp();
  }

  let reportedEnabled = null;
  function reportEnabled(enabled) {
    if (enabled === reportedEnabled) return;
    reportedEnabled = enabled;
    api.runtime.sendMessage({ type: 'enabled', enabled }).catch(() => { });
  }

  function handleAllowed(range) {
    if (!settings?.selectionToolbar || !pageUrl) return false;
    return isSelectionAnnotatable(range) && siteEnabled();
  }

  let handleTimer = null;
  function maybeShowHandle(e) {
    if (!checkAlive() || !pageUrl || ui.isInside(e)) return;
    clearTimeout(handleTimer);
    handleTimer = setTimeout(() => {
      const range = selectionRange();
      if (range && pageUrl && checkAlive()) reportEnabled(siteEnabled());
      if (!range || ui.openKind === 'popover' || !handleAllowed(range)) return;
      ui.showHandle(() => {
        const end = selectionEndRect(range);
        return end && { top: end.top, bottom: end.bottom, left: end.left, right: end.right, first: end, last: end };
      });
    }, 10);
  }
  document.addEventListener('mouseup', maybeShowHandle);
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') maybeShowHandle(e);
  });
  document.addEventListener('selectionchange', () => {
    if (['handle', 'toolbar', 'picker'].includes(ui.openKind) && window.getSelection()?.isCollapsed) ui.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ['handle', 'toolbar'].includes(ui.openKind)) ui.close();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.defaultPrevented || !settings?.quickKeys || !pageUrl || !checkAlive()) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.repeat || ui.isInside(e)) return;
      const category = categoryForKey(getCategories(), pressedKey(e));
      if (!category) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]')) return;
      const range = selectionRange();
      if (!range || !isSelectionAnnotatable(range) || !siteEnabled()) return;
      e.preventDefault();
      e.stopPropagation();
      createFromSelection(category.id, false);
    },
    true,
  );

  function handle(message, sendResponse = () => { }) {
    switch (message?.type) {
      case 'create-from-selection':
        if (!message.fromCommand || siteRule() !== 'never') createFromSelection(defaultColor(), message.withNote !== false);
        sendResponse(true);
        return false;
      case 'toggle-panel':
        togglePanel();
        sendResponse(panel.isOpen);
        return false;
      case 'reanchor':
        sendResponse(reanchor(message.id));
        return false;
      case 'go-to':
        goTo(message.id).then(sendResponse);
        return true;
      case 'status':
        sendResponse({ url: pageUrl, orphans: [...orphans], appLike: pageLooksLikeAnApp(), panelOpen: panel.isOpen });
        return false;
      default:
        return false;
    }
  }
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => handle(message, sendResponse));

  onStoreChange(({ pages, settings: nextSettings }) => {
    if (nextSettings) {
      settings = nextSettings;
      applyCategories(settings);
      if (styleApplied) applyHighlightStyle(settings.highlightStyle);
      if (['handle', 'toolbar', 'picker'].includes(ui.openKind) && (!settings.selectionToolbar || !siteEnabled())) ui.close();
      if (reportedEnabled !== null) reportEnabled(siteEnabled());
    }
    if (!pageUrl || !pages.has(pageUrl)) return;

    pageNote = pages.get(pageUrl)?.note ?? '';
    const next = pages.get(pageUrl)?.annotations ?? [];
    const nextIds = new Set(next.map((a) => a.id));
    const removed = annotations.filter((a) => !nextIds.has(a.id) && !unsaved.has(a.id)).map((a) => a.id);
    if (removed.length) removeLocal(removed);

    const knownById = new Map(annotations.map((a) => [a.id, a]));
    for (const a of next) {
      const known = knownById.get(a.id);
      if (known && known.color !== a.color) setColor(anchors.get(a.id) ?? [], a.color);
    }
    annotations = [...next, ...annotations.filter((a) => unsaved.has(a.id) && !nextIds.has(a.id))];
    anchorPending();
    refreshPanel();
  });

  let mutationTimer = null;
  function onDomSettled() {
    if (!checkAlive()) return;
    const url = address();
    if (url !== pageUrl) {
      teardown();
      loadPage();
      return;
    }
    const broken = [...anchors.values()].some((marks) => !marks.every((m) => m.isConnected));
    if (broken || (orphans.size > 0 && orphanRetries++ < 20)) anchorPending();
  }

  observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(onDomSettled, 500);
  });

  const urlTimer = setInterval(() => {
    if (address() !== pageUrl) onDomSettled();
  }, 1000);

  (async () => {
    await ensureMigrated().catch(() => { });
    settings = await getSettings();
    applyCategories(settings);
    await loadPage();
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    themeObserver = new MutationObserver(scheduleTones);
    const themeAttributes = [
      'class',
      'style',
      'data-theme',
      'data-color-mode',
      'data-bs-theme',
      'data-mode',
      'data-color-scheme',
    ];
    for (const el of [document.documentElement, document.body]) {
      if (el) themeObserver.observe(el, { attributes: true, attributeFilter: themeAttributes });
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', scheduleTones);
  })();

  return { handle };
}
