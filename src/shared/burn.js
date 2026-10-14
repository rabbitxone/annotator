import { decodeHTML } from 'entities';
import { parse } from 'parse5';
import { findQuote, normalizeWithMap } from '../content/anchoring-core.js';
import { BURN_FORMAT, BURN_VERSION } from './burned-data.js';
import { isValidCategoryId } from './categories.js';

/**
 * Burning highlights into an HTML file: the notes become part of the file itself, so git can track
 * them and no cleared browser history can lose them.
 *
 * Two things are written, both inside one block that is replaced whenever the file is saved again:
 *   - the notes as JSON (the source of truth, what the extension restores from), and
 *   - a <mark> around each highlighted passage plus a little CSS, so the file also looks
 *     highlighted in any browser, with or without the extension.
 * Everything else in the file stays byte for byte as it was (line endings and all): marks are
 * inserted at the positions the parser reports in the source, nothing is re-serialized.
 */

export { BURN_FORMAT, BURN_VERSION, findBurnedData, parseBurned } from './burned-data.js';

export const BLOCK_NOTE = 'highlights and notes from the Annotator extension; rewritten each time they are saved into this file';
const BLOCK_BEGIN = `<!-- annotator:begin (${BLOCK_NOTE}) -->`;
const BLOCK_END = '<!-- annotator:end -->';
const BLOCK_PATTERN = /<!-- annotator:begin\b[\s\S]*?<!-- annotator:end -->(?:\r\n|\n)?/g;

// The same text the extension reads in the browser (see content/anchoring.js)
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME', 'SVG']);
const NO_WRAP_PARENTS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'UL', 'OL', 'DL', 'SELECT', 'COLGROUP']);
const PARSE_OPTIONS = { sourceCodeLocationInfo: true, scriptingEnabled: true };

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;
const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const eolOf = (source) => (source.includes('\r\n') ? '\r\n' : '\n');

function* elements(node) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text' || child.nodeName === '#comment') continue;
    yield child;
    yield* elements(child);
  }
}

// ---- Taking an earlier burn out ---------------------------------------------------------------

function applyEdits(source, edits) {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.order - b.order);
  let out = '';
  let at = 0;
  for (const edit of ordered) {
    out += source.slice(at, edit.start) + edit.text;
    at = edit.end ?? edit.start;
  }
  return out + source.slice(at);
}

// Browsers drop a byte-order mark before parsing; the parser here would take it for text
const BOM = '\uFEFF';
const withoutBom = (source, fn) => (source.startsWith(BOM) ? BOM + fn(source.slice(1)) : fn(source));

/** The file as it was before anything was burned in: block and marks gone, nothing else touched. */
export function stripBurned(source) {
  return withoutBom(source, strip);
}

function strip(source) {
  const withoutBlock = source.replace(BLOCK_PATTERN, '');
  if (!/data-annotator-id/.test(withoutBlock)) return withoutBlock;
  const edits = [];
  for (const el of elements(parse(withoutBlock, PARSE_OPTIONS))) {
    if (el.nodeName !== 'mark' || attr(el, 'data-annotator-id') == null) continue;
    const { startTag, endTag } = el.sourceCodeLocation ?? {};
    if (startTag) edits.push({ start: startTag.startOffset, end: startTag.endOffset, text: '', order: 0 });
    if (endTag) edits.push({ start: endTag.startOffset, end: endTag.endOffset, text: '', order: 0 });
  }
  return applyEdits(withoutBlock, edits);
}

// ---- Where the text is in the source ----------------------------------------------------------

function collectText(node, out = []) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text') out.push(child);
    else if (child.childNodes && !SKIP_TAGS.has(child.nodeName.toUpperCase())) collectText(child, out);
  }
  return out;
}

const REFERENCE = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/y;

const NEWLINE_FIRST = new Set(['PRE', 'LISTING', 'TEXTAREA']);

// Where a text node begins, as far as its neighbors say: after the sibling before it, or the start tag
function startAfterNeighbor(node) {
  const { parentNode } = node;
  const siblings = parentNode?.childNodes ?? [];
  const previous = siblings[siblings.indexOf(node) - 1];
  return previous ? previous.sourceCodeLocation?.endOffset : parentNode?.sourceCodeLocation?.startTag?.endOffset;
}

/**
 * For each position in a text node's decoded text, where it starts in the source (-1 inside a
 * character reference such as &amp;, where nothing can be inserted). Null when the node can't be
 * mapped reliably, and then nothing is inserted in it.
 *
 * The parser's own start offset is not always right (after the newline that <pre> drops, it can
 * land inside a character reference), so a few starting points are tried, and one is accepted
 * only when decoding the source from there gives exactly the node's text.
 */
