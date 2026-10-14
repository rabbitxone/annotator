import { parseBurned } from '../shared/burned-data.js';

const DATA = 'script[type="application/json"][data-annotator]';
const MARKS = 'mark[data-annotator-id]';

/** What was burned into this file (see shared/burn.js), checked and addressed as `url`; null if nothing was. */
export function readBurned(url) {
  const el = document.querySelector(DATA);
  return el ? parseBurned(el.textContent, url) : null;
}

/**
 * Takes the file's own marks out of the live page. Annotator draws its own from what is stored,
 * and two layers of highlights would stack; the file on disk is not touched.
 */
export function unwrapBurnedMarks() {
  for (const mark of Array.from(document.querySelectorAll(MARKS))) mark.replaceWith(...mark.childNodes);
}
