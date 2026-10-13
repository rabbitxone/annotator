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

// Chrome runs content scripts around its PDF viewer, but the text inside is out of reach.
// Say so to whoever asks, so the popup and the toolbar icon can explain it.
function answerForPdf() {
  api.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
    sendResponse({ pdf: true, url: normalizeUrl(location.href) });
    return false;
  });
}
