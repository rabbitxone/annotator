import { sanitizeStoredCategories } from './categories.js';
import { cleanPage } from './exchange.js';

// What is burned into a file besides the marks (see burn.js). Kept apart from the HTML parser so
// that the extension's content script, which runs on every page, only needs this much.

export const BURN_FORMAT = 'annotator-file';
export const BURN_VERSION = 1;

const DATA_PATTERN = /<script\b[^>]*\bdata-annotator\b[^>]*>([\s\S]*?)<\/script>/i;

/** The JSON text of the notes inside a file's source, or null when none were burned in. */
export function findBurnedData(source) {
  return DATA_PATTERN.exec(source)?.[1] ?? null;
}

/**
 * Validates what was burned into a file and gives it the address it is opened under.
 * Returns { page, categories } or null. `text` is the JSON from findBurnedData, or the
 * textContent of the file's <script data-annotator>.
 */
export function parseBurned(text, url, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data?.format !== BURN_FORMAT || !data.page || typeof data.page !== 'object') return null;
  // Without a date the notes count as old news, never as fresh
  const updatedAt = Number.isFinite(data.page.updatedAt) ? data.page.updatedAt : 0;
  const page = cleanPage({ ...data.page, url, updatedAt }, now);
  return page ? { page, categories: sanitizeStoredCategories(data.categories) } : null;
}
