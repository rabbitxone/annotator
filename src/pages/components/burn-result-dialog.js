import { h } from '../../shared/dom.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { buildDialog, closeDialog, showDialog } from './dialog.js';

const LISTED = 8;

function list(heading, items) {
  return h(
    'div',
    { class: 'burn-group' },
    h('p', { class: 'dialog-text burn-heading' }, heading),
    h(
      'ul',
      { class: 'burn-list' },
      items.slice(0, LISTED).map((item) => h('li', null, item)),
      items.length > LISTED && h('li', { class: 'burn-more' }, t('burnMore', formatNumber(items.length - LISTED))),
    ),
  );
}

/**
 * What saving into the files did, in plain words, including what didn't work and why.
 * `downloaded` is true when the changed files went out as a zip instead of being written.
 */
export function burnResultDialog({ result, downloaded }) {
  return new Promise((resolve) => {
    const { updated, unchanged, notFound, skipped, failed, unplaced } = result;
    const lines = [];

    if (updated.length) lines.push(h('p', { class: 'dialog-text burn-main' }, t(downloaded ? 'burnDownloaded' : 'burnDone', formatNumber(updated.length))));
    else if (unchanged) lines.push(h('p', { class: 'dialog-text burn-main' }, t('burnUpToDate')));
    if (updated.length && unchanged) lines.push(h('p', { class: 'dialog-text burn-quiet' }, t('burnUnchanged', formatNumber(unchanged))));
    if (downloaded && updated.length) lines.push(h('p', { class: 'dialog-text burn-quiet' }, t('burnDownloadedHint')));
    if (unplaced) lines.push(h('p', { class: 'dialog-text burn-quiet' }, t('burnUnplaced', formatNumber(unplaced))));
    if (notFound.length) lines.push(list(t('burnNotFound', formatNumber(notFound.length)), notFound));
    if (skipped.length) lines.push(list(t('burnSkipped', formatNumber(skipped.length)), skipped.map((s) => s.path)));
    if (failed.length) lines.push(list(t('burnFailed', formatNumber(failed.length)), failed));
    if (!lines.length) lines.push(h('p', { class: 'dialog-text burn-main' }, t('burnNothing')));

    const dialog = buildDialog({
      className: 'burn-dialog',
      title: t('burnResultTitle'),
      body: lines,
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => closeDialog(dialog, 'confirm') }, t('actionClose'))],
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve();
    });
    showDialog(dialog);
  });
}
