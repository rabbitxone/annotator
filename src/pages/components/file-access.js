import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { fileAccessKeys, openFileAccessSettings } from '../../shared/file-access.js';
import { notice } from './notice.js';
import { toast } from './toast.js';

export async function showFileAccessSettings() {
  const result = await openFileAccessSettings().catch(() => 'failed');
  if (result === 'copied') toast(t('toastFileAccessCopied'));
  else if (result === 'failed') toast(t('toastCopyFailed'));
}

export function fileAccessButton({ primary = false } = {}) {
  return h(
    'button',
    { class: ['btn', 'btn-sm', primary ? 'btn-primary' : 'btn-outline'], type: 'button', onclick: showFileAccessSettings },
    icon(fileAccessKeys.icon, { size: 14 }),
    t(fileAccessKeys.action),
  );
}

export function fileAccessNotice() {
  return notice({
    tone: 'warning',
    iconName: 'alert',
    title: t('fileAccessTitle'),
    text: t(fileAccessKeys.text),
    actions: fileAccessButton({ primary: true }),
  });
}
