import { api } from '../shared/api.js';
import { FAVICON_SIZE, isSafeFavicon, needsFavicon } from '../shared/favicon.js';
import { getPage, getSettings, setFavicon } from '../shared/store.js';
import { normalizeUrl, unwrapReaderUrl } from '../shared/url.js';

const MAX_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 16 * 1024;
const RETRY_DELAYS = [0, 2000, 6000];
const inFlight = new Set();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function rasterize(blob) {
  const bitmap = await createImageBitmap(blob, { resizeWidth: FAVICON_SIZE, resizeHeight: FAVICON_SIZE, resizeQuality: 'high' });
  const canvas = new OffscreenCanvas(FAVICON_SIZE, FAVICON_SIZE);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
  bitmap.close?.();
  const png = await canvas.convertToBlob({ type: 'image/png' });
  return `data:image/png;base64,${toBase64(await png.arrayBuffer())}`;
}

async function toDataUrl(blob) {
  if (!blob || blob.size === 0 || blob.size > MAX_BYTES) return null;
  try {
    return await rasterize(blob);
  } catch {
    if (!/svg/i.test(blob.type) || blob.size > MAX_SVG_BYTES) return null;
    return `data:image/svg+xml;base64,${toBase64(await blob.arrayBuffer())}`;
  }
}

const read = async (url) => {
  const response = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  return response.ok ? response.blob() : null;
};

const chromeCache = (pageUrl) => api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${FAVICON_SIZE}`);
const hasChromeCache = () => !!api.runtime.getManifest().permissions?.includes('favicon');

let genericIcon = null;
async function isGeneric(src) {
  genericIcon ??= read(chromeCache('https://annotator.invalid/')).then(toDataUrl).catch(() => '');
  return src === (await genericIcon);
}

async function iconFor(pageUrl, tab) {
  if (hasChromeCache()) {
    const src = await read(chromeCache(pageUrl)).then(toDataUrl);
    return src && !(await isGeneric(src)) ? src : null;
  }

  const href = tab.favIconUrl;
  if (typeof href !== 'string' || !/^(data|https?):/.test(href)) return null;
  return read(href).then(toDataUrl);
}

export async function saveFavicon({ url }, tab) {
  const pageUrl = normalizeUrl(url);
  if (!pageUrl || !tab?.url || normalizeUrl(unwrapReaderUrl(tab.url)) !== pageUrl || inFlight.has(pageUrl)) return false;
  inFlight.add(pageUrl);
  try {
    if ((await getSettings()).pageIcons === false || !needsFavicon(await getPage(pageUrl))) return false;
    for (const delay of RETRY_DELAYS) {
      await wait(delay);
      const current = delay ? await api.tabs.get(tab.id).catch(() => null) : tab;
      if (!current?.url || normalizeUrl(unwrapReaderUrl(current.url)) !== pageUrl) return false;
      const src = await iconFor(pageUrl, current).catch(() => null);
      if (isSafeFavicon(src)) {
        if ((await getSettings()).pageIcons === false) return false;
        await setFavicon(pageUrl, { src, at: Date.now() });
        return true;
      }
    }
    return false;
  } finally {
    inFlight.delete(pageUrl);
  }
}

export const faviconSupported = () => typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
