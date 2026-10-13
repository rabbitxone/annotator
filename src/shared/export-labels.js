import { colorById } from './constants.js';
import { t } from './i18n.js';

// Localized wording for exports; the formatting itself lives in exchange.js and stays pure.
export function exportLabels() {
  return {
    title: t('exportTitle'),
    pageNote: t('pageNoteLabel'),
    pageNotes: t('exportPageNotes'),
    wholePage: t('csvWholePage'),
    colorName: (id) => colorById(id).name,
    summary: (notes, pages, date) => t('exportSummary', [String(notes), String(pages), date]),
    pageSummary: (host, count) => t('exportPageSummary', [host, String(count)]),
    csvHeaders: [
      'csvPageTitle',
      'csvPageUrl',
      'csvSource',
      'csvColor',
      'csvColorCode',
      'csvQuote',
      'csvNote',
      'csvCreated',
      'csvModified',
    ].map((key) => t(key)),
  };
}