function sourceOffsets(source, node) {
  const loc = node.sourceCodeLocation;
  if (!loc) return null;
  const starts = [loc.startOffset];
  const neighbor = startAfterNeighbor(node);
  if (Number.isFinite(neighbor)) starts.push(neighbor);
  // The newline right after <pre> is dropped from the text
  if (NEWLINE_FIRST.has(node.parentNode?.nodeName.toUpperCase())) {
    for (const start of [...starts]) {
      const newline = /^(?:\r\n|\n|\r)/.exec(source.slice(start, start + 2));
      if (newline) starts.push(start + newline[0].length);
    }
  }
  for (const start of new Set(starts)) {
    const at = mapText(source, node.value, start, loc.endOffset);
    if (at) return at;
  }
  return null;
}

function mapText(source, value, start, end) {
  const { length } = value;
  const at = new Array(length + 1).fill(-1);
  let i = start;
  let k = 0;
  while (i < end && k < length) {
    at[k] = i;
    const ch = source[i];
    let consumed = 1;
    let decoded = ch;
    if (ch === '\r') {
      consumed = source[i + 1] === '\n' ? 2 : 1;
      decoded = '\n';
    } else if (ch === '&') {
      REFERENCE.lastIndex = i;
      const match = REFERENCE.exec(source);
      if (match && i + match[0].length <= end) {
        const text = decodeHTML(match[0]);
        if (text !== match[0]) {
          consumed = match[0].length;
          decoded = text;
        }
      }
    }
    if (value.substr(k, decoded.length) !== decoded) return null;
    i += consumed;
    k += decoded.length;
  }
  if (i !== end || k !== length) return null;
  at[length] = i;
  return at;
}

// ---- Putting the marks in ---------------------------------------------------------------------

function markTag(annotation) {
  const color = isValidCategoryId(annotation.color) ? annotation.color : 'yellow';
  return `<mark data-annotator-id="${escapeAttr(annotation.id)}" data-annotator-color="${color}">`;
}

function plan(source, annotations) {
  const document = parse(source, PARSE_OPTIONS);
  const body = Array.from(elements(document)).find((el) => el.nodeName === 'body');
  const nodes = body ? collectText(body) : [];
  let raw = '';
  const entries = nodes.map((node) => {
    const entry = { node, start: raw.length, at: undefined };
    raw += node.value;
    return entry;
  });
  const { text, map } = normalizeWithMap(raw);

  const found = new Map();
  const missing = [];
  for (const annotation of annotations) {
    const hit = findQuote(text, annotation.quote ?? {}, annotation.position);
    if (hit && hit.end > hit.start) found.set(annotation, { start: map[hit.start], end: map[hit.end - 1] + 1 });
    else missing.push(annotation);
  }

  // A passage is marked whole or not at all: every piece of it must be somewhere a tag can go
  const offsets = new Map();
  const offsetsOf = (entry) => {
    if (!offsets.has(entry)) offsets.set(entry, sourceOffsets(source, entry.node));
    return offsets.get(entry);
  };
  const pieces = (range) => {
    const out = [];
    for (const entry of entries) {
      const end = entry.start + entry.node.value.length;
      if (end <= range.start) continue;
      if (entry.start >= range.end) break;
      const from = Math.max(0, range.start - entry.start);
      const to = Math.min(entry.node.value.length, range.end - entry.start);
      if (!entry.node.value.slice(from, to).trim()) continue;
      if (NO_WRAP_PARENTS.has(entry.node.parentNode?.nodeName.toUpperCase())) continue;
      out.push({ entry, from, to });
    }
    return out;
  };

  // Per text node, the passages that fall inside it, in decoded offsets
  const byNode = new Map();
  for (const [annotation, range] of found) {
    const parts = pieces(range);
    const fits = parts.length > 0 && parts.every(({ entry, from, to }) => offsetsOf(entry)?.[from] >= 0 && offsetsOf(entry)[to] >= 0);
    if (!fits) {
      found.delete(annotation);
      missing.push(annotation);
      continue;
    }
    for (const { entry, from, to } of parts) {
      if (!byNode.has(entry)) byNode.set(entry, []);
      byNode.get(entry).push({ annotation, from, to });
    }
  }

  const edits = [];
  const placed = new Set();
  for (const [entry, spans] of byNode) {
    const { node } = entry;
    const at = offsetsOf(entry);

    // Cut the node where any passage starts or ends, so overlapping highlights nest properly
    const cuts = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
    let group = null;
    const close = () => {
      if (!group) return;
      const { start, end, covering } = group;
      edits.push({ start: at[start], text: covering.map(markTag).join(''), order: 1 });
      edits.push({ start: at[end], text: '</mark>'.repeat(covering.length), order: 0 });
      for (const annotation of covering) placed.add(annotation);
      group = null;
    };
    for (let c = 0; c < cuts.length - 1; c++) {
      const [from, to] = [cuts[c], cuts[c + 1]];
      const covering = spans.filter((s) => s.from <= from && s.to >= to).map((s) => s.annotation);
      const usable = covering.length > 0 && node.value.slice(from, to).trim() && at[from] >= 0 && at[to] >= 0;
      if (!usable) {
        close();
        continue;
      }
      const same = group && group.end === from && group.covering.length === covering.length && group.covering.every((a, i) => a === covering[i]);
      if (same) group.end = to;
      else {
        close();
        group = { start: from, end: to, covering };
      }
    }
    close();
  }
  return { edits, found, placed, body };
}

