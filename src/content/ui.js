import { categoryForKey } from '../shared/categories.js';
import { colorById, getCategories } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import { relativeTime, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { keysNode } from '../shared/keys.js';
import { installTooltips } from '../shared/tooltip.js';
import tokensCss from '../shared/tokens.css';
import uiCss from './ui.css';
import { UI_HOST_TAG } from './anchoring.js';

const GAP = 8;
const END_GAP = 4;
const POPOVER_GAP = 10;
const ARROW_INSET = 20;
const EDGE = 8;
const TOOLBAR_SWATCHES = 6;
const POPOVER_SWATCHES = 5;
// The keys that pick a category: its own letter (if it has one) and its position
const keyHint = (category, index, { letter = true } = {}) =>
  [letter && category.key?.toUpperCase(), index < 9 ? String(index + 1) : null].filter(Boolean);
// The key that was meant, also on keyboards that don't type Latin letters (e.key is then "ф")
export function pressedKey(e) {
  if (/^[a-z0-9/]$/i.test(e.key)) return e.key.toLowerCase();
  const code = /^(?:Key([A-Z])|Digit(\d)|Numpad(\d))$/.exec(e.code ?? '');
  if (code) return (code[1] ?? code[2] ?? code[3]).toLowerCase();
  return e.code === 'Slash' ? '/' : e.key;
}
const digitIndex = (key) => (/^[1-9]$/.test(key) ? Number(key) - 1 : -1);
const hintNodes = (keys) => keys.map((key) => keysNode([key], { className: 'key-chip' }));

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
    installTooltips(shadow, { topLayer: false });
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

  // When what a layer points at scrolls out of view, the layer fades away instead of sticking
  // to the edge of the window, and comes back with it.
  function setOffscreen(layer, off) {
    if (layer.offscreen === off) return;
    layer.offscreen = off;
    const { el } = layer;
    el.inert = off;
    el.style.pointerEvents = off ? 'none' : '';
    if (off && el.contains(shadow.activeElement)) shadow.activeElement.blur();
    layer.fade?.cancel();
    const frames = [{ opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }, { opacity: 0, filter: 'blur(4px)', transform: 'scale(0.97)' }];
    layer.fade = el.animate(off ? frames : frames.reverse(), {
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160,
      easing: off ? 'ease-in' : 'ease-out',
      fill: off ? 'forwards' : 'none',
    });
  }

  function isOffscreen(rect) {
    if (!rect) return true;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    return rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > vw;
  }

  function reposition() {
    if (!current) return;
    const off = isOffscreen(current.getRect());
    setOffscreen(current, off);
    if (off) return;
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

  function swatchButton(color, pressed, onPick, hint) {
    return h(
      'button',
      {
        class: 'swatch-btn',
        type: 'button',
        title: color.name,
        'aria-label': color.name,
        'data-tip-keys': hint?.length ? hint.join('|') : null,
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

  function categoryItem(category, index, { active, onPick, onHover, typeToFilter = false }) {
    return h(
      'li',
      { role: 'presentation' },
      h(
        'button',
        {
          class: ['picker-item', active && 'active'],
          type: 'button',
          role: 'option',
          'aria-selected': String(!!active),
          dataset: { id: category.id },
          style: { '--swatch': category.swatch },
          onclick: () => onPick(category.id),
          onmouseenter: onHover,
        },
        h('span', { class: 'swatch' }),
        h('span', { class: 'picker-name' }, category.name),
        h('span', { class: 'key-hints' }, hintNodes(keyHint(category, index, { letter: !typeToFilter }))),
      ),
    );
  }

  // A list you filter by typing. It never takes focus, so the selection on the page stays put.
  function showPicker(getRect) {
    let query = '';
    let active = 0;
    const list = h('ul', { class: 'picker-list', role: 'listbox' });
    const label = h('div', { class: 'picker-query' });
    const matches = () => {
      const q = query.trim().toLowerCase();
      return getCategories()
        .map((category, index) => ({ category, index }))
        .filter(({ category }) => !q || category.name.toLowerCase().includes(q));
    };
    function render() {
      const items = matches();
      active = Math.min(active, Math.max(0, items.length - 1));
      label.textContent = query || t('pickerTypeToFilter');
      label.dataset.empty = query ? '' : 'true';
      list.replaceChildren(
        ...(items.length
          ? items.map(({ category, index }, i) =>
            categoryItem(category, index, {
              typeToFilter: true,
              active: i === active,
              onPick: (id) => handlers.onHighlight(id),
              onHover: () => {
                active = i;
                for (const [n, row] of [...list.children].entries()) row.firstChild.classList.toggle('active', n === i);
              },
            }),
          )
          : [h('li', { class: 'picker-empty' }, t('pickerNoMatch'))]),
      );
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    }
    const handleKey = (e) => {
      const items = matches();
      const digit = digitIndex(pressedKey(e));
      if (e.key === 'Escape') close();
      else if (digit >= 0) {
        // Digits pick by position, as the hints say; letters type the filter
        const category = getCategories()[digit];
        if (category) handlers.onHighlight(category.id);
      }
      else if (e.key === 'Enter') items[active] && handlers.onHighlight(items[active].category.id);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        active = items.length ? (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length : 0;
        render();
      } else if (e.key === 'Backspace') {
        query = query.slice(0, -1);
        render();
      } else if (e.key.length === 1) {
        query += e.key;
        active = 0;
        render();
      } else return false;
      return true;
    };
    const el = h('div', { class: 'layer picker', role: 'dialog', 'aria-label': t('toolbarMore') }, label, list);
    keepSelection(el);
    mount({ kind: 'picker', el, getRect, prefer: 'end', gap: END_GAP, handleKey });
    render();
  }

  function showToolbar(getRect) {
    const categories = getCategories();
    const noteKeyTaken = !!categoryForKey(categories, 'n');
    const el = h(
      'div',
      { class: 'layer toolbar', role: 'toolbar', 'aria-label': t('extName') },
      categories.slice(0, TOOLBAR_SWATCHES).map((color, i) => swatchButton(color, false, (id) => handlers.onHighlight(id), keyHint(color, i))),
      categories.length > TOOLBAR_SWATCHES &&
      h(
        'button',
        {
          class: 'icon-btn toolbar-more',
          type: 'button',
          title: t('toolbarMore'),
          'data-tip-keys': '/',
          'aria-label': t('toolbarMore'),
          onclick: () => showPicker(getRect),
        },
        icon('more', { size: 16 }),
      ),
      h('span', { class: 'divider' }),
      h(
        'button',
        {
          class: 'toolbar-note',
          type: 'button',
          title: t('toolbarAddNote'),
          'data-tip-keys': noteKeyTaken ? null : 'N',
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

    const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': t('colorLabel') });
    const categoryMenu = h('ul', { class: 'picker-list popover-categories', role: 'listbox', hidden: true });

    let menuOpen = false;

    function pickCategory(id) {
      color = id;
      quote.style.setProperty('--swatch', colorById(id).swatch);
      if (menuOpen) setMenu(false);
      else renderSwatches();
      handlers.onColorChange(annotation.id, id);
    }

    // Unfolds and folds the full list; the popover keeps hugging its highlight meanwhile.
    function setMenu(open) {
      if (open === menuOpen) return;
      menuOpen = open;
      if (open) {
        categoryMenu.replaceChildren(
          ...getCategories().map((c, i) => categoryItem(c, i, { active: c.id === color, onPick: pickCategory, onHover: () => { } })),
        );
        categoryMenu.hidden = false;
      }
      renderSwatches();
      const done = () => {
        if (!menuOpen) categoryMenu.hidden = true;
        reposition();
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
      categoryMenu.getAnimations().forEach((a) => a.cancel());
      const height = categoryMenu.scrollHeight;
      const shut = { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', borderBottomWidth: '0px' };
      const full = { height: `${height}px`, opacity: 1 };
      const motion = categoryMenu.animate(open ? [shut, full] : [full, shut], {
        duration: open ? 220 : 160,
        easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'ease-in',
      });
      const follow = () => {
        reposition();
        if (motion.playState === 'running') requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
      motion.finished.then(done, () => { });
    }

    function renderSwatches() {
      const categories = getCategories();
      let shown = categories.slice(0, POPOVER_SWATCHES);
      if (!shown.some((c) => c.id === color)) shown = [...shown, colorById(color)];
      swatches.replaceChildren(
        ...shown.map((c) => swatchButton(c, c.id === color, pickCategory, keyHint(c, categories.indexOf(c)))),
        ...(categories.length > POPOVER_SWATCHES
          ? [
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                title: t('toolbarMore'),
                'aria-label': t('toolbarMore'),
                'aria-expanded': String(menuOpen),
                onclick: () => setMenu(!menuOpen),
              },
              icon('more', { size: 16 }),
            ),
          ]
          : []),
      );
    }

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

    const copyBtn = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: t('actionCopyQuote'),
        'aria-label': t('actionCopyQuote'),
        onclick: async () => {
          if (!(await handlers.onCopy(annotation.id))) return;
          copyBtn.replaceChildren(icon('tick', { size: 16 }));
          copyBtn.title = t('toastCopied');
          setTimeout(() => {
            copyBtn.replaceChildren(icon('copy', { size: 16 }));
            copyBtn.title = t('actionCopyQuote');
          }, 1500);
        },
      },
      icon('copy', { size: 16 }),
    );

    const quote = h(
      'div',
      { class: 'quote', style: { '--swatch': colorById(color).swatch } },
      annotation.quote?.exact || '',
    );

    renderSwatches();

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
          copyBtn,
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
      categoryMenu,
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
          keysNode(['mod', 'Enter'], { className: 'key-chip' }),
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
          h('div', { class: 'confirm-panel' }, h('p', { class: 'confirm-text' }, t('confirmDeleteText')), h('div', { class: 'confirm-actions' }, cancel, remove)),
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

    // Keys reach this wherever focus is (on the page, in the popover), except while typing:
    // Esc steps back (confirmation, then the list, then the popover), a digit or a category's
    // letter recolors.
    function handleKey(e) {
      const origin = e.composedPath()[0];
      if (e.key === 'Escape') {
        if (confirmation()) stopAsking();
        else if (menuOpen) setMenu(false);
        else close();
        return true;
      }
      if (confirmation() || e.repeat) return false;
      if (origin instanceof Element && (origin.isContentEditable || origin.closest('input, textarea, select'))) return false;
      const key = pressedKey(e);
      const categories = getCategories();
      const category = categoryForKey(categories, key) ?? categories[digitIndex(key)];
      if (!category) return false;
      pickCategory(category.id);
      return true;
    }

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirmation()) {
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
      handleKey,
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
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (current?.kind === 'popover' && !current.offscreen) {
        if (current.handleKey(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (current?.kind === 'picker') {
        if (current.handleKey(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (current?.kind !== 'toolbar') return;
      const categories = getCategories();
      const key = pressedKey(e);
      const byKey = categoryForKey(categories, key);
      const byDigit = categories[digitIndex(key)] ?? null;
      if (byKey || byDigit) handlers.onHighlight((byKey ?? byDigit).id);
      else if (key === 'n') handlers.onHighlightWithNote();
      else if (key === '/' && categories.length > TOOLBAR_SWATCHES) showPicker(current.getRect);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  document.addEventListener(
    'mousedown',
    (e) => {
      if (current && !isInside(e)) close({ save: current.kind === 'popover' });
    },
    true,
  );

  function shadowRoot() {
    ensureHost();
    return shadow;
  }

  return {
    shadowRoot,
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
