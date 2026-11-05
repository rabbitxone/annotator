import { api } from '../../shared/api.js';
import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { LINKS, reviewLink } from '../../shared/links.js';
import { markRated, supportPrompt } from '../../shared/support-prompt.js';

export const versionLabel = () => `Annotator ${api.runtime.getManifest().version}`;

export function aboutLinks({ guide = true, onGuide = null, compact = false } = {}) {
  const external = (href, label, iconName, onclick = null) =>
    href && h('a', { class: 'about-link', href, target: '_blank', rel: 'noopener', onclick }, iconName && icon(iconName, { size: 13 }), label);
  const rate = supportPrompt() === 'rate' && reviewLink();
  return h(
    'nav',
    { class: 'about-links', 'aria-label': 'Annotator' },
    guide &&
    h(
      'a',
      {
        class: 'about-link',
        href: 'guide.html',
        onclick: onGuide && ((e) => {
          e.preventDefault();
          onGuide();
        }),
      },
      t('navGuide'),
    ),
    !compact && external(LINKS.privacy, t('aboutPrivacy')),
    !compact && external(LINKS.repo, 'GitHub'),
    rate ? external(rate, t('aboutRate'), 'star', () => markRated()) : external(LINKS.support, t('aboutSupport'), 'heart'),
  );
}
