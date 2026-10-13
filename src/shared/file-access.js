import { api } from './api.js';
import { copyText } from './clipboard.js';
import { isFirefox } from './platform.js';
import { isFileUrl } from './url.js';

/**
 * Both browsers keep extensions out of local files until the person allows it: Chrome with
 * "Allow access to file URLs", Firefox (153 and later) with "Access local files on your computer".
 * Resolves to true or false, and to null where the browser can't tell.
 */
export function fileAccessAllowed({ timeout = 1500 } = {}) {
  const check = api.extension?.isAllowedFileSchemeAccess;
  if (typeof check !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    // Chrome answers through the callback, Firefox's promise-style API ignores it: take
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

/** Text keys for this browser's wording of the switch. */
export const fileAccessKeys = isFirefox
  ? { text: 'fileAccessTextFirefox', off: 'settingFileAccessOffFirefox', action: 'fileAccessCopy', icon: 'copy' }
  : { text: 'fileAccessText', off: 'settingFileAccessOff', action: 'fileAccessOpen', icon: 'open' };

/**
 * Chrome's switch is one click away. Firefox won't let an extension open about:addons, so the
 * address goes to the clipboard instead; resolves to "copied" then.
 */
export async function openFileAccessSettings() {
  if (!isFirefox) {
    await api.tabs.create({ url: `chrome://extensions/?id=${api.runtime.id}` });
    return 'opened';
  }
  await copyText('about:addons');
  return 'copied';
}
