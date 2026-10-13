import { api } from '../../shared/api.js';
import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { notice } from './notice.js';

/** Shown once to people who updated from an older version; null for everyone else. */
export async function whatsNewBanner(settings, { compact = false, onDismiss } = {}) {
  const { whatsNew } = await api.storage.local.get('whatsNew').catch(() => ({}));
  if (!whatsNew) return null;

  const banner = notice({
    tone: 'accent',
    iconName: 'info',
    title: t('whatsNewTitle', whatsNew),
    text: compact ? t('whatsNewShort') : null,
    body:
      !compact &&
      h('ul', { class: 'notice-list' }, ['whatsNewPanel', 'whatsNewShortcuts', 'whatsNewCategories', 'whatsNewBackup'].map((key) => h('li', null, t(key)))),
    actions: h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => banner.dismiss() }, t('whatsNewDismiss')),
    onDismiss: () => {
      api.storage.local.remove('whatsNew').catch(() => { });
      onDismiss?.();
    },
  });
  return banner;
}
