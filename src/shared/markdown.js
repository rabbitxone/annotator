import { h } from './dom.js';

const SAFE_HREF = /^(https?:|mailto:)/i;

const INLINE = new RegExp(
  [
    '\\\\(?<esc>[\\\\`*_[\\]()#+\\-.!>~|])',
    '`(?<code>[^`\\n]+)`',
    '\\[(?<label>[^\\]\\n]+)\\]\\((?<href>[^)\\s]+)\\)',
    '\\*\\*(?<strong>[^*\\n]+?)(?<!\\\\)\\*\\*',
    '(?<![\\w*])\\*(?<em>[^*\\s][^*\\n]*?)(?<!\\\\)\\*(?![\\w*])',
    '(?<![\\w_])_(?<em2>[^_\\s][^_\\n]*?)(?<!\\\\)_(?![\\w_])',
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
    if (g.esc != null) tokens.push({ type: 'text', text: g.esc });
    else if (g.code != null) tokens.push({ type: 'code', text: g.code });
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

export function markdownSpans(text, base = 0) {
  const nodes = [];
  let last = 0;
  const plain = (to) => to > last && nodes.push({ type: 'text', text: text.slice(last, to) });
  for (const m of text.matchAll(INLINE)) {
    const g = m.groups;
    const start = base + m.index;
    const end = start + m[0].length;
    let node;
    if (g.esc != null) node = { type: 'escape', open: '\\', children: [{ type: 'text', text: g.esc }] };
    else if (g.code != null) node = { type: 'code', open: '`', close: '`', children: [{ type: 'text', text: g.code }] };
    else if (g.label != null && SAFE_HREF.test(g.href)) node = { type: 'link', href: g.href, open: '[', close: `](${g.href})`, children: markdownSpans(g.label, start + 1) };
    else if (g.label != null) continue;
    else if (g.strong != null) node = { type: 'strong', open: '**', close: '**', children: markdownSpans(g.strong, start + 2) };
    else if (g.em != null || g.em2 != null) node = { type: 'em', open: m[0][0], close: m[0][0], children: markdownSpans(g.em ?? g.em2, start + 1) };
    else node = { type: 'url', href: g.url, children: [{ type: 'text', text: g.url }] };
    plain(m.index);
    nodes.push({ ...node, start, end });
    last = m.index + m[0].length;
  }
  plain(text.length);
  return nodes;
}

const LIST_MARK = /^(\s*)([-*+]|\d+[.)])(?=\s)/;

export function markdownLineSpans(text) {
  const nodes = [];
  let offset = 0;
  for (const [i, line] of text.split('\n').entries()) {
    if (i) nodes.push({ type: 'text', text: '\n' });
    const list = LIST_MARK.exec(line);
    if (list) {
      if (list[1]) nodes.push({ type: 'text', text: list[1] });
      nodes.push({ type: /\d/.test(list[2]) ? 'number' : 'bullet', children: [{ type: 'text', text: list[2] }] });
    }
    const skip = list?.[0].length ?? 0;
    nodes.push(...markdownSpans(line.slice(skip), offset + skip));
    offset += line.length + 1;
  }
  return nodes;
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
