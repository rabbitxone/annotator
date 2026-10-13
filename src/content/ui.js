import { categoryForKey } from '../shared/categories.js';
import { colorById, getCategories } from '../shared/constants.js';
import { h } from '../shared/dom.js';
import { relativeTime, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { formatKeys } from '../shared/platform.js';
import tokensCss from '../shared/tokens.css';
import uiCss from './ui.css';
import { UI_HOST_TAG } from './anchoring.js';

const GAP = 8;
const END_GAP = 4;
const POPOVER_GAP = 10;
const ARROW_INSET = 20;
const EDGE = 8;
const SAVE_KEYS = formatKeys(['mod', 'Enter']);
const TOOLBAR_SWATCHES = 6;
const POPOVER_SWATCHES = 5;
const keyHint = (category, index) =>
  [category.key?.toUpperCase(), index < 9 ? String(index + 1) : null].filter(Boolean).join(' / ');

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

  function swatchButton(color, pressed, onPick, hint) {
    return h(
      'button',
      {
        class: 'swatch-btn',
        type: 'button',
        title: hint ? `${color.name} (${hint})` : color.name,
        'aria-label': color.name,
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

  function categoryItem(category, index, { active, onPick, onHover }) {
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
        keyHint(category, index) && h('kbd', null, keyHint(category, index)),
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
      if (e.key === 'Escape') close();
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
          title: `${t('toolbarMore')} (/)`,
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
          title: noteKeyTaken ? t('toolbarAddNote') : `${t('toolbarAddNote')} (N)`,
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

    function pickCategory(id) {
      color = id;
      quote.style.setProperty('--swatch', colorById(id).swatch);
      categoryMenu.hidden = true;
      renderSwatches();
      handlers.onColorChange(annotation.id, id);
      reposition();
    }

    function renderSwatches() {
      const categories = getCategories();
      let shown = categories.slice(0, POPOVER_SWATCHES);
      if (!shown.some((c) => c.id === color)) shown = [...shown, colorById(color)];
      swatches.replaceChildren(
        ...shown.map((c) => swatchButton(c, c.id === color, pickCategory)),
        ...(categories.length > POPOVER_SWATCHES
          ? [
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                title: t('toolbarMore'),
                'aria-label': t('toolbarMore'),
                'aria-expanded': String(!categoryMenu.hidden),
                onclick: () => {
                  categoryMenu.hidden = !categoryMenu.hidden;
                  categoryMenu.replaceChildren(
                    ...categories.map((c, i) => categoryItem(c, i, { active: c.id === color, onPick: pickCategory, onHover: () => { } })),
                  );
                  renderSwatches();
                  reposition();
                },
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
          h('kbd', null, SAVE_KEYS),
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
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (current?.kind === 'picker') {
        if (current.handleKey(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (current?.kind !== 'toolbar') return;
      const categories = getCategories();
      const byKey = categoryForKey(categories, e.key);
      const byDigit = /^[1-9]$/.test(e.key) ? categories[Number(e.key) - 1] : null;
      if (byKey || byDigit) handlers.onHighlight((byKey ?? byDigit).id);
      else if (e.key === 'n' || e.key === 'N') handlers.onHighlightWithNote();
      else if (e.key === '/' && categories.length > TOOLBAR_SWATCHES) showPicker(current.getRect);
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
