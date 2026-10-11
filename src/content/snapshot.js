import { cleanTree, textHash } from '../shared/sanitize.js';
import { uuid } from '../shared/uuid.js';
import { MARK_TAG } from './highlighter.js';

const MIN_ARTICLE_CHARS = 500;
const MAX_HTML = 8 * 1024 * 1024;

// Prefer the article itself over the whole page, unless a highlight lives outside it.
function contentRoot() {
  let best = null;
  let bestLength = 0;
  for (const el of document.querySelectorAll('article, main, [role="main"]')) {
    const length = el.textContent.length;
    if (length > bestLength) {
      best = el;
      bestLength = length;
    }
  }
  if (!best || bestLength < MIN_ARTICLE_CHARS) return document.body;
  for (const mark of document.querySelectorAll(MARK_TAG)) {
    if (!best.contains(mark)) return document.body;
  }
  return best;
}

export function captureSnapshot(url) {
  if (!document.body) return null;
  const inert = document.implementation.createHTMLDocument('');
  const wrapper = inert.createElement('div');
  wrapper.append(cleanTree(contentRoot(), inert, { capture: true }));
  const html = wrapper.innerHTML;
  if (!wrapper.textContent.trim() || html.length > MAX_HTML) return null;
  return { id: uuid(), url, title: document.title, hash: textHash(wrapper.textContent), html };
}
