import { h } from './dom.js';
import { icon } from './icons.js';
import { formatKeys, keyParts, parseShortcut } from './platform.js';

export function keysNode(keys, { className = 'keys', size = 12 } = {}) {
  return h(
    'kbd',
    { class: className, 'aria-label': formatKeys(keys) },
    keyParts(keys).map((part) => (part.icon ? icon(part.icon, { size, className: 'icon key-icon' }) : h('span', { class: 'key-text' }, part.text))),
  );
}

export const shortcutNode = (shortcut, options) => keysNode(parseShortcut(shortcut), options);
