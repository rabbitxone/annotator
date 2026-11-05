import { h } from '../../shared/dom.js';
import { formatNumber, t } from '../../shared/i18n.js';

let observer = null;

export function moreButton(remaining, onClick) {
  return h('button', { class: 'btn btn-outline list-more-button', type: 'button', onclick: onClick }, t('listShowMore', formatNumber(remaining)));
}

export function watchFooter(footer, onVisible) {
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), { rootMargin: '900px' });
  observer.observe(footer);
}

export function rewatch(footer) {
  observer?.unobserve(footer);
  observer?.observe(footer);
}

export function stopWatching() {
  observer?.disconnect();
}
