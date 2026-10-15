import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { reducedMotion } from '../../shared/motion.js';

const GAP = 4;
const EDGE = 8;

function floatingList(anchor, { mode = 'auto', className = '' } = {}) {
  const list = h('div', { class: ['menu', className], popover: mode, role: 'listbox' });
  let closedAt = 0;
  list.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') {
      closedAt = Date.now();
      list.remove();
    }
  });

  function place() {
    const rect = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    list.style.minWidth = `${Math.round(rect.width)}px`;
    list.style.maxHeight = '';
    const below = vh - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const wanted = list.scrollHeight;
    const up = wanted > below && above > below;
    list.style.maxHeight = `${Math.max(120, Math.min(320, up ? above : below))}px`;
    const height = list.offsetHeight;
    const left = Math.max(EDGE, Math.min(rect.left, vw - list.offsetWidth - EDGE));
    list.style.left = `${Math.round(left)}px`;
    list.style.top = `${Math.round(up ? rect.top - GAP - height : rect.bottom + GAP)}px`;
    list.dataset.side = up ? 'above' : 'below';
  }

  return {
    list,
    get open() {
      return list.matches(':popover-open');
    },
    // A click on the anchor right after a light dismiss shouldn't open it again
    get justClosed() {
      return Date.now() - closedAt < 200;
    },
    show(children) {
      list.replaceChildren(...children);
      if (!list.isConnected) (anchor.closest('dialog[open]') ?? document.body).append(list);
      if (!this.open) list.showPopover();
      delete list.dataset.closing;
      place();
    },
    hide() {
      if (!this.open || list.dataset.closing != null) return;
      if (reducedMotion()) return list.hidePopover();
      list.dataset.closing = '';
      setTimeout(() => list.matches(':popover-open') && list.hidePopover(), 120);
    },
    place,
  };
}

function optionContent(option) {
  return [
    option.swatch && h('span', { class: 'swatch', style: { '--swatch': option.swatch } }),
    h('span', { class: 'menu-label' }, option.label),
  ].filter(Boolean);
}

export function dropdown({ options, value = null, placeholder = '', onChange, ariaLabel, className = '' }) {
  let current = value;
  const selected = () => options.find((o) => o.value === current);
  const label = h('span', { class: 'dropdown-value' });
  const trigger = h(
    'button',
    {
      class: ['input', 'dropdown', className],
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': ariaLabel,
    },
    label,
    icon('down', { size: 14, className: 'icon dropdown-chevron' }),
  );
  const menu = floatingList(trigger);
  menu.list.addEventListener('toggle', (e) => {
    trigger.setAttribute('aria-expanded', String(e.newState === 'open'));
    if (e.newState === 'closed' && menu.list.contains(document.activeElement)) trigger.focus();
  });

  function renderLabel() {
    const option = selected();
    label.replaceChildren(...(option ? optionContent(option) : [h('span', { class: 'dropdown-placeholder' }, placeholder)]));
  }

  function pick(option) {
    current = option.value;
    renderLabel();
    menu.hide();
    trigger.focus();
    onChange?.(option.value);
  }

  function open(focusLast = false) {
    const items = options.map((option) =>
      h(
        'button',
        {
          class: 'menu-item',
          type: 'button',
          role: 'option',
          'aria-selected': String(option.value === current),
          onclick: () => pick(option),
        },
        optionContent(option),
        option.value === current && icon('tick', { size: 14, className: 'icon menu-check' }),
      ),
    );
    menu.show(items);
    const start = items.find((item) => item.getAttribute('aria-selected') === 'true') ?? (focusLast ? items.at(-1) : items[0]);
    start?.focus({ preventScroll: true });
    start?.scrollIntoView({ block: 'nearest' });
  }

  trigger.addEventListener('click', () => {
    if (menu.open) menu.hide();
    else if (!menu.justClosed) open();
  });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open(e.key === 'ArrowUp');
    }
  });

  let typed = '';
  let typedTimer = null;
  menu.list.addEventListener('keydown', (e) => {
    const items = [...menu.list.querySelectorAll('.menu-item')];
    const at = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[Math.min(items.length - 1, at + 1)];
    else if (e.key === 'ArrowUp') next = items[Math.max(0, at - 1)];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items.at(-1);
    else if (e.key === 'Escape') {
      // Only the list closes, not the dialog it sits in
      e.preventDefault();
      e.stopPropagation();
      menu.hide();
      trigger.focus();
      return;
    } else if (e.key === 'Tab') {
      menu.hide();
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      clearTimeout(typedTimer);
      typed += e.key.toLowerCase();
      typedTimer = setTimeout(() => (typed = ''), 600);
      next = items.find((item) => item.textContent.trim().toLowerCase().startsWith(typed));
    } else return;
    e.preventDefault();
    next?.focus({ preventScroll: true });
    next?.scrollIntoView({ block: 'nearest' });
  });

  Object.defineProperty(trigger, 'value', { get: () => current });
  renderLabel();
  return trigger;
}

export function suggestions(input, items, { limit = 50 } = {}) {
  const menu = floatingList(input, { mode: 'manual', className: 'menu-suggestions' });
  let active = -1;
  let shown = [];

  function render() {
    const q = input.value.trim().toLowerCase();
    shown = items.filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q).slice(0, limit);
    if (!shown.length || document.activeElement !== input) {
      menu.hide();
      return;
    }
    active = Math.min(active, shown.length - 1);
    menu.show(
      shown.map((item, i) =>
        h(
          'button',
          {
            class: ['menu-item', i === active && 'active'],
            type: 'button',
            role: 'option',
            tabindex: '-1',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => take(item),
          },
          h('span', { class: 'menu-label' }, item),
        ),
      ),
    );
    menu.list.children[active]?.scrollIntoView({ block: 'nearest' });
  }

  function take(item) {
    input.value = item;
    active = -1;
    menu.hide();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  input.addEventListener('focus', render);
  input.addEventListener('input', render);
  input.addEventListener('blur', () => menu.hide());
  input.addEventListener('keydown', (e) => {
    if (!menu.open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      take(shown[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      menu.hide();
    }
  });
}
