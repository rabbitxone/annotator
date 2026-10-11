import { h } from '../../shared/dom.js';
import { formatDate, formatNumber, relativeTime, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';

/** versions: snapshot metadata for one page, oldest first. */
export function snapshotBar(versions, { onOpen, onSave, emptyHint }) {
  const latest = versions.at(-1);
  const status = h('span', { class: 'snapshot-status', 'aria-live': 'polite' });
  const save =
    onSave &&
    h(
      'button',
      {
        class: 'btn btn-outline btn-sm',
        type: 'button',
        title: t('snapshotSave'),
        onclick: async () => {
          save.disabled = true;
          const result = await onSave();
          save.disabled = false;
          status.textContent = t(result?.unchanged ? 'snapshotUnchanged' : result?.ok ? 'panelSaved' : 'snapshotFailed');
          setTimeout(() => (status.textContent = ''), 2500);
        },
      },
      icon('camera', { size: 14 }),
      t('actionSave'),
    );

  return h(
    'section',
    { class: ['snapshot-bar', !latest && 'empty'] },
    h('span', { class: 'snapshot-icon' }, icon('archive', { size: 16 })),
    h(
      'div',
      { class: 'snapshot-text' },
      h('p', { class: 'snapshot-title' }, t('snapshotLabel'), status),
      h(
        'p',
        { class: 'snapshot-sub', title: latest ? formatDate(latest.capturedAt) : null },
        latest ? t('snapshotSummary', [relativeTime(latest.capturedAt), formatNumber(versions.length)]) : emptyHint || t('snapshotNone'),
      ),
    ),
    h(
      'div',
      { class: 'snapshot-actions' },
      latest &&
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: onOpen }, icon('archive', { size: 14 }), t('snapshotOpen')),
      save,
    ),
  );
}
