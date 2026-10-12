import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { openFileAccessSettings } from '../../shared/file-access.js';

export function fileAccessNotice({ compact = false } = {}) {
  return h(
    'section',
    { class: ['notice', 'notice-warning', compact && 'compact'], role: 'status' },
    h('p', { class: 'notice-title' }, icon('alert', { size: 14 }), t('fileAccessTitle')),
    h('p', { class: 'notice-text' }, t('fileAccessText')),
    h(
      'div',
      { class: 'notice-actions' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openFileAccessSettings() }, icon('open', { size: 14 }), t('fileAccessOpen')),
    ),
  );
}
