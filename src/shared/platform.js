import { api } from './api.js';

const platform = () => globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? '';

export const isMac = /Mac|iPhone|iPad/i.test(platform());

export const isFirefox = (() => {
  try {
    return api.runtime.getURL('').startsWith('moz-extension:');
  } catch {
    return false;
  }
})();

const MAC_ORDER = ['⌃', '⌥', '⇧', '⌘'];
const MAC_KEYS = {
  ctrl: '⌘', // "Ctrl" in a manifest means ⌘ on a Mac
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

// Chrome on a Mac reports shortcuts as symbols ("⇧⌘L"), others as "Ctrl+Shift+L".
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

export function formatShortcut(shortcut, options) {
  const keys = parseShortcut(shortcut);
  return keys.length ? formatKeys(keys, options) : '';
}

const MAC_ICONS = { '⌘': 'keyCommand', '⌥': 'keyOption', '⇧': 'keyShift', '⌃': 'keyControl', '↩': 'keyReturn', '⇥': 'keyTab', '⌫': 'keyBackspace', '↑': 'keyUp', '↓': 'keyDown', '←': 'keyLeft', '→': 'keyRight' };
const MAC_WORDS = { '⎋': 'esc', '␣': 'space', '⌦': 'del' };

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
