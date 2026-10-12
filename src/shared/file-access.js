import { api } from './api.js';
import { isFileUrl } from './url.js';

/**
 * Chrome keeps extensions out of local files until the person turns on "Allow access to file URLs".
 * Resolves to true or false there, and to null where the browser has no such switch (Firefox).
 */
export function fileAccessAllowed({ timeout = 1500 } = {}) {
  const check = api.extension?.isAllowedFileSchemeAccess;
  if (typeof check !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    // Chrome answers through the callback, Firefox's promise-style API may ignore it: take
    // whichever comes first, and never leave a popup waiting.
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

/**
 * While access is off, a local file's tab shows up without an address or title, so "no address
 * at all" is the only trace of one. A browser page looks the same, hence the hedged wording in the UI.
 */
export function mayBeBlockedFile({ allowed, pageUrl, tabUrl }) {
  if (allowed !== false) return false;
  return isFileUrl(pageUrl) || isFileUrl(tabUrl) || (!pageUrl && !tabUrl);
}

export function openFileAccessSettings() {
  return api.tabs.create({ url: `chrome://extensions/?id=${api.runtime.id}` });
}
