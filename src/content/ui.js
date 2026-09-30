import { COLORS, colorById } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import { relativeTime, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import tokensCss from '../shared/tokens.css';
import uiCss from './ui.css';
import { UI_HOST_TAG } from './anchoring.js';

const GAP = 8;
const END_GAP = 4;
const POPOVER_GAP = 10;
const ARROW_INSET = 20;
const EDGE = 8;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function place(el, getRect, prefer, gap) {
  const rect = getRect();
  if (!rect) return null;
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;

  let wantedLeft = rect.left;
  if (prefer === 'end') wantedLeft = rect.right - END_GAP;
  const left = Math.max(EDGE, Math.min(wantedLeft, vw - w - EDGE));

  const above = rect.top - hgt - gap;
  const below = rect.bottom + gap;
  const fitsAbove = above >= EDGE;
  const fitsBelow = below + hgt <= vh - EDGE;
  let side = fitsBelow || !fitsAbove ? 'below' : 'above';
  const top = Math.min(Math.max(EDGE, side === 'above' ? above : below), vh - hgt - EDGE);
  if (top < rect.bottom && top + hgt > rect.top) side = 'none';

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;

  const line = (side === 'below' ? rect.last : rect.first) ?? rect;
  const anchorX = (line.left + line.right) / 2 - Math.round(left);
  return {
    side,
    anchorX: Math.min(Math.max(anchorX, ARROW_INSET), w - ARROW_INSET),
  };
}

function arrowGlyph() {
  const ns = 'http://www.w3.org/2000/svg';
  const build = (className, fillPath, edgePath) => {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 8');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', className);
    for (const [cls, d] of [
      ['fill', fillPath],
      ['edge', edgePath],
    ]) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('class', cls);
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  };
  return h(
    'div',
    { class: 'arrow' },
    build('up', 'M0 8 L8 0 L16 8 Z', 'M0 8 L8 0 L16 8'),
    build('down', 'M0 0 L8 8 L16 0 Z', 'M0 0 L8 8 L16 0'),
  );
}

