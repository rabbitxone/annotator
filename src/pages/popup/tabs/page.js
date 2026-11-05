import { api } from '../../../shared/api.js';
import { mayBeBlockedFile } from '../../../shared/file-access.js';
import { t } from '../../../shared/i18n.js';
import { setPageNote } from '../../../shared/store.js';
import { isFileUrl } from '../../../shared/url.js';
import { emptyState } from '../../components/empty-state.js';
import { fileAccessNotice } from '../../components/file-access.js';
import { notice } from '../../components/notice.js';
import { pageNoteBox } from '../../components/page-note.js';
import { toast } from '../../components/toast.js';
import { card, matches, render, setEditing, state } from '../state.js';

async function reanchor(id) {
  let result = null;
  try {
    result = await api.tabs.sendMessage(state.tabId, { type: 'reanchor', id }, { frameId: 0 });
  } catch { }
  if (!result?.ok) {
    toast(t('toastReanchorNoSelection'));
    return;
  }
  toast(t('toastReanchored'));
  state.orphans.delete(id);
  render();
}

export async function goToOnThisPage(id) {
  try {
    await api.tabs.sendMessage(state.tabId, { type: 'go-to', id }, { frameId: 0 });
  } finally {
    window.close();
  }
}

function fileNotice() {
  state.fileNotice ??= fileAccessNotice();
  return state.fileNotice;
}

function readerHint() {
  if (state.readerHint === undefined) state.readerHint = state.inReader ? notice({ iconName: 'info', text: t('readerViewHint') }) : null;
  return state.readerHint;
}

export function pageTab() {
  const lead = [state.whatsNew];
  if (!state.pageUrl) {
    const maybeFile = mayBeBlockedFile({ allowed: state.fileAccess, pageUrl: null, tabUrl: state.tabHidden ? null : undefined });
    return [maybeFile && fileNotice(), ...lead, emptyState('alert', t('emptyUnsupportedTitle'), t('emptyUnsupportedText'))];
  }
  if (state.pdf) return [...lead, emptyState('alert', t('pdfTitle'), t('pdfText'))];
  if (isFileUrl(state.pageUrl) && state.fileAccess === false) lead.unshift(fileNotice());

  const page = state.page ?? { url: state.pageUrl, title: state.tabTitle, annotations: [] };
  const noteBox = pageNoteBox(page.note, {
    query: state.query,
    onSave: (note) => setPageNote(page.url, page.title || state.tabTitle, note),
    onEditingChange: setEditing,
  });
  const head = [...lead, readerHint(), noteBox];
  const annotations = [...page.annotations].sort((a, b) => b.createdAt - a.createdAt);
  if (annotations.length === 0) return [...head, emptyState('highlighter', t('emptyPageTitle'), t('emptyPageText'))];

  const visible = annotations.filter((a) => matches(a, page));
  if (visible.length === 0) return [...head, emptyState('search', t('emptySearchTitle'), t('emptySearchText'))];
  return [
    ...head,
    ...visible.map((a) =>
      card(a, page, {
        orphan: state.orphans.has(a.id),
        onGo: state.orphans.has(a.id) || state.inReader ? null : () => goToOnThisPage(a.id),
        onReanchor: () => reanchor(a.id),
      }),
    ),
  ];
}