// ---- The block --------------------------------------------------------------------------------

function highlightRules(categories, style) {
  const rules = ['mark[data-annotator-id] { color: inherit; border-radius: 2px; background-color: rgba(156, 163, 175, 0.35); }'];
  for (const c of categories) {
    rules.push(
      style === 'underline'
        ? `mark[data-annotator-color="${c.id}"] { background-color: transparent; text-decoration: underline 2px ${c.swatch}; text-underline-offset: 3px; text-decoration-skip-ink: none; }`
        : `mark[data-annotator-color="${c.id}"] { background-color: ${c.fill}; }`,
    );
  }
  return rules;
}

// A fixed order of keys, so what the file holds reads the same whichever storage it came from
function canonical({ id, color, note, quote, position, createdAt, updatedAt }) {
  return { id, color, note, quote: { exact: quote.exact, prefix: quote.prefix, suffix: quote.suffix }, ...(position ? { position } : {}), createdAt, updatedAt };
}

function buildBlock({ page, annotations, categories, style, eol }) {
  const used = new Set(annotations.map((a) => (isValidCategoryId(a.color) ? a.color : 'yellow')));
  const known = categories.filter((c) => used.has(c.id));
  const data = {
    format: BURN_FORMAT,
    version: BURN_VERSION,
    page: {
      // When the notes last changed: what tells another browser that this file has news
      updatedAt: Number.isFinite(page.updatedAt) ? page.updatedAt : 0,
      ...(page.note?.trim() ? { note: page.note, noteUpdatedAt: page.noteUpdatedAt } : {}),
      annotations: annotations.map(canonical),
    },
    categories: known.map(({ id, name, swatch }) => ({ id, name, swatch })),
  };
  // "<" is escaped so no note can end the script (or open a comment) early
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/\n/g, eol);
  return [
    BLOCK_BEGIN,
    `<style data-annotator>${eol}${highlightRules(known, style).join(eol)}${eol}</style>`,
    `<script type="application/json" data-annotator>${eol}${json}${eol}</script>`,
    BLOCK_END,
  ].join(eol);
}

/**
 * Writes `page`'s notes into `source`.
 *   page        { note?, annotations: [{ id, color, note, quote, position?, createdAt, updatedAt }] }
 *   categories  the resolved categories (see resolveCategories), for the names and colors
 *   style       'background' or 'underline', as in the extension's settings
 * Returns { html, changed, total, marked, unplaced }: `marked` highlights got <mark> tags,
 * `unplaced` could not be found in the file's text (their notes are still saved in the block).
 */
export function burnIntoHtml(source, page, options = {}) {
  let result;
  const html = withoutBom(source, (rest) => {
    result = burnBody(rest, page, options);
    return result.html;
  });
  // Safety net for files we rewrite: taking the burn out again must give back exactly what was there
  if (html !== source && !result.cleaned && stripBurned(html) !== stripBurned(source)) return { html: source, changed: false, total: 0, marked: 0, unplaced: 0, skipped: 'unsafe' };
  return { ...result, html, changed: html !== source };
}

function burnBody(source, page, { categories = [], style = 'background' }) {
  const clean = strip(source);
  const annotations = (page.annotations ?? []).filter((a) => a?.id && a.quote?.exact?.trim());
  const hasNote = !!page.note?.trim();
  if (annotations.length === 0 && !hasNote) return { html: clean, total: 0, marked: 0, unplaced: 0, cleaned: true };

  const { edits, found, placed, body } = plan(clean, annotations);
  const eol = eolOf(clean);
  const ordered = [...annotations].sort((a, b) => {
    const [ra, rb] = [found.get(a)?.start ?? Infinity, found.get(b)?.start ?? Infinity];
    return ra - rb || (a.createdAt ?? 0) - (b.createdAt ?? 0) || String(a.id).localeCompare(String(b.id));
  });
  const block = buildBlock({ page, annotations: ordered, categories, style, eol });

  // Before </body> when there is one, else at the very end
  const endTag = body?.sourceCodeLocation?.endTag;
  edits.push({ start: endTag ? endTag.startOffset : clean.length, text: block + eol, order: 2 });

  const html = applyEdits(clean, edits);
  return { html, total: annotations.length, marked: placed.size, unplaced: annotations.length - placed.size };
}

// ---- Files: bytes in, bytes out ---------------------------------------------------------------

/**
 * burnIntoHtml for a file's bytes. Only UTF-8 files are touched: rewriting any other encoding
 * would garble it, so those come back as { skipped: 'encoding' }.
 */
export function burnBytes(bytes, page, options) {
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { skipped: 'encoding' };
  }
  const declared = /<meta\b[^>]*\bcharset\s*=\s*["']?\s*([\w:.-]+)/i.exec(source.slice(0, 4096))?.[1];
  if (declared && !/^utf-?8$/i.test(declared)) return { skipped: 'encoding' };

  const result = burnIntoHtml(source, page, options);
  return { ...result, bytes: result.changed ? new TextEncoder().encode(result.html) : bytes };
}
