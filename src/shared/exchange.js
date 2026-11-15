import { isValidCategoryId, sanitizeStoredCategories } from './categories.js';
import { colorById, getCategories } from './constants.js';
import { isRemoteFileUrl, normalizeUrl, pageName, siteLabel, sourceOf } from './url.js';

export const BACKUP_FORMAT = 'annotator-backup';
export const BACKUP_VERSION = 1;

export const IMPORT_LIMITS = {
  bytes: 50 * 1024 * 1024,
  pages: 20000,
  annotationsPerPage: 5000,
  annotations: 200000,
  id: 200,
  title: 1000,
  quote: 20000,
  context: 1000,
  note: 100000,
};

// Counts values cut to fit IMPORT_LIMITS so an import can tell the person that data was skipped.
let clipped = 0;
const str = (value, max = Infinity) => {
  if (typeof value !== 'string') return '';
  if (value.length <= max) return value;
  clipped++;
  return value.slice(0, max);
};
const MAX_TIME = 8.64e15;
const FUTURE_SLACK = 24 * 60 * 60 * 1000;
// Timestamps from a file may not lie in the future, or a record would win every later merge.
const num = (value, fallback, now = Infinity) =>
  Number.isFinite(value) && value >= 0 && Math.abs(value) <= MAX_TIME ? Math.min(value, now + FUTURE_SLACK) : fallback;
const position = (value) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

function cleanAnnotation(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id : typeof raw.id === 'number' ? String(raw.id) : '';
  if (!id || id.length > IMPORT_LIMITS.id || !str(raw.quote?.exact).trim()) return null;
  const createdAt = num(raw.createdAt, now, now);
  const annotation = {
    id,
    color: isValidCategoryId(raw.color) ? raw.color : 'yellow',
    note: str(raw.note, IMPORT_LIMITS.note),
    quote: {
      exact: str(raw.quote.exact, IMPORT_LIMITS.quote),
      prefix: str(raw.quote.prefix, IMPORT_LIMITS.context),
      suffix: str(raw.quote.suffix, IMPORT_LIMITS.context),
    },
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt, now),
  };
  if (position(raw.position?.start) && position(raw.position?.end) && raw.position.start <= raw.position.end) {
    annotation.position = { start: raw.position.start, end: raw.position.end };
  }
  return annotation;
}

function cleanPage(raw, now) {
  if (Array.isArray(raw?.annotations) && raw.annotations.length > IMPORT_LIMITS.annotationsPerPage) clipped++;
  const url = raw && typeof raw === 'object' ? normalizeUrl(str(raw.url, 8192)) : null;
  if (!url || isRemoteFileUrl(url)) return null;
  const page = {
    url,
    title: str(raw.title, IMPORT_LIMITS.title),
    updatedAt: num(raw.updatedAt, now, now),
    annotations: (Array.isArray(raw.annotations) ? raw.annotations : [])
      .slice(0, IMPORT_LIMITS.annotationsPerPage)
      .map((a) => cleanAnnotation(a, now))
      .filter(Boolean),
  };
  const note = str(raw.note, IMPORT_LIMITS.note);
  if (note.trim()) {
    page.note = note;
    page.noteUpdatedAt = num(raw.noteUpdatedAt, page.updatedAt, now);
  }
  return page.annotations.length > 0 || page.note ? page : null;
}

function stripLocal(page) {
  const { annotations, favicon, ...rest } = page;
  return { ...rest, annotations: annotations.map(({ lostAt, ...annotation }) => annotation) };
}

const SITE_RULES = new Set(['never', 'always']);
export function sanitizeBackupSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of ['selectionToolbar', 'quickKeys', 'pageIcons']) if (typeof raw[key] === 'boolean') out[key] = raw[key];
  if (raw.highlightStyle === 'background' || raw.highlightStyle === 'underline') out.highlightStyle = raw.highlightStyle;
  if (isValidCategoryId(raw.defaultColor)) out.defaultColor = raw.defaultColor;
  if (raw.siteRules && typeof raw.siteRules === 'object' && !Array.isArray(raw.siteRules)) {
    out.siteRules = Object.fromEntries(
      Object.entries(raw.siteRules)
        .filter(([site, rule]) => typeof site === 'string' && site.length <= 2048 && SITE_RULES.has(rule))
        .slice(0, 5000),
    );
  }
  return Object.keys(out).length ? out : null;
}

