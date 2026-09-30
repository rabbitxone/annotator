import { CONTEXT_LENGTH } from '../shared/constants.js';
import { describeQuote, findQuote, normalizeWithMap } from './anchoring-core.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME', 'SVG']);

export const UI_HOST_TAG = 'annotator-ui';

function acceptText(node) {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.localName === UI_HOST_TAG) return NodeFilter.FILTER_REJECT;
  }
  return NodeFilter.FILTER_ACCEPT;
}

export function collectTextNodes(root = document.body) {
  const nodes = [];
  if (!root) return { nodes, raw: '' };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: acceptText });
  let raw = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: raw.length });
    raw += node.data;
  }
  return { nodes, raw };
}

export function buildIndex() {
  const { nodes, raw } = collectTextNodes();
  const { text, map } = normalizeWithMap(raw);
  return { nodes, raw, text, map };
}

function rawOffsetOf(index, container, offset) {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((e) => e.node === container);
    if (entry) return entry.start + Math.min(offset, container.data.length);
  }
  const point = document.createRange();
  try {
    point.setStart(container, offset);
  } catch {
    return -1;
  }
  point.collapse(true);
  for (const entry of index.nodes) {
    if (point.comparePoint(entry.node, 0) >= 0) return entry.start;
  }
  return index.raw.length;
}

function normIndexOf(index, rawIndex) {
  let lo = 0;
  let hi = index.map.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (index.map[mid] < rawIndex) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function normToRaw(index, start, end) {
  if (end <= start) return null;
  return { rawStart: index.map[start], rawEnd: index.map[end - 1] + 1 };
}

export function describeRange(index, range) {
  const rawStart = rawOffsetOf(index, range.startContainer, range.startOffset);
  const rawEnd = rawOffsetOf(index, range.endContainer, range.endOffset);
  if (rawStart < 0 || rawEnd <= rawStart) return null;

  const selector = describeQuote(index.text, normIndexOf(index, rawStart), normIndexOf(index, rawEnd), CONTEXT_LENGTH);
  if (!selector.quote.exact) return null;
  const raw = normToRaw(index, selector.position.start, selector.position.end);
  return raw && { selector, ...raw };
}

export function resolve(index, annotation) {
  const hit = findQuote(index.text, annotation.quote || {}, annotation.position);
  return hit && normToRaw(index, hit.start, hit.end);
}
