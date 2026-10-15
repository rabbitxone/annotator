import { h } from './dom.js';

const SAFE_HREF = /^(https?:|mailto:)/i;

const INLINE = new RegExp(
  [
    '`(?<code>[^`\\n]+)`',
    '\\[(?<label>[^\\]\\n]+)\\]\\((?<href>[^)\\s]+)\\)',
    '\\*\\*(?<strong>[^*\\n]+?)\\*\\*',
    '(?<![\\w*])\\*(?<em>[^*\\s][^*\\n]*?)\\*(?![\\w*])',
    '(?<![\\w_])_(?<em2>[^_\\s][^_\\n]*?)_(?![\\w_])',
    '(?<url>https?:\\/\\/[^\\s<>]*[^\\s<>.,:;"\'!?)\\]])',
  ].join('|'),
  'g',
);

export function parseInline(text) {
  const tokens = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) tokens.push({ type: 'text', text: text.slice(last, m.index) });
    const g = m.groups;
    if (g.code != null) tokens.push({ type: 'code', text: g.code });
    else if (g.label != null && SAFE_HREF.test(g.href)) tokens.push({ type: 'link', href: g.href, children: parseInline(g.label) });
    else if (g.label != null) tokens.push({ type: 'text', text: m[0] });
    else if (g.strong != null) tokens.push({ type: 'strong', children: parseInline(g.strong) });
    else if (g.em != null || g.em2 != null) tokens.push({ type: 'em', children: parseInline(g.em ?? g.em2) });
    else if (g.url != null) tokens.push({ type: 'link', href: g.url, children: [{ type: 'text', text: g.url }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) });
  return tokens;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(text) {
  const blocks = [];
  let current = null;
  for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line);
    const ordered = !bullet && ORDERED.exec(line);
    const listType = bullet ? 'ul' : ordered ? 'ol' : null;
    if (listType) {
      if (current?.type !== listType) blocks.push((current = { type: listType, items: [] }));
      current.items.push(parseInline((bullet ?? ordered)[1]));
    } else if (!line.trim()) {
      current = null;
    } else {
      if (current?.type !== 'p') blocks.push((current = { type: 'p', lines: [] }));
      current.lines.push(parseInline(line));
    }
  }
  return blocks;
}

function renderInline(tokens) {
  return tokens.map((token) => {
    switch (token.type) {
      case 'code':
        return h('code', null, token.text);
      case 'strong':
        return h('strong', null, renderInline(token.children));
      case 'em':
        return h('em', null, renderInline(token.children));
      case 'link':
        return h('a', { href: token.href, target: '_blank', rel: 'noopener noreferrer' }, renderInline(token.children));
      default:
        return token.text;
    }
  });
}

export function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  for (const block of parseMarkdown(text)) {
    if (block.type === 'p') {
      fragment.append(h('p', null, block.lines.flatMap((line, i) => (i ? [h('br'), ...renderInline(line)] : renderInline(line)))));
    } else {
      fragment.append(h(block.type, null, block.items.map((item) => h('li', null, renderInline(item)))));
    }
  }
  return fragment;
}

export function highlightHits(root, query) {
  if (!query) return;
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  for (const node of nodes) {
    const haystack = node.data.toLowerCase();
    if (haystack.length !== node.data.length) continue;
    let at = haystack.indexOf(needle);
    if (at === -1) continue;
    const parts = [];
    let last = 0;
    for (; at !== -1; at = haystack.indexOf(needle, last)) {
      if (at > last) parts.push(node.data.slice(last, at));
      parts.push(h('span', { class: 'hit' }, node.data.slice(at, at + needle.length)));
      last = at + needle.length;
    }
    if (last < node.data.length) parts.push(node.data.slice(last));
    node.replaceWith(...parts);
  }
}
