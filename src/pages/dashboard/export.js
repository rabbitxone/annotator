import { h } from '../../shared/dom.js';
import { buildExport, CSV_SEPARATORS, groupItems, localDate } from '../../shared/exchange.js';
import { exportLabels } from '../../shared/export-labels.js';
import { plural, t, uiLanguage } from '../../shared/i18n.js';
import { exportDialog } from '../components/export-dialog.js';
import { toast } from '../components/toast.js';
import { currentPage, filteredItems, isFiltered, selectedItems, state } from './state.js';

const PREFS_KEY = 'annotator-export';

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadPrefs() {
  const defaults = {
    scope: 'all',
    format: 'json',
    groupBy: 'page',
    separator: (1.5).toLocaleString(uiLanguage()).includes(',') ? 'semicolon' : 'comma',
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

function savePrefs(prefs) {
  try {
    const { scope, ...rest } = prefs;
    localStorage.setItem(PREFS_KEY, JSON.stringify(rest));
  } catch { }
}

function exportScopes() {
  const make = (id, label, groups) => ({
    id,
    label,
    groups,
    notes: groups.reduce((n, g) => n + g.annotations.length, 0),
    pages: groups.length,
    pageNotes: groups.filter((g) => g.includePageNote !== false && g.page.note?.trim()).length,
  });
  const everything = [...state.pages]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((page) => ({ page, annotations: page.annotations, includePageNote: true }));
  const scopes = [make('all', t('exportScopeAll'), everything)];

  const listView = state.view === 'all' || state.view === 'page';
  if (listView && (state.view === 'page' || isFiltered())) {
    const items = filteredItems();
    const page = state.view === 'page' ? currentPage() : null;
    const groups = page ? [{ page, annotations: items.map((i) => i.annotation), includePageNote: true }] : groupItems(items);
    if (groups.length) scopes.push(make('view', page ? t('exportScopeThisPage') : t('exportScopeFiltered'), groups));
  }
  if (state.selected.size) scopes.push(make('selected', t('exportScopeSelected'), groupItems(selectedItems())));
  return scopes;
}

export async function openExport(preferred) {
  const scopes = exportScopes();
  const prefs = loadPrefs();
  const has = (id) => scopes.some((s) => s.id === id);
  const first = has(preferred) ? preferred : has('selected') ? 'selected' : has('view') ? 'view' : 'all';
  const result = await exportDialog({ scopes, initial: { ...prefs, scope: first } });
  if (!result) return;
  savePrefs(result.remember);

  const { scope, format, options } = result;
  try {
    const file = buildExport(format, scope.groups, {
      labels: exportLabels(),
      separator: CSV_SEPARATORS[options.separator],
      groupBy: options.groupBy,
      categories: format === 'json' ? state.settings.categories : null,
      settings: format === 'json' && options.settings ? state.settings : null,
    });
    const name = format === 'json' && scope.id === 'all' ? 'annotator-backup' : 'annotator';
    download(`${name}-${localDate(Date.now())}.${file.extension}`, file.text, `${file.mime};charset=utf-8`);
    toast(t('toastExported', [plural('noteCount', scope.notes), t(`export${format[0].toUpperCase()}${format.slice(1)}`)]));
  } catch (err) {
    console.error('Annotator: export failed', err);
    toast(t('toastExportFailed'));
  }
}