export function createUi(handlers) {
  let host = null;
  let shadow = null;
  let current = null;

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement(UI_HOST_TAG);
    host.setAttribute(
      'style',
      'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important;',
    );
    shadow = host.attachShadow({ mode: __E2E__ ? 'open' : 'closed' });
    shadow.append(h('style', null, tokensCss + uiCss));
    for (const type of ['keydown', 'keyup', 'keypress']) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }
    document.documentElement.append(host);
  }

  function dismiss(el) {
    el.style.pointerEvents = 'none';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.remove();
      return;
    }
    el.dataset.closing = '';
    const finish = () => el.remove();
    el.addEventListener('animationend', (e) => e.target === el && finish());
    setTimeout(finish, 250);
  }

  function reposition() {
    if (!current) return;
    const placed = place(current.el, current.getRect, current.prefer, current.gap ?? GAP);
    if (placed && current.framed) {
      current.el.dataset.side = placed.side;
      current.el.style.setProperty('--arrow-x', `${Math.round(placed.anchorX)}px`);
    }
  }

  function mount(next) {
    ensureHost();
    close({ save: true });
    current = next;
    shadow.append(next.el);
    reposition();
    window.addEventListener('scroll', reposition, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', reposition, { passive: true });
  }

  function close({ save = false } = {}) {
    if (!current) return;
    const closing = current;
    current = null;
    window.removeEventListener('scroll', reposition, { capture: true });
    window.removeEventListener('resize', reposition);
    dismiss(closing.el);
    closing.onClose?.({ save });
  }

  function isInside(event) {
    return !!host && event.composedPath().includes(host);
  }

  function swatchButton(color, pressed, onPick) {
    return h(
      'button',
      {
        class: 'swatch-btn',
        type: 'button',
        title: t(`color_${color.id}`),
        'aria-label': t(`color_${color.id}`),
        'aria-pressed': String(pressed),
        dataset: { color: color.id },
        style: { '--swatch': color.swatch },
        onclick: () => onPick(color.id),
      },
      h('span', { class: 'swatch' }),
    );
  }

  const keepSelection = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());

  function showHandle(getRect) {
    if (current?.kind === 'handle') {
      current.getRect = getRect;
      reposition();
      return;
    }
    const el = h(
      'button',
      {
        class: 'layer handle',
        type: 'button',
        title: t('handleLabel'),
        'aria-label': t('handleLabel'),
        onclick: () => showToolbar(getRect),
      },
      icon('highlighter', { size: 16 }),
    );
    keepSelection(el);
    mount({ kind: 'handle', el, getRect, prefer: 'end', gap: END_GAP });
  }

  function showToolbar(getRect) {
    const el = h(
      'div',
      { class: 'layer toolbar', role: 'toolbar', 'aria-label': t('extName') },
      COLORS.map((color) => swatchButton(color, false, (id) => handlers.onHighlight(id))),
      h('span', { class: 'divider' }),
      h(
        'button',
        {
          class: 'toolbar-note',
          type: 'button',
          onclick: () => handlers.onHighlightWithNote(),
        },
        icon('noteEdit', { size: 16 }),
        t('toolbarAddNote'),
      ),
    );
    keepSelection(el);
    mount({ kind: 'toolbar', el, getRect, prefer: 'end', gap: END_GAP });
  }

  function openPopover(annotation, getRect, { focus = false } = {}) {
    let color = annotation.color;
    const original = annotation.note || '';

    const textarea = h('textarea', {
      value: original,
      placeholder: t('notePlaceholder'),
      'aria-label': t('noteLabel'),
      spellcheck: 'true',
    });
    const autosize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
    };
    textarea.addEventListener('input', autosize);

    const swatches = h(
      'div',
      { class: 'swatches', role: 'group', 'aria-label': t('colorLabel') },
      COLORS.map((c) =>
        swatchButton(c, c.id === color, (id) => {
          color = id;
          for (const btn of swatches.children) btn.setAttribute('aria-pressed', String(btn.dataset.color === id));
          quote.style.setProperty('--swatch', colorById(id).swatch);
          handlers.onColorChange(annotation.id, id);
        }),
      ),
    );

    const deleteBtn = h(
      'button',
      {
        class: 'icon-btn danger',
        type: 'button',
        title: t('actionDelete'),
        'aria-label': t('actionDelete'),
        onclick: () => askToDelete(),
      },
      icon('delete', { size: 16 }),
    );

    const quote = h(
      'div',
      { class: 'quote', style: { '--swatch': colorById(color).swatch } },
      annotation.quote?.exact || '',
    );

    const edited = annotation.updatedAt - annotation.createdAt > 1000;
    const box = h(
      'div',
      { class: 'popover-box' },
      h(
        'div',
        { class: 'popover-head' },
        swatches,
        h(
          'div',
          { class: 'head-actions' },
          deleteBtn,
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              title: t('actionClose'),
              'aria-label': t('actionClose'),
              onclick: () => close(),
            },
            icon('close', { size: 16 }),
          ),
        ),
      ),
      quote,
      textarea,
      h(
        'div',
        { class: 'popover-foot' },
        h(
          'span',
          { class: 'meta' },
          t(edited ? 'metaEdited' : 'metaCreated', relativeTime(edited ? annotation.updatedAt : annotation.createdAt)),
        ),
        h(
          'div',
          { class: 'foot-actions' },
          h('kbd', null, isMac ? '⌘ ↵' : 'Ctrl + ↵'),
          h(
            'button',
            {
              class: 'btn-primary',
              type: 'button',
              onclick: () => close({ save: true }),
            },
            t('actionSave'),
          ),
        ),
      ),
    );
    const el = h(
      'div',
      { class: 'layer popover', role: 'dialog', 'aria-label': t('noteLabel'), dataset: { side: 'none' } },
      arrowGlyph(),
      box,
    );

    const confirmation = () => box.querySelector('.confirm:not([data-closing])');

    function askToDelete() {
      if (confirmation()) return;
      const cancel = h(
        'button',
        { class: 'btn-outline', type: 'button', onclick: () => stopAsking() },
        t('actionCancel'),
      );
      const remove = h(
        'button',
        {
          class: 'btn-danger',
          type: 'button',
          onclick: () => {
            close();
            handlers.onDelete(annotation.id);
          },
        },
        t('actionDelete'),
      );
      const overlay = h(
        'div',
        { class: 'confirm', role: 'alertdialog', 'aria-label': t('confirmDeleteTitle') },
        h(
          'div',
          { class: 'confirm-card' },
          h('p', { class: 'confirm-title' }, t('confirmDeleteTitle')),
          h('p', { class: 'confirm-text' }, t('confirmDeleteText')),
          h('div', { class: 'confirm-actions' }, cancel, remove),
        ),
      );
      for (const child of box.children) child.inert = true;
      box.append(overlay);
      cancel.focus();
    }

    function stopAsking() {
      const overlay = confirmation();
      if (!overlay) return;
      dismiss(overlay);
      for (const child of box.children) if (child !== overlay) child.inert = false;
      textarea.focus({ preventScroll: true });
    }

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmation()) stopAsking();
        else close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirmation()) {
        e.preventDefault();
        close({ save: true });
      }
    });

    mount({
      kind: 'popover',
      id: annotation.id,
      el,
      getRect,
      prefer: 'below',
      gap: POPOVER_GAP,
      framed: true,
      onClose: ({ save }) => {
        handlers.onPopoverClose(annotation.id);
        if (save && textarea.value !== original) handlers.onNoteSave(annotation.id, textarea.value);
      },
    });
    autosize();
    reposition();
    if (focus) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  document.addEventListener(
    'mousedown',
    (e) => {
      if (current && !isInside(e)) close({ save: current.kind === 'popover' });
    },
    true,
  );

  return {
    showHandle,
    showToolbar,
    openPopover,
    close,
    reposition,
    isInside,
    get openKind() {
      return current?.kind ?? null;
    },
    get openAnnotationId() {
      return current?.kind === 'popover' ? current.id : null;
    },
  };
}
