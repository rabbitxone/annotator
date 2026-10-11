import { api } from '../../shared/api.js';
import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { updateSettings } from '../../shared/store.js';

/** Shown once to people who updated from an older version; null for everyone else. */
export async function whatsNewBanner(settings, { compact = false } = {}) {
  const { whatsNew } = await api.storage.local.get('whatsNew').catch(() => ({}));
  if (!whatsNew) return null;

  const dismiss = () => {
    api.storage.local.remove('whatsNew').catch(() => { });
    banner.remove();
  };
  const enable =
    !settings.autoSnapshot &&
    h(
      'button',
      {
        class: 'btn btn-primary btn-sm',
        type: 'button',
        onclick: async () => {
          await updateSettings({ autoSnapshot: true });
          enable.replaceWith(h('span', { class: 'whats-new-done' }, icon('tick', { size: 14 }), t('whatsNewSnapshotsOn')));
        },
      },
      icon('camera', { size: 14 }),
      t('whatsNewEnableSnapshots'),
    );

  const banner = h(
    'section',
    { class: ['whats-new', compact && 'compact'], role: 'status' },
    h(
      'div',
      { class: 'whats-new-head' },
      h('p', { class: 'whats-new-title' }, t('whatsNewTitle', whatsNew)),
      h(
        'button',
        { class: 'icon-btn', type: 'button', title: t('actionClose'), 'aria-label': t('actionClose'), onclick: dismiss },
        icon('close', { size: 14 }),
      ),
    ),
    compact
      ? h('p', { class: 'whats-new-text' }, t('whatsNewShort'))
      : h(
        'ul',
        { class: 'whats-new-list' },
        ['whatsNewPanel', 'whatsNewShortcuts', 'whatsNewBackup', 'whatsNewSnapshots'].map((key) => h('li', null, t(key))),
      ),
    enable && h('p', { class: 'whats-new-text' }, t('whatsNewSnapshotsOff')),
    h(
      'div',
      { class: 'whats-new-actions' },
      enable,
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: dismiss }, t('whatsNewDismiss')),
    ),
  );
  return banner;
}
