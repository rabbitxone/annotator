import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { collapseOut } from '../../shared/motion.js';

/**
 * Every message box in the popup and the dashboard, so they all share one shape.
 * tone: "accent" (news, good to know), "warning" (something is in the way) or "neutral".
 * Without a title the icon sits next to the text on one line.
 */
export function notice({ tone = 'neutral', iconName, title, text, body, actions, onDismiss, className } = {}) {
  const dismiss = () => collapseOut(el, onDismiss);
  const el = h(
    'section',
    {
      class: ['notice', `notice-${tone}`, !title && 'notice-plain', className],
      role: 'status',
      dataset: { enter: '' },
      onanimationend: (e) => e.target === el && delete el.dataset.enter,
    },
    title
      ? h(
        'div',
        { class: 'notice-head' },
        h('p', { class: 'notice-title' }, iconName && icon(iconName, { size: 16 }), h('span', null, title)),
        onDismiss &&
        h('button', { class: 'icon-btn notice-close', type: 'button', title: t('actionClose'), 'aria-label': t('actionClose'), onclick: dismiss }, icon('close', { size: 14 })),
      )
      : iconName && icon(iconName, { size: 16 }),
    h('div', { class: 'notice-body' }, text && h('p', { class: 'notice-text' }, text), body),
    actions && h('div', { class: 'notice-actions' }, actions),
  );
  el.dismiss = dismiss;
  return el;
}
