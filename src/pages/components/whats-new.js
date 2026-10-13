import { api } from '../../shared/api.js';
import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { updateSettings } from '../../shared/store.js';
import { notice } from './notice.js';

/** Shown once to people who updated from an older version; null for everyone else. */
export async function whatsNewBanner(settings, { compact = false, onDismiss } = {}) {
  const { whatsNew } = await api.storage.local.get('whatsNew').catch(() => ({}));
  if (!whatsNew) return null;

  const forget = () => {
    api.storage.local.remove('whatsNew').catch(() => { });
    onDismiss?.();
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
          offNote.remove();
          enable.replaceWith(h('span', { class: 'notice-done' }, icon('tick', { size: 14 }), t('whatsNewSnapshotsOn')));
        },
      },
      icon('camera', { size: 14 }),
      t('whatsNewEnableSnapshots'),
    );
  const offNote = enable && h('p', { class: 'notice-text notice-muted' }, t('whatsNewSnapshotsOff'));

  const banner = notice({
    tone: 'accent',
    iconName: 'info',
    title: t('whatsNewTitle', whatsNew),
    text: compact ? t('whatsNewShort') : null,
    body: [
      !compact &&
      h('ul', { class: 'notice-list' }, ['whatsNewPanel', 'whatsNewShortcuts', 'whatsNewBackup', 'whatsNewSnapshots'].map((key) => h('li', null, t(key)))),
      offNote,
    ],
    actions: [enable, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => banner.dismiss() }, t('whatsNewDismiss'))],
    onDismiss: forget,
  });
  return banner;
}
