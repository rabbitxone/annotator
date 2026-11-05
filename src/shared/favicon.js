export const FAVICON_SIZE = 32;
export const FAVICON_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function needsFavicon(page, now = Date.now()) {
  if (!page || !/^https?:/.test(page.url ?? '')) return false;
  return !page.favicon?.src || now - (page.favicon.at ?? 0) > FAVICON_MAX_AGE;
}

export function isSafeFavicon(src) {
  return typeof src === 'string' && src.length <= 24000 && /^data:image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp)[;,]/.test(src);
}
