// Turns page markup into a small, inert, readable copy: only text-structure tags survive,
// and links/images keep nothing but http(s) addresses. Used both when a snapshot is taken
// and again when it is shown, because the stored HTML must never be trusted.

const KEEP = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'em', 'i', 'strong', 'b',
  'u', 's', 'del', 'ins', 'sub', 'sup', 'small', 'q', 'abbr', 'time', 'cite', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'dl', 'dt', 'dd', 'hr', 'br',
]);
const AS_DIV = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'details', 'summary', 'center', 'address']);
const DROP = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'svg', 'math', 'canvas',
  'video', 'audio', 'source', 'track', 'picture', 'map', 'form', 'input', 'button', 'select', 'option', 'textarea',
  'label', 'nav', 'dialog', 'menu', 'link', 'meta', 'head', 'title', 'base', 'annotator-ui', 'slot',
]);
const DROP_ROLES = new Set(['navigation', 'search', 'menu', 'menubar', 'toolbar', 'dialog', 'alertdialog', 'banner']);
const MAX_ELEMENTS = 60000;
const MAX_DATA_IMAGE = 100000;

export function safeHref(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

export function safeImageSrc(value) {
  if (typeof value !== 'string') return null;
  const src = value.trim();
  if (/^https?:\/\//i.test(src)) return src;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(src) && src.length <= MAX_DATA_IMAGE) return src;
  return null;
}

const span = (value) => (/^\d{1,3}$/.test(value ?? '') && Number(value) > 1 ? value : null);

function attributesFor(tag, el, capture) {
  const attrs = {};
  if (tag === 'a') {
    const href = safeHref(capture ? el.href : el.getAttribute('href'));
    if (href) attrs.href = href;
  } else if (tag === 'img') {
    const src = safeImageSrc(capture ? el.currentSrc || el.src || absolute(el, el.dataset?.src) : el.getAttribute('src'));
    if (!src) return null;
    attrs.src = src;
    const alt = el.getAttribute('alt');
    if (alt) attrs.alt = alt.slice(0, 500);
  } else if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const value = span(el.getAttribute(name));
      if (value) attrs[name] = value;
    }
  }
  return attrs;
}

function absolute(el, value) {
  if (!value) return '';
  try {
    return new URL(value, el.baseURI).href;
  } catch {
    return '';
  }
}

function hidden(el, capture) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
  if (DROP_ROLES.has(el.getAttribute('role'))) return true;
  return capture && el.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) === false;
}

/**
 * Copies `source`'s children into a fragment of `target` (an inert document), keeping
 * only whitelisted structure. `capture` reads live properties (resolved URLs, visibility).
 */
export function cleanTree(source, target, { capture = false } = {}) {
  let budget = MAX_ELEMENTS;
  const fragment = target.createDocumentFragment();

  function copyChildren(from, to) {
    for (let node = from.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3) {
        to.append(target.createTextNode(node.data));
      } else if (node.nodeType === 1) {
        copyElement(node, to);
      } else if (node.nodeType === 11) {
        copyChildren(node, to);
      }
    }
  }

  function copyElement(el, to) {
    if (--budget < 0) return;
    const tag = el.localName;
    if (DROP.has(tag) || hidden(el, capture)) return;
    if (KEEP.has(tag)) {
      const attrs = attributesFor(tag, el, capture);
      if (!attrs) return;
      const copy = target.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) copy.setAttribute(name, value);
      to.append(copy);
      copyChildren(el, copy);
      if (tag === 'a' && !copy.hasChildNodes()) copy.remove();
    } else if (AS_DIV.has(tag)) {
      const copy = target.createElement('div');
      copyChildren(el, copy);
      if (copy.hasChildNodes()) to.append(copy);
    } else {
      // Unknown or presentational (span, font, custom elements, our own marks): keep the content only.
      copyChildren(el, to);
      if (capture && el.shadowRoot) copyChildren(el.shadowRoot, to);
    }
  }

  copyChildren(source, fragment);
  return fragment;
}

export function textHash(text) {
  let hash = 0x811c9dc5;
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
