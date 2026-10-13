import { h } from './dom.js';
import { shortcutNode } from './keys.js';
import { reducedMotion } from './motion.js';
import tooltipCss from './tooltip.css';

const SHOW_DELAY = 400;
const GAP = 6;
const EDGE = 8;

/**
 * Replaces the browser's own tooltips under `root` (a document or a shadow root) with ours.
 * Every `title` is moved to `data-tip` as soon as it appears, so the native one never shows.
 * `data-tip-keys="mod+Enter"` adds the keys next to the text; "Y|1" means either key.
 * In pages the tooltip goes into the top layer (popover), so it shows above an open dialog.
 */
export function installTooltips(root = document, { topLayer = true } = {}) {
  const host = root instanceof Document ? root.body : root;
  host.append(h('style', null, tooltipCss));

  let tip = null;
  let target = null;
  let timer = null;

  function adopt(el) {
    const title = el.getAttribute('title');
    if (title == null) return;
    el.removeAttribute('title');
    if (!title) return;
    el.dataset.tip = title;
    // The title was the only name some icon buttons had
    if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', title);
  }

  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('title')) adopt(node);
    for (const el of node.querySelectorAll('[title]')) adopt(el);
  };
  scan(root instanceof Document ? root.documentElement : root);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') adopt(record.target);
      else record.addedNodes.forEach(scan);
    }
  }).observe(root instanceof Document ? root.documentElement : root, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  function hide() {
    clearTimeout(timer);
    target = null;
    if (!tip) return;
    const old = tip;
    tip = null;
    if (reducedMotion()) return remove(old);
    old.dataset.closing = '';
    setTimeout(() => remove(old), 120);
  }

  function remove(el) {
    if (topLayer && el.matches(':popover-open')) el.hidePopover();
    el.remove();
  }

  function place(el, anchor) {
    const rect = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - EDGE));
    const below = rect.bottom + GAP;
    const above = rect.top - GAP - hgt;
    const top = below + hgt <= vh - EDGE || above < EDGE ? below : above;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.dataset.side = top === below ? 'below' : 'above';
  }

  function show(anchor) {
    if (!anchor.isConnected || !anchor.dataset.tip) return;
    if (tip) remove(tip);
    const keys = anchor.dataset.tipKeys?.split('|').filter(Boolean) ?? [];
    tip = h(
      'div',
      { class: 'tooltip', role: 'tooltip', popover: topLayer ? 'manual' : null },
      h('span', null, anchor.dataset.tip),
      keys.length > 0 && h('span', { class: 'tooltip-keys' }, keys.map((k) => shortcutNode(k, { className: 'tooltip-kbd', size: 11 }))),
    );
    // Inside a modal dialog, only the dialog's own subtree is above the backdrop
    const parent = root instanceof Document ? (root.querySelector('dialog[open]') ?? root.body) : root;
    parent.append(tip);
    if (topLayer) tip.showPopover?.();
    place(tip, anchor);
  }

  function schedule(anchor, delay) {
    if (anchor === target) return;
    hide();
    target = anchor;
    timer = setTimeout(() => show(anchor), delay);
  }

  const tipFor = (e) => {
    const el = e.composedPath().find((node) => node instanceof Element && (node.hasAttribute('title') || node.dataset?.tip));
    if (el?.hasAttribute('title')) adopt(el);
    return el?.dataset.tip ? el : null;
  };

  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const anchor = tipFor(e);
    if (anchor) schedule(anchor, tip ? 0 : SHOW_DELAY);
    else if (target) hide();
  });
  root.addEventListener('pointerout', (e) => {
    if (target && !target.contains(e.relatedTarget)) hide();
  });
  root.addEventListener('focusin', (e) => {
    const anchor = tipFor(e);
    // Only for keyboard focus, so a click doesn't leave a tooltip behind
    if (anchor?.matches(':focus-visible')) schedule(anchor, SHOW_DELAY);
  });
  root.addEventListener('focusout', hide);
  root.addEventListener('pointerdown', hide, true);
  window.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => e.key === 'Escape' && hide(), true);
  window.addEventListener('blur', hide);
}
