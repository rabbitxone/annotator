import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { fileAccessKeys, openFileAccessSettings } from '../../shared/file-access.js';
import { notice } from './notice.js';
import { toast } from './toast.js';

/** Opens the browser's switch, or (Firefox) copies where to find it and says so. */
export async function showFileAccessSettings() {
  if ((await openFileAccessSettings()) === 'copied') toast(t('toastFileAccessCopied'));
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
