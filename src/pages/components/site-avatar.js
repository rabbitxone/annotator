import { h } from '../../shared/dom.js';
import { isSafeFavicon } from '../../shared/favicon.js';
import { icon } from '../../shared/icons.js';
import { isFileUrl, siteLabel } from '../../shared/url.js';

function hueOf(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function letterOrFolder(url, size) {
  const host = siteLabel(url);
  return isFileUrl(url) ? icon('folder', { size: Math.round(size * 0.5) }) : (host.match(/[\p{L}\p{N}]/u)?.[0] ?? '#').toUpperCase();
}

export function siteAvatar(url, size = 32, page = null) {
  const host = siteLabel(url);
  const favicon = page?.favicon?.src;
  const avatar = h('span', {
    class: 'avatar',
    'aria-hidden': 'true',
    style: { '--hue': String(hueOf(host)), width: `${size}px`, height: `${size}px`, 'font-size': `${Math.round(size * 0.44)}px` },
  });
  if (!isSafeFavicon(favicon)) {
    avatar.append(letterOrFolder(url, size));
    return avatar;
  }
  const inner = Math.round(size * (size >= 28 ? 0.56 : 0.78));
  avatar.classList.add('avatar-favicon');
  avatar.append(
    h('img', {
      src: favicon,
      alt: '',
      width: inner,
      height: inner,
      decoding: 'async',
      onerror: () => {
        avatar.classList.remove('avatar-favicon');
        avatar.replaceChildren(letterOrFolder(url, size));
      },
    }),
  );
  return avatar;
}
