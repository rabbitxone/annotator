import { api } from '../shared/api.js';
import * as store from '../shared/store.js';
import { normalizeUrl } from '../shared/url.js';
import { startAnnotator } from './annotator.js';

function alive() {
  try {
    return !!api.runtime?.id;
  } catch {
    return false;
  }
}

if (window.top === window && !globalThis.__annotatorAlive?.()) {
  globalThis.__annotatorAlive = alive;
  if (document.contentType === 'application/pdf') answerForPdf();
  else startAnnotator({ store });
}

// Chrome injects into its PDF viewer, but the text is out of reach.
function answerForPdf() {
  api.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
    sendResponse({ pdf: true, url: normalizeUrl(location.href) });
    return false;
  });
}
