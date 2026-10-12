import { t } from './i18n.js';

// Localized wording for exports; the formatting itself lives in exchange.js and stays pure.
export function exportLabels() {
  return {
    title: t('exportTitle'),
    pageNote: t('pageNoteLabel'),
    pageNotes: t('exportPageNotes'),
    colorName: (id) => t(`color_${id}`),
    summary: (notes, pages, date) => t('exportSummary', [String(notes), String(pages), date]),
    pageSummary: (host, count) => t('exportPageSummary', [host, String(count)]),
    csvHeaders: [
      'csvPageTitle',
      'csvPageUrl',
      'csvColor',
      'csvColorCode',
      'csvQuote',
      'csvNote',
      'csvPageNote',
      'csvCreated',
      'csvModified',
    ].map((key) => t(key)),
  };
}
