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

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}
