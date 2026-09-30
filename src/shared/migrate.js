import { COLOR_IDS } from './constants.js';
import { normalizeUrl } from './url.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

export function htmlToText(html) {
  if (!html) return '';
  const BLOCK = '(?:div|p|li|h[1-6])';
  return String(html)
    .replace(new RegExp(`</${BLOCK}>\\s*<${BLOCK}[^>]*>`, 'gi'), '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(new RegExp(`</?${BLOCK}[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function legacyColor(value) {
  const id = String(value || '').replace('__annotator-highlight-', '');
  return COLOR_IDS.includes(id) ? id : 'yellow';
}

export function migrateLegacy(legacy, existing = {}) {
  const pages = structuredClone(existing);

  for (const [rawUrl, list] of Object.entries(legacy || {})) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const url = normalizeUrl(rawUrl);
    if (!url) continue;

    const page = (pages[url] ??= { url, title: '', updatedAt: 0, annotations: [] });

    for (const old of list) {
      if (!old || !old.id || !old.text) continue;
      if (page.annotations.some((a) => a.id === old.id)) continue;

      const createdAt = Number(old.timestamp) || Date.now();
      const updatedAt = Number(old.lastEdited) || createdAt;
      const note = old.note === old.text ? '' : htmlToText(old.note);

      page.annotations.push({
        id: String(old.id),
        color: legacyColor(old.color),
        note,
        quote: {
          exact: String(old.text),
          prefix: String(old.contextBefore || ''),
          suffix: String(old.contextAfter || ''),
        },
        createdAt,
        updatedAt,
      });
      if (!page.title && old.pageTitle) page.title = String(old.pageTitle);
      page.updatedAt = Math.max(page.updatedAt, updatedAt);
    }

    if (page.annotations.length === 0) delete pages[url];
  }

  return pages;
}
