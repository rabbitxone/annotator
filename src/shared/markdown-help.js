import { h } from './dom.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { formatKeys } from './platform.js';

const SYNTAX = [
  ['**bold**', 'mdBold'],
  ['*italic*', 'mdItalic'],
  ['`code`', 'mdCode'],
  ['[text](https://…)', 'mdLink'],
  ['- item  1. item', 'mdList'],
  ['\\*', 'mdEscape'],
];

let count = 0;

export function markdownHelp({ onToggle = () => {} } = {}) {
  const describe = (label) => (label === 'mdLink' ? t('mdLinkOpen', formatKeys(['mod'])) : t(label));
  const id = `md-help-${++count}`;
  const help = h(
    'div',
    { class: 'md-help', id, hidden: true },
    h('p', { class: 'md-help-title' }, t('mdSupported')),
    h('dl', null, ...SYNTAX.flatMap(([syntax, label]) => [h('dt', null, h('code', null, syntax)), h('dd', null, describe(label))])),
  );
  const button = h(
    'button',
    {
      class: 'icon-btn md-btn',
      type: 'button',
      title: t('mdSupported'),
      'aria-label': t('mdSupported'),
      'aria-expanded': 'false',
      'aria-controls': id,
      onclick: () => {
        help.hidden = !help.hidden;
        button.setAttribute('aria-expanded', String(!help.hidden));
        onToggle();
      },
    },
    icon('markdown', { size: 18 }),
  );
  return { button, help };
}
