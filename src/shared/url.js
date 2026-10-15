const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'si',
]);

function isTrackingParam(name) {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

function formDecode(text) {
  const spaced = text.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function formEncode(text) {
  return encodeURIComponent(text)
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function normalizeQuery(search) {
  const pairs = [];
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const name = formDecode(eq === -1 ? part : part.slice(0, eq));
    if (isTrackingParam(name)) continue;
    pairs.push([name, formDecode(eq === -1 ? '' : part.slice(eq + 1))]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs.map(([name, value]) => `${formEncode(name)}=${formEncode(value)}`).join('&');
}

export function normalizeUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) return null;
  if (!/^#!?\//.test(url.hash)) url.hash = '';

  url.search = normalizeQuery(url.search);

  return url.toString();
}

// Firefox shows Reader View at about:reader?url=<page>; notes belong to that page.
export function unwrapReaderUrl(input) {
  if (typeof input !== 'string' || !input.startsWith('about:reader?')) return input;
  try {
    return new URL(input).searchParams.get('url') || input;
  } catch {
    return input;
  }
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

export const isFileUrl = (url) => typeof url === 'string' && url.startsWith('file:');

export function isPdfUrl(url) {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

const decode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

export function filePathOf(url) {
  try {
    const parsed = new URL(url);
    let path = decode(parsed.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    return parsed.host ? `//${parsed.host}${path}` : path;
  } catch {
    return String(url);
  }
}

export function fileNameOf(url) {
  const path = filePathOf(url).replace(/\/+$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

export function folderOf(url) {
  const path = filePathOf(url).replace(/\/+$/, '');
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? path.slice(0, cut + 1) || '/' : path.slice(0, cut);
}

export const siteKey = (url) => (isFileUrl(url) ? 'file://' : hostnameOf(url));

export const sourceOf = (url) => (isFileUrl(url) ? filePathOf(url) : hostnameOf(url));

export const siteLabel = (url) => (isFileUrl(url) ? folderOf(url) : hostnameOf(url));

export const pageName = ({ title, url }) => title?.trim() || (isFileUrl(url) ? fileNameOf(url) : hostnameOf(url));

export const displayAddress = (url) => (isFileUrl(url) ? filePathOf(url) : url);

export const fileSafeName = (url) =>
  (isFileUrl(url) ? fileNameOf(url).replace(/\.[^.]+$/, '') : hostnameOf(url)).replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'page';

export function toAddress(input) {
  const text = String(input ?? '').trim();
  if (!text) return '';
  let candidate = text;
  if (/^[A-Za-z]:[\\/]/.test(text)) candidate = `file:///${text[0].toUpperCase()}${text.slice(1).replace(/\\/g, '/')}`;
  else if (text.startsWith('\\\\')) candidate = `file:${text.replace(/\\/g, '/')}`;
  else if (text.startsWith('//')) candidate = `file:${text}`;
  else if (text.startsWith('/')) candidate = `file://${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) candidate = `https://${text}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

const trimSlashes = (text) => text.replace(/\/+$/, '');

export function isUnder(url, from) {
  const base = trimSlashes(from);
  return !!base && (url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`));
}

export function relocateUrl(url, from, to) {
  if (!isUnder(url, from)) return null;
  return trimSlashes(to) + url.slice(trimSlashes(from).length);
}
