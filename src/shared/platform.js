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

/** A shortcut as the browser reports it ("Ctrl+Shift+L", or Chrome on a Mac "⇧⌘L"), as a list of keys. */
export function parseShortcut(shortcut) {
  const text = String(shortcut ?? '').trim();
  if (!text) return [];
  if (text.length > 1 && text.includes('+')) return text.split(/\s*\+\s*/).filter(Boolean);
  const keys = [];
  let rest = text;
  while (rest.length > 1 && SYMBOL_NAMES[rest[0]]) {
    keys.push(SYMBOL_NAMES[rest[0]]);
    rest = rest.slice(1);
  }
  return [...keys, rest];
}

/** Both browsers' answers come out the same way. */
export function formatShortcut(shortcut, options) {
  const keys = parseShortcut(shortcut);
  return keys.length ? formatKeys(keys, options) : '';
}

// What each Mac symbol is drawn with (see KEY_ICONS in icons.js); the rest stays text.
const MAC_ICONS = { '⌘': 'keyCommand', '⌥': 'keyOption', '⇧': 'keyShift', '⌃': 'keyControl', '↩': 'keyReturn', '⇥': 'keyTab', '⌫': 'keyBackspace', '↑': 'keyUp', '↓': 'keyDown', '←': 'keyLeft', '→': 'keyRight' };
const MAC_WORDS = { '⎋': 'esc', '␣': 'space', '⌦': 'del' };

/**
 * The pieces to draw: on a Mac each symbol becomes { icon }, other keys { text };
 * elsewhere it's one { text } like "Ctrl + Enter".
 */
export function keyParts(keys, { mac = isMac } = {}) {
  const label = formatKeys(keys, { mac });
  if (!mac) return [{ text: label }];
  return [...label].reduce((parts, char) => {
    if (MAC_ICONS[char]) parts.push({ icon: MAC_ICONS[char] });
    else if (MAC_WORDS[char]) parts.push({ text: MAC_WORDS[char] });
    else if (parts.at(-1)?.text != null && !MAC_WORDS[parts.at(-1).text]) parts.at(-1).text += char;
    else parts.push({ text: char });
    return parts;
  }, []);
}