export function createBackup(pages, { now = Date.now(), categories = null, settings = null } = {}) {
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    pages: pages.map(stripLocal),
  };
  if (Array.isArray(categories) && categories.length) backup.categories = categories;
  const kept = sanitizeBackupSettings(settings);
  if (kept) backup.settings = kept;
  return backup;
}

export class BackupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function parseBackup(text, now = Date.now()) {
  if (typeof text !== 'string' || text.length > IMPORT_LIMITS.bytes) throw new BackupError('too-large');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('invalid-json');
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.pages)) throw new BackupError('invalid-format');

  clipped = 0;
  const byUrl = new Map();
  let total = 0;
  let truncated = data.pages.length > IMPORT_LIMITS.pages;
  for (const raw of data.pages.slice(0, IMPORT_LIMITS.pages)) {
    const page = cleanPage(raw, now);
    if (!page) continue;
    total += page.annotations.length;
    if (total > IMPORT_LIMITS.annotations) {
      truncated = true;
      break;
    }
    const known = byUrl.get(page.url);
    byUrl.set(page.url, known ? mergePage(known, page).page : page);
  }
  return { pages: [...byUrl.values()], categories: sanitizeStoredCategories(data.categories), settings: sanitizeBackupSettings(data.settings), truncated: truncated || clipped > 0 };
}

export function mergePage(existing, incoming) {
  const page = structuredClone(existing ?? { url: incoming.url, title: '', updatedAt: 0, annotations: [] });
  let added = 0;
  let updated = 0;

  const positions = new Map(page.annotations.map((a, i) => [a.id, i]));
  for (const annotation of incoming.annotations) {
    const index = positions.get(annotation.id) ?? -1;
    if (index === -1) {
      positions.set(annotation.id, page.annotations.push(structuredClone(annotation)) - 1);
      added++;
    } else if (annotation.updatedAt > page.annotations[index].updatedAt) {
      page.annotations[index] = structuredClone(annotation);
      updated++;
    }
  }

  if (incoming.note && incoming.note !== page.note && (!page.note || (incoming.noteUpdatedAt ?? 0) > (page.noteUpdatedAt ?? 0))) {
    if (page.note) updated++;
    else added++;
    page.note = incoming.note;
    page.noteUpdatedAt = incoming.noteUpdatedAt;
  }
  const titled = !page.title && !!incoming.title;
  if (titled) page.title = incoming.title;
  page.updatedAt = Math.max(page.updatedAt || 0, incoming.updatedAt || 0);
  return { page, added, updated, changed: added > 0 || updated > 0 || titled };
}

const encodeFragment = (text) => encodeURIComponent(text).replace(/-/g, '%2D');

export function textFragmentUrl(url, exact) {
  const text = String(exact ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return url;
  const words = text.split(' ');
  const directive =
    text.length > 80 && words.length >= 8
      ? `${encodeFragment(words.slice(0, 4).join(' '))},${encodeFragment(words.slice(-4).join(' '))}`
      : encodeFragment(text);
  return `${url.includes('#') ? url : url + '#'}:~:text=${directive}`;
}

const pad = (n) => String(n).padStart(2, '0');

export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateTime(ms) {
  const d = new Date(ms);
  return `${localDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function byTextPosition(a, b) {
  const pa = a.position?.start ?? Infinity;
  const pb = b.position?.start ?? Infinity;
  return pa === pb ? a.createdAt - b.createdAt : pa - pb;
}

export function groupItems(items) {
  const groups = new Map();
  for (const { annotation, page } of items) {
    if (!groups.has(page.url)) groups.set(page.url, { page, annotations: [], includePageNote: false });
    groups.get(page.url).annotations.push(annotation);
  }
  return [...groups.values()];
}

export function pagesFromGroups(groups) {
  return groups.map(({ page, annotations, includePageNote = true }) => {
    const { note, noteUpdatedAt, ...rest } = page;
    return { ...rest, ...(includePageNote && note?.trim() ? { note, noteUpdatedAt } : {}), annotations };
  });
}

export function escapeMarkdown(text) {
  return String(text)
    .replace(/[\\`*_[\]<>]/g, '\\$&')
    .replace(/^(\s*)(#{1,6})(?=\s|$)/gm, '$1\\$2')
    .replace(/^(\s*)([-+])(?=\s)/gm, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])(?=\s)/gm, '$1$2\\$3')
    .replace(/^(\s*)(-{3,}|={3,})\s*$/gm, '$1\\$2');
}

