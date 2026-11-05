import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { isFileUrl, siteLabel } from '../../shared/url.js';

function hueOf(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function siteAvatar(url, size = 32) {
  const host = siteLabel(url);
  return h(
    'span',
    {
      class: 'avatar',
      'aria-hidden': 'true',
      style: { '--hue': String(hueOf(host)), width: `${size}px`, height: `${size}px`, 'font-size': `${Math.round(size * 0.44)}px` },
    },
    isFileUrl(url) ? icon('folder', { size: Math.round(size * 0.5) }) : (host.match(/[\p{L}\p{N}]/u)?.[0] ?? '#').toUpperCase(),
  );
}
