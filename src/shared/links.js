import { isFirefox } from './platform.js';

const REPO = 'https://github.com/rabbitxone/annotator';

export const LINKS = {
  repo: REPO,
  privacy: `${REPO}/blob/main/PRIVACY.md`,
  support: 'https://ko-fi.com/fpolak14',
  sponsors: 'https://github.com/sponsors/rabbitxone',
  review: {
    chrome: 'https://chromewebstore.google.com/detail/annotator/lodikfcpadhmibjmhoihgedpmjlhcjol',
    firefox: 'https://addons.mozilla.org/addon/annotator',
  },
};

export const reviewLink = () => (isFirefox ? LINKS.review.firefox : LINKS.review.chrome) ?? null;
