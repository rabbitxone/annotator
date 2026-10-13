import { api } from './api.js';

const platform = () => globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? '';

export const isMac = /Mac|iPhone|iPad/i.test(platform());

/** Each build runs in one browser only; its own extension address tells which. */
export const isFirefox = (() => {
  try {
    return api.runtime.getURL('').startsWith('moz-extension:');
  } catch {
    return false;
  }
})();

// Apple writes modifiers as symbols, in this order, with nothing between them.
const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘'];
const MAC_KEYS = {
  ctrl: '⌘', // what "Ctrl" in a manifest means on a Mac
  command: '⌘',
  cmd: '⌘',
  meta: '⌘',
  mod: '⌘',
  macctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
};
const PC_KEYS = { ctrl: 'Ctrl', control: 'Ctrl', mod: 'Ctrl', macctrl: 'Ctrl', command: 'Ctrl', cmd: 'Ctrl', meta: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };
const NAMED = {
  period: '.',
  comma: ',',
  space: { mac: '␣', pc: 'Space' },
  enter: { mac: '↩', pc: 'Enter' },
  return: { mac: '↩', pc: 'Enter' },
  tab: { mac: '⇥', pc: 'Tab' },
  escape: { mac: '⎋', pc: 'Esc' },
  esc: { mac: '⎋', pc: 'Esc' },
  backspace: { mac: '⌫', pc: 'Backspace' },
  delete: { mac: '⌦', pc: 'Del' },
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};
const SYMBOL_NAMES = { '⌘': 'command', '⌥': 'alt', '⇧': 'shift', '⌃': 'macctrl' };

function keyName(key, mac) {
  const named = NAMED[key.toLowerCase()];
  if (named) return typeof named === 'string' ? named : mac ? named.mac : named.pc;
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Keys as this computer labels them: ["mod", "Enter"] is "⌘↩" on a Mac and "Ctrl + Enter"
 * elsewhere. "mod" and "Ctrl" both mean ⌘ on a Mac, like in a manifest; "MacCtrl" is ⌃.
 */
export function formatKeys(keys, { mac = isMac } = {}) {
  const modifiers = [];
  const rest = [];
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower in MAC_KEYS) modifiers.push(mac ? MAC_KEYS[lower] : PC_KEYS[lower]);
    else rest.push(keyName(key, mac));
  }
  if (mac) {
    modifiers.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return [...new Set(modifiers), ...rest].join('');
  }
  const order = ['Ctrl', 'Alt', 'Shift'];
  modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...new Set(modifiers), ...rest].join(' + ');
}

/**
 * A shortcut as the browser reports it. Chrome on a Mac already answers "⇧⌘L", Firefox
 * answers in manifest form ("Ctrl+Shift+L"); both come out the same way.
 */
export function formatShortcut(shortcut, options) {
  if (!shortcut) return '';
  const text = String(shortcut).trim();
  if (text.length > 1 && text.includes('+')) return formatKeys(text.split(/\s*\+\s*/).filter(Boolean), options);
  const keys = [];
  let rest = text;
  while (rest.length > 1 && SYMBOL_NAMES[rest[0]]) {
    keys.push(SYMBOL_NAMES[rest[0]]);
    rest = rest.slice(1);
  }
  return formatKeys([...keys, rest], options);
}
