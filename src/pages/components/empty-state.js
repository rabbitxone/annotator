import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';

export function emptyState(iconName, title, text, { panel = false } = {}) {
  return h(
    'div',
    { class: ['empty', panel && 'empty-panel'] },
    h('span', { class: 'empty-icon' }, icon(iconName, { size: 22 })),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
  );
}