function categoriesUsed(groups) {
  const known = getCategories();
  const ids = new Set(known.map((c) => c.id));
  const extra = new Set();
  for (const { annotations } of groups) for (const a of annotations) if (!ids.has(a.color)) extra.add(a.color);
  return [...known, ...[...extra].map(colorById)];
}

const linkTarget = (url) => url.replace(/\(/g, '%28').replace(/\)/g, '%29');
const mdLink = (text, url) => `[${escapeMarkdown(text)}](${linkTarget(url)})`;
const blockquote = (text) =>
  escapeMarkdown(text)
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
// Notes are Markdown on purpose, but exported text may end up in tools that render raw HTML or javascript: links.
const SAFE_LINK = /^(https?:|mailto:|#|\/|\.\.?\/)/i;
export const safeNote = (text) =>
  String(text)
    .replace(/<(?=[A-Za-z!\/?])/g, '\\<')
    .replace(/\]\(\s*([^)\s]*)/g, (m, href) => (SAFE_LINK.test(href) ? m : '\\](' + href))
    .replace(/^([ \t]{0,3})\[([^\]\n]+)\]:[ \t]*<?([^\s>]*)/gm, (m, space, label, href) =>
      SAFE_LINK.test(href) ? m : `${space}\\[${label}]${m.slice(space.length + label.length + 2)}`,
    );
const indent = (text, by = '  ') => text.replace(/^(?=.)/gm, by);

export const DEFAULT_LABELS = {
  title: '',
  pageNote: 'Page note',
  pageNotes: 'Page notes',
  colorName: (id) => colorById(id).name,
  summary: (notes, pages, date) => `Highlights: ${notes} · pages: ${pages} · exported ${date}`,
  pageSummary: (host, count) => `${host} · highlights: ${count}`,
  wholePage: '(whole page)',
  csvHeaders: ['Page title', 'Page URL', 'File or site', 'Category', 'Color code', 'Highlighted text', 'Note', 'Created', 'Modified'],
};

function highlightItem(heading, annotation) {
  const parts = [`${heading}\n${blockquote(annotation.quote?.exact ?? '')}`];
  if (annotation.note?.trim()) parts.push(safeNote(annotation.note.trim()));
  return `- ${indent(parts.join('\n\n')).slice(2)}`;
}

const colorHeading = (annotation, L) => {
  const color = colorById(annotation.color);
  return `${color.emoji} **${escapeMarkdown(L.colorName(color.id))}** · ${localDate(annotation.createdAt)}`;
};

function pageNoteBlock(note, label) {
  return `**📝 ${escapeMarkdown(label)}**\n\n${safeNote(note.trim())}`;
}

export function toMarkdown(groups, labels = {}, { groupBy = 'page', now = Date.now() } = {}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const out = [];
  const withTitle = !!L.title;

  if (withTitle) {
    const count = Object.create(null);
    let notes = 0;
    for (const { annotations } of groups) {
      for (const a of annotations) {
        count[a.color] = (count[a.color] ?? 0) + 1;
        notes++;
      }
    }
    out.push(`# ${escapeMarkdown(L.title)}`, L.summary(notes, groups.length, localDate(now)));
    const legend = categoriesUsed(groups).filter((c) => count[c.id] > 0).map((c) => `${c.emoji} ${escapeMarkdown(L.colorName(c.id))} ${count[c.id]}`);
    if (legend.length) out.push(legend.join(' · '));
  }

  const level = '#'.repeat(withTitle ? 2 : 1);
  if (groupBy === 'color') {
    for (const color of categoriesUsed(groups)) {
      const items = [];
      for (const { page, annotations } of groups) {
        for (const annotation of [...annotations].sort(byTextPosition)) {
          if (annotation.color === color.id) items.push({ page, annotation });
        }
      }
      if (!items.length) continue;
      out.push(
        `${level} ${color.emoji} ${escapeMarkdown(L.colorName(color.id))} · ${items.length}`,
        items
          .map(({ page, annotation }) =>
            highlightItem(`**${mdLink(pageName(page), page.url)}** · ${localDate(annotation.createdAt)}`, annotation),
          )
          .join('\n\n'),
      );
    }
    const noted = groups.filter((g) => g.includePageNote !== false && g.page.note?.trim());
    if (noted.length) {
      out.push(
        `${level} 📝 ${escapeMarkdown(L.pageNotes)}`,
        noted.map(({ page }) => `- **${mdLink(pageName(page), page.url)}**\n\n${indent(safeNote(page.note.trim()))}`).join('\n\n'),
      );
    }
  } else {
    for (const { page, annotations, includePageNote = true } of groups) {
      const sections = [
        `${level} ${mdLink(pageName(page), page.url)}`,
        escapeMarkdown(L.pageSummary(siteLabel(page.url), annotations.length)),
      ];
      if (includePageNote && page.note?.trim()) sections.push(pageNoteBlock(page.note, L.pageNote));
      if (annotations.length) {
        sections.push([...annotations].sort(byTextPosition).map((a) => highlightItem(colorHeading(a, L), a)).join('\n\n'));
      }
      out.push(sections.join('\n\n'));
    }
  }
  return out.join('\n\n') + '\n';
}

