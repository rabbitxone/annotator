import { api } from '../shared/api.js';
import { cleanTree, textHash } from '../shared/sanitize.js';
import { uuid } from '../shared/uuid.js';
import { MARK_TAG } from './highlighter.js';

const MIN_ARTICLE_CHARS = 500;
const MAX_HTML = 8 * 1024 * 1024;

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

async function loadReadability() {
  if (!globalThis.__annotatorReadability) await api.runtime.sendMessage({ type: 'load-reader' }).catch(() => null);
  return globalThis.__annotatorReadability ?? null;
}

// Reader View's own extraction, run on an inert, already filtered copy of the page.
// It is used only if every highlighted passage made it into the article.
async function readerArticle(quotes) {
  const Readability = await loadReadability();
  if (!Readability) return null;
  const doc = document.implementation.createHTMLDocument(document.title);
  doc.body.append(cleanTree(document.body, doc, { capture: true, keepHints: true }));
  try {
    const article = new Readability(doc, { keepClasses: false }).parse();
    if (!article?.content) return null;
    const text = squash(article.textContent);
    if (!quotes.every((quote) => text.includes(squash(quote)))) return null;
    return new DOMParser().parseFromString(article.content, 'text/html').body;
  } catch {
    return null;
  }
}

// Fallback: the page's own <article>/<main>, unless a highlight lives outside it.
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

export async function captureSnapshot(url, quotes = []) {
  if (!document.body) return null;
  const inert = document.implementation.createHTMLDocument('');
  const wrapper = inert.createElement('div');
  const article = await readerArticle(quotes.filter(Boolean));
  wrapper.append(article ? cleanTree(article, inert) : cleanTree(contentRoot(), inert, { capture: true }));
  const html = wrapper.innerHTML;
  if (!wrapper.textContent.trim() || html.length > MAX_HTML) return null;
  return { id: uuid(), url, title: document.title, hash: textHash(wrapper.textContent), reader: !!article, html };
}
