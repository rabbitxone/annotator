import { api } from './api.js';

export function t(key, substitutions) {
  return api.i18n.getMessage(key, substitutions) || key;
}

export const uiLanguage = () => api.i18n.getUILanguage?.() || navigator.language || 'en';

export function applyI18n(root = document) {
  document.documentElement.lang = uiLanguage().split('-')[0];
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    const dataKey = 'i18n' + attr.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.dataset[dataKey]));
    }
  }
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

let rtf;

export function relativeTime(timestamp, now = Date.now()) {
  const seconds = Math.round((timestamp - now) / 1000);
  if (Math.abs(seconds) < 45) return t('timeJustNow');
  rtf ??= new Intl.RelativeTimeFormat(uiLanguage(), { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return t('timeJustNow');
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString(uiLanguage(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatNumber(value) {
  return new Intl.NumberFormat(uiLanguage()).format(value);
}
