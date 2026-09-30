import { COLORS, withAlpha } from '../shared/constants.js';
import { collectTextNodes } from './anchoring.js';
import { canvasColor, toneFor } from './tone.js';

export const MARK_TAG = 'annotator-mark';
const STYLE_ID = 'annotator-highlight-style';

const NO_WRAP_PARENTS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'UL', 'OL', 'DL', 'SELECT', 'COLGROUP']);

export function highlightCss(style) {
  const rules = [
    `
${MARK_TAG} {
  display: inline !important;
  color: inherit !important;
  cursor: pointer !important;
  border-radius: 2px !important;
  -webkit-box-decoration-break: clone !important;
  box-decoration-break: clone !important;
  transition: box-shadow 300ms ease, background-color 200ms ease !important;
}`,
  ];
  const underline = (line) =>
    `background-color: transparent !important; text-decoration: underline 2px ${line} !important; text-underline-offset: 3px !important; text-decoration-skip-ink: none !important;`;

  for (const c of COLORS) {
    const light = `${MARK_TAG}[data-color="${c.id}"]`;
    const dark = `${MARK_TAG}[data-tone="dark"][data-color="${c.id}"]`;
    rules.push(
      style === 'underline'
        ? `${light} { ${underline(c.swatch)} }\n${dark} { ${underline(c.swatchDark)} }`
        : `${light} { background-color: ${c.fill} !important; }\n${dark} { background-color: ${c.fillDark} !important; }`,
    );
    rules.push(
      `${light}[data-annotator-active] { box-shadow: 0 0 0 2px ${withAlpha(c.swatch, 0.75)} !important; }`,
      `${dark}[data-annotator-active] { box-shadow: 0 0 0 2px ${withAlpha(c.swatchDark, 0.8)} !important; }`,
      `${light}[data-annotator-flash] { box-shadow: 0 0 0 4px ${withAlpha(c.swatch, 0.5)} !important; }`,
      `${dark}[data-annotator-flash] { box-shadow: 0 0 0 4px ${withAlpha(c.swatchDark, 0.55)} !important; }`,
    );
  }
  return rules.join('\n');
}

export function applyHighlightStyle(style) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    (document.head || document.documentElement).append(el);
  }
  el.textContent = highlightCss(style);
}

export function wrapRange(rawStart, rawEnd, annotation) {
  const { nodes } = collectTextNodes();
  const marks = [];

  for (const { node, start } of nodes) {
    const end = start + node.data.length;
    if (end <= rawStart) continue;
    if (start >= rawEnd) break;

    const from = Math.max(0, rawStart - start);
    const to = Math.min(node.data.length, rawEnd - start);
    if (!node.data.slice(from, to).trim()) continue;
    if (NO_WRAP_PARENTS.has(node.parentNode?.nodeName)) continue;

    let target = node;
    if (to < target.data.length) target.splitText(to);
    if (from > 0) target = target.splitText(from);

    const mark = document.createElement(MARK_TAG);
    mark.dataset.annotationId = annotation.id;
    mark.dataset.color = annotation.color;
    target.parentNode.insertBefore(mark, target);
    mark.append(target);
    marks.push(mark);
  }
  return marks;
}

export function unwrap(marks) {
  for (const mark of marks) {
    if (!mark.isConnected) continue;
    mark.replaceWith(...mark.childNodes);
  }
}

export function refreshTones(marks) {
  const cache = new Map();
  const canvas = canvasColor();
  for (const mark of marks) {
    if (mark.isConnected) mark.dataset.tone = toneFor(mark, cache, canvas);
  }
}

export function setColor(marks, color) {
  for (const mark of marks) mark.dataset.color = color;
}

export function setActive(marks, active) {
  for (const mark of marks) {
    if (active) mark.dataset.annotatorActive = '';
    else delete mark.dataset.annotatorActive;
  }
}

export function flash(marks) {
  for (const mark of marks) mark.dataset.annotatorFlash = '';
  setTimeout(() => {
    for (const mark of marks) delete mark.dataset.annotatorFlash;
  }, 1600);
}

export function boundsOf(marks) {
  const rects = marks.filter((m) => m.isConnected).flatMap((m) => Array.from(m.getClientRects()));
  if (rects.length === 0) return null;
  return {
    top: Math.min(...rects.map((r) => r.top)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    first: rects[0],
    last: rects[rects.length - 1],
  };
}

export function selectionEndRect(range) {
  const root = range.commonAncestorContainer;
  const { nodes } = collectTextNodes(root.nodeType === Node.TEXT_NODE ? root.parentElement : root);
  let last = null;
  for (const { node } of nodes) {
    if (node.data.trim() && range.intersectsNode(node)) last = node;
  }
  if (!last) return null;

  const part = document.createRange();
  part.selectNodeContents(last);
  if (last === range.startContainer) part.setStart(last, range.startOffset);
  if (last === range.endContainer) part.setEnd(last, range.endOffset);
  const rects = Array.from(part.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  return rects[rects.length - 1] ?? null;
}
