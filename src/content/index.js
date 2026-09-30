import { api } from '../shared/api.js';
import {
  addAnnotation,
  deleteAnnotations,
  ensureMigrated,
  getPage,
  getSettings,
  onStoreChange,
  updateAnnotation,
} from '../shared/store.js';
import { hostnameOf, normalizeUrl } from '../shared/url.js';
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
import { createUi } from './ui.js';

function alive() {
  try {
    return !!api.runtime?.id;
  } catch {
    return false;
  }
}

if (window.top === window && !globalThis.__annotatorAlive?.()) {
  globalThis.__annotatorAlive = alive;
  main();
}

function main() {
  for (const host of Array.from(document.querySelectorAll(UI_HOST_TAG))) host.remove();
  unwrap(Array.from(document.querySelectorAll(MARK_TAG)));

  let pageUrl = null;
  let annotations = [];
  let settings = null;
  const anchors = new Map();
  const orphans = new Set();
  const unsaved = new Set();
  let styleApplied = false;
  let orphanRetries = 0;
  let lastCount = 0;
  let shutDown = false;

  const defaultColor = () => settings?.defaultColor ?? 'yellow';

  const ui = createUi({
    onHighlight: (color) => createFromSelection(color, false),
    onHighlightWithNote: () => createFromSelection(defaultColor(), true),
    onColorChange: (id, color) => {
      setColor(anchors.get(id) ?? [], color);
      const a = annotations.find((x) => x.id === id);
      if (a) a.color = color;
      updateAnnotation(pageUrl, id, { color });
    },
    onNoteSave: (id, note) => {
      const a = annotations.find((x) => x.id === id);
      if (a) a.note = note;
      updateAnnotation(pageUrl, id, { note });
    },
    onDelete: (id) => {
      removeLocal([id]);
      deleteAnnotations(pageUrl, [id]);
    },
    onPopoverClose: (id) => setActive(anchors.get(id) ?? [], false),
  });

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
    ui.close();
    return false;
  }

  async function loadPage() {
    pageUrl = normalizeUrl(location.href);
    orphanRetries = 0;
    if (!pageUrl) return;
    const page = await getPage(pageUrl);
    annotations = page?.annotations ?? [];
    anchorPending();
    reportCount();
  }

  function teardown() {
    ui.close();
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
    addAnnotation(pageUrl, document.title, created).finally(() => unsaved.delete(created.id));
    reportCount();
    if (withNote) openEditor(created.id, { focus: true });
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
    return settings?.siteRules?.[hostnameOf(location.href)];
  }

  function siteEnabled() {
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
    if (['handle', 'toolbar'].includes(ui.openKind) && window.getSelection()?.isCollapsed) ui.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ['handle', 'toolbar'].includes(ui.openKind)) ui.close();
  });

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'create-from-selection':
        createFromSelection(defaultColor(), true);
        return false;
      case 'go-to':
        goTo(message.id).then(sendResponse);
        return true;
      case 'status':
        sendResponse({ url: pageUrl, orphans: [...orphans], appLike: pageLooksLikeAnApp() });
        return false;
      default:
        return false;
    }
  });

  onStoreChange(({ pages, settings: nextSettings }) => {
    if (nextSettings) {
      settings = nextSettings;
      if (styleApplied) applyHighlightStyle(settings.highlightStyle);
      if (['handle', 'toolbar'].includes(ui.openKind) && (!settings.selectionToolbar || !siteEnabled())) ui.close();
      if (reportedEnabled !== null) reportEnabled(siteEnabled());
    }
    if (!pageUrl || !pages.has(pageUrl)) return;

    const next = pages.get(pageUrl)?.annotations ?? [];
    const nextIds = new Set(next.map((a) => a.id));
    const removed = annotations.filter((a) => !nextIds.has(a.id) && !unsaved.has(a.id)).map((a) => a.id);
    if (removed.length) removeLocal(removed);

    for (const a of next) {
      const known = annotations.find((x) => x.id === a.id);
      if (known && known.color !== a.color) setColor(anchors.get(a.id) ?? [], a.color);
    }
    annotations = [...next, ...annotations.filter((a) => unsaved.has(a.id) && !nextIds.has(a.id))];
    anchorPending();
  });

  let mutationTimer = null;
  function onDomSettled() {
    if (!checkAlive()) return;
    const url = normalizeUrl(location.href);
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
    if (normalizeUrl(location.href) !== pageUrl) onDomSettled();
  }, 1000);

  (async () => {
    await ensureMigrated().catch(() => { });
    settings = await getSettings();
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
}
