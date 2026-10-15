import { api } from './api.js';
import { copyText } from './clipboard.js';
import { isFirefox } from './platform.js';
import { isFileUrl } from './url.js';

export function fileAccessAllowed({ timeout = 1500 } = {}) {
  const check = api.extension?.isAllowedFileSchemeAccess;
  if (typeof check !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    // Chrome answers through the callback, Firefox through the promise.
    const timer = setTimeout(() => resolve(null), timeout);
    const finish = (value) => {
      clearTimeout(timer);
      resolve(value == null ? null : !!value);
    };
    try {
      const pending = check.call(api.extension, (allowed) => finish(api.runtime.lastError ? null : allowed));
      if (typeof pending?.then === 'function') pending.then(finish, () => finish(null));
    } catch {
      finish(null);
    }
  });
}

// Without access a local file's tab has no URL at all, just like a browser page.
export function mayBeBlockedFile({ allowed, pageUrl, tabUrl }) {
  if (allowed !== false) return false;
  return isFileUrl(pageUrl) || isFileUrl(tabUrl) || (!pageUrl && !tabUrl);
}

export const fileAccessKeys = isFirefox
  ? { text: 'fileAccessTextFirefox', off: 'settingFileAccessOffFirefox', action: 'fileAccessCopy', icon: 'copy' }
  : { text: 'fileAccessText', off: 'settingFileAccessOff', action: 'fileAccessOpen', icon: 'open' };

// Firefox won't let extensions open about:addons.
export async function openFileAccessSettings() {
  if (!isFirefox) {
    await api.tabs.create({ url: `chrome://extensions/?id=${api.runtime.id}` });
    return 'opened';
  }
  return (await copyText('about:addons')) ? 'copied' : 'failed';
}
