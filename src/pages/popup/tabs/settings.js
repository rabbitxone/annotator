import { t } from '../../../shared/i18n.js';
import { hostnameOf, isFileUrl, siteKey } from '../../../shared/url.js';
import { privacyNote, settingsPanel } from '../../components/settings.js';
import { state } from '../state.js';

export function settingsTab() {
  const url = state.pageUrl;
  return [
    settingsPanel(state.settings, {
      compact: true,
      fileAccess: state.fileAccess,
      site: url ? siteKey(url) : null,
      siteName: url ? (isFileUrl(url) ? t('siteLocalFiles') : hostnameOf(url)) : null,
      siteAppLike: state.appLike,
      siteUnavailable: state.pdf ? t('settingSitePdf') : null,
    }),
    privacyNote(),
  ];
}
