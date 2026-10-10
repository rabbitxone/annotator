import { COLOR_IDS } from './constants.js';
import { normalizeUrl } from './url.js';

export const BACKUP_FORMAT = 'annotator-backup';
export const BACKUP_VERSION = 1;

const str = (value) => (typeof value === 'string' ? value : '');
const num = (value, fallback) => (Number.isFinite(value) ? value : fallback);

function cleanAnnotation(raw, now) {
  if (!raw || typeof raw !== 'object' || !raw.id || !str(raw.quote?.exact).trim()) return null;
  const createdAt = num(raw.createdAt, now);
  const annotation = {
    id: String(raw.id),
    color: COLOR_IDS.includes(raw.color) ? raw.color : COLOR_IDS[0],
    note: str(raw.note),
    quote: { exact: str(raw.quote.exact), prefix: str(raw.quote.prefix), suffix: str(raw.quote.suffix) },
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
  };
  if (Number.isFinite(raw.position?.start) && Number.isFinite(raw.position?.end)) {
    annotation.position = { start: raw.position.start, end: raw.position.end };
  }
  return annotation;
}

function cleanPage(raw, now) {
  const url = raw && typeof raw === 'object' ? normalizeUrl(str(raw.url)) : null;
  if (!url) return null;
  const page = {
    url,
    title: str(raw.title),
    updatedAt: num(raw.updatedAt, now),
    annotations: (Array.isArray(raw.annotations) ? raw.annotations : []).map((a) => cleanAnnotation(a, now)).filter(Boolean),
  };
  if (str(raw.note).trim()) {
    page.note = raw.note;
    page.noteUpdatedAt = num(raw.noteUpdatedAt, page.updatedAt);
  }
  return page.annotations.length > 0 || page.note ? page : null;
}

function stripLocal(page) {
  const { annotations, ...rest } = page;
  return { ...rest, annotations: annotations.map(({ lostAt, ...annotation }) => annotation) };
}

export function createBackup(pages, now = Date.now()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    pages: pages.map(stripLocal),
  };
}

export class BackupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function parseBackup(text, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('invalid-json');
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.pages)) throw new BackupError('invalid-format');

  const byUrl = new Map();
  for (const raw of data.pages) {
    const page = cleanPage(raw, now);
    if (!page) continue;
    const known = byUrl.get(page.url);
    byUrl.set(page.url, known ? mergePage(known, page).page : page);
  }
  return [...byUrl.values()];
}

export function mergePage(existing, incoming) {
  const page = structuredClone(existing ?? { url: incoming.url, title: '', updatedAt: 0, annotations: [] });
  let added = 0;
  let updated = 0;

  for (const annotation of incoming.annotations) {
    const index = page.annotations.findIndex((a) => a.id === annotation.id);
    if (index === -1) {
      page.annotations.push(structuredClone(annotation));
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

const escapeLinkText = (text) => text.replace(/[[\]\\]/g, '\\$&');
const blockquote = (text) =>
  String(text)
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');

function pageHeading(page, level) {
  return `${'#'.repeat(level)} [${escapeLinkText(page.title || page.url)}](${page.url})`;
}

function annotationBlock(annotation) {
  const parts = [blockquote(annotation.quote?.exact ?? '')];
  if (annotation.note?.trim()) parts.push(annotation.note.trim());
  return parts.join('\n\n');
}

export function byTextPosition(a, b) {
  const pa = a.position?.start ?? Infinity;
  const pb = b.position?.start ?? Infinity;
  return pa === pb ? a.createdAt - b.createdAt : pa - pb;
}

/**
 * groups: [{ page, annotations, includePageNote }]
 * labels: { title, pageNote }
 */
export function toMarkdown(groups, labels = {}) {
  const out = [];
  if (labels.title) out.push(`# ${labels.title}`);
  const level = labels.title ? 2 : 1;
  for (const { page, annotations, includePageNote = true } of groups) {
    const sections = [pageHeading(page, level)];
    if (includePageNote && page.note?.trim()) sections.push(`**${labels.pageNote ?? 'Page note'}:** ${page.note.trim()}`);
    for (const annotation of [...annotations].sort(byTextPosition)) sections.push(annotationBlock(annotation));
    out.push(sections.join('\n\n'));
  }
  return out.join('\n\n') + '\n';
}

export function quoteSnippet(annotation, page) {
  const link = `[${escapeLinkText(page.title || page.url)}](${textFragmentUrl(page.url, annotation.quote?.exact)})`;
  return `${annotationBlock(annotation)}\n\n— ${link}\n`;
}

export function groupItems(items) {
  const groups = new Map();
  for (const { annotation, page } of items) {
    if (!groups.has(page.url)) groups.set(page.url, { page, annotations: [], includePageNote: false });
    groups.get(page.url).annotations.push(annotation);
  }
  return [...groups.values()];
}
