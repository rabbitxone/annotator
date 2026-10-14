import { h } from '../../shared/dom.js';
import { hasFormulaText } from '../../shared/exchange.js';
import { buildDialog, closeDialog, showDialog } from './dialog.js';
import { canWriteInPlace } from './folder-access.js';
import { dropdown } from './dropdown.js';
import { toggle } from './toggle.js';
import { formatNumber, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';

const FORMATS = [
  { id: 'json', ext: '.json', importable: true },
  { id: 'markdown', ext: '.md' },
  { id: 'csv', ext: '.csv' },
  { id: 'html', ext: '.html' },
];

const FORMAT_KEYS = { json: 'exportJson', markdown: 'exportMarkdown', csv: 'exportCsv', html: 'exportHtml' };

function choice(name, value, checked, onPick, title, hint, badge) {
  return h(
    'label',
    { class: 'choice' },
    h('input', { class: 'radio', type: 'radio', name, value, checked, onchange: () => onPick(value) }),
    h(
      'span',
      { class: 'choice-text' },
      h('span', { class: 'choice-title' }, title, badge),
      hint && h('span', { class: 'choice-hint' }, hint),
    ),
  );
}

// The label with its hint right under it on the left, the control beside them
function field(label, control, hint) {
  return h(
    'div',
    { class: 'option-row' },
    h('div', { class: 'option-text' }, h('span', { class: 'option-label' }, label), hint && h('span', { class: 'choice-hint' }, hint)),
    control,
  );
}

function select(options, value, onChange, ariaLabel) {
  return dropdown({ options: options.map(([id, label]) => ({ value: id, label })), value, onChange, ariaLabel, className: 'option-select' });
}

/**
 * scopes: [{ id, label, notes, pages, pageNotes, files }]  (files: how many of the pages are local files)
 * initial: { scope, format, groupBy, separator, settings }
 * Resolves to { scope, format, options } or null when cancelled.
 */
export function exportDialog({ scopes, initial }) {
  return new Promise((resolve) => {
    const state = { ...initial, scope: scopes.some((s) => s.id === initial.scope) ? initial.scope : scopes[0].id };
    const current = () => scopes.find((s) => s.id === state.scope);
    // Saving into files only concerns pages that are files on this computer
    const isEmpty = (scope) => (state.format === 'html' ? scope.files === 0 : scope.notes + scope.pageNotes === 0);

    const options = h('div', { class: 'export-options' });
    const submitIcon = icon('download', { size: 14 });
    const submitLabel = h('span', null, t('exportAction'));
    const submit = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => closeDialog(dialog, 'confirm') }, submitIcon, submitLabel);
    const empty = h('p', { class: 'choice-hint export-empty' }, t('exportEmpty'));

    function renderOptions() {
      const scope = current();
      const rows = [];
      if (state.format === 'json') {
        rows.push(
          field(
            t('exportIncludeSettings'),
            toggle(!!state.settings, t('exportIncludeSettings'), (on) => (state.settings = on)),
            t('exportIncludeSettingsHint'),
          ),
        );
      }
      if (state.format === 'markdown') {
        rows.push(
          field(
            t('exportGroupBy'),
            select([['page', t('exportGroupByPage')], ['color', t('exportGroupByColor')]], state.groupBy, (v) => (state.groupBy = v), t('exportGroupBy')),
          ),
        );
      }
      if (state.format === 'csv') {
        rows.push(
          field(
            t('exportSeparator'),
            select([['comma', t('exportSeparatorComma')], ['semicolon', t('exportSeparatorSemicolon')]], state.separator, (v) => (state.separator = v), t('exportSeparator')),
            t('exportSeparatorHint'),
          ),
        );
        // Only worth saying when something in this export would get the apostrophe
        if (hasFormulaText(scope.groups)) rows.push(h('p', { class: 'choice-hint' }, t('exportCsvFormulaHint')));
      }
      if (state.format === 'html') {
        rows.push(h('p', { class: 'choice-hint' }, t(canWriteInPlace ? 'exportHtmlSteps' : 'exportHtmlStepsDownload')));
        if (scope.files > 0) rows.push(h('p', { class: 'choice-hint' }, t('exportHtmlScope', [formatNumber(scope.files)])));
      }
      options.replaceChildren(...rows);
      options.hidden = rows.length === 0;
      submit.disabled = isEmpty(scope);
      empty.hidden = !isEmpty(scope);
      empty.textContent = t(state.format === 'html' ? 'exportHtmlEmpty' : 'exportEmpty');
      submitLabel.textContent = t(state.format === 'html' ? 'exportActionHtml' : 'exportAction');
    }

    const scopeChoices = scopes.map((scope) =>
      choice(
        'export-scope',
        scope.id,
        scope.id === state.scope,
        (id) => {
          state.scope = id;
          renderOptions();
        },
        scope.label,
        t(scope.notes + scope.pageNotes === 0 ? 'exportEmptyScope' : 'exportScopeCount', [formatNumber(scope.notes), formatNumber(scope.pages)]),
      ),
    );

    const formatChoices = FORMATS.map((format) =>
      choice(
        'export-format',
        format.id,
        format.id === state.format,
        (id) => {
          state.format = id;
          renderOptions();
        },
        h('span', null, t(FORMAT_KEYS[format.id]), ' ', h('span', { class: 'ext' }, format.ext)),
        t(`${FORMAT_KEYS[format.id]}Hint`),
        format.importable && h('span', { class: 'badge badge-accent choice-badge' }, icon('tick', { size: 12 }), t('exportReimportable')),
      ),
    );

    const dialog = buildDialog({
      className: 'export-dialog',
      title: t('exportDialogTitle'),
      body: [
        scopes.length > 1 &&
        h('fieldset', { class: 'export-field' }, h('legend', null, t('exportScopeLabel')), h('div', { class: 'choices' }, scopeChoices)),
        h('fieldset', { class: 'export-field' }, h('legend', null, t('exportFormatLabel')), h('div', { class: 'choices' }, formatChoices)),
        options,
        empty,
      ],
      actions: [h('button', { class: 'btn btn-outline', type: 'button', onclick: () => closeDialog(dialog, 'cancel') }, t('actionCancel')), submit],
    });

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(
        confirmed
          ? {
            scope: current(),
            format: state.format,
            options: { groupBy: state.groupBy, separator: state.separator, settings: !!state.settings },
            remember: { ...state },
          }
          : null,
      );
    });

    renderOptions();
    showDialog(dialog);
    dialog.querySelector('input[name="export-format"]:checked')?.focus();
  });
}