export function quoteSnippet(annotation, page) {
  const parts = [blockquote(annotation.quote?.exact ?? '')];
  if (annotation.note?.trim()) parts.push(safeNote(annotation.note.trim()));
  return `${parts.join('\n\n')}\n\n— ${mdLink(pageName(page), textFragmentUrl(page.url, annotation.quote?.exact))}\n`;
}

export const CSV_SEPARATORS = { comma: ',', semicolon: ';' };

// Spreadsheets also trim leading spaces and read full-width signs, so those count too.
const FORMULA_START = /^[\s\u00a0\u200b\ufeff]*[=+\-@\uff1d\uff0b\uff0d\uff20\t\r]/;
const PLAIN_NUMBER = /^\s*[+-]?\d+([.,]\d+)?\s*$/;

const startsFormula = (text) => {
  const value = String(text ?? '');
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value);
};

export function csvCell(value, separator = ',') {
  let text = String(value ?? '');
  if (startsFormula(text)) text = `'${text}`;
  return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function hasFormulaText(groups, labels = {}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  return groups.some(
    ({ page, annotations, includePageNote = true }) =>
      startsFormula(pageName(page)) ||
      (includePageNote && startsFormula(page.note?.trim())) ||
      annotations.some((a) => startsFormula(a.quote?.exact) || startsFormula(a.note) || startsFormula(L.colorName(colorById(a.color).id))),
  );
}

export function toCsv(groups, { separator = ',', labels = {} } = {}) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const rows = [L.csvHeaders];
  for (const { page, annotations, includePageNote = true } of groups) {
    const pageNote = includePageNote ? (page.note ?? '').trim() : '';
    const title = pageName(page);
    const source = sourceOf(page.url);
    if (pageNote) {
      const when = page.noteUpdatedAt ? localDateTime(page.noteUpdatedAt) : '';
      rows.push([title, page.url, source, '', '', L.wholePage, pageNote, when, when]);
    }
    for (const a of [...annotations].sort(byTextPosition)) {
      const color = colorById(a.color);
      rows.push([
        title,
        page.url,
        source,
        L.colorName(color.id),
        color.swatch,
        a.quote?.exact ?? '',
        a.note ?? '',
        localDateTime(a.createdAt),
        localDateTime(a.updatedAt ?? a.createdAt),
      ]);
    }
  }
  return rows.map((row) => row.map((cell) => csvCell(cell, separator)).join(separator)).join('\r\n') + '\r\n';
}

export const EXPORT_FORMATS = {
  json: { extension: 'json', mime: 'application/json', importable: true },
  markdown: { extension: 'md', mime: 'text/markdown', importable: false },
  csv: { extension: 'csv', mime: 'text/csv', importable: false },
};

export function buildExport(format, groups, { labels, categories = null, settings = null, separator = ',', groupBy = 'page', now = Date.now() } = {}) {
  const meta = EXPORT_FORMATS[format];
  if (!meta) throw new Error(`Unknown export format: ${format}`);
  let text;
  if (format === 'json') text = JSON.stringify(createBackup(pagesFromGroups(groups), { now, categories, settings }), null, 2);
  else if (format === 'markdown') text = toMarkdown(groups, labels, { groupBy, now });
  else text = '﻿' + toCsv(groups, { separator, labels }); // Excel misreads UTF-8 without a BOM
  return { ...meta, text };
}
