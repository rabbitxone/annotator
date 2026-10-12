import { h } from '../../shared/dom.js';
import { formatBytes, formatNumber, t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';

const FORMATS = [
  { id: 'json', ext: '.json', importable: true },
  { id: 'markdown', ext: '.md' },
  { id: 'csv', ext: '.csv' },
];

const FORMAT_KEYS = { json: 'exportJson', markdown: 'exportMarkdown', csv: 'exportCsv' };

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

function field(label, control, hint) {
  return h(
    'label',
    { class: 'option-row' },
    h('span', { class: 'option-label' }, label),
    control,
    hint && h('span', { class: 'choice-hint option-hint' }, hint),
  );
}

function select(options, value, onChange) {
  return h(
    'select',
    { class: 'input option-select', onchange: (e) => onChange(e.target.value) },
    options.map(([id, label]) => h('option', { value: id, selected: id === value }, label)),
  );
}

/**
 * scopes: [{ id, label, notes, pages, pageNotes, snapshots: { count, bytes } }]
 * initial: { scope, format, snapshots, groupBy, separator }
 * Resolves to { scope, format, options } or null when cancelled.
 */
export function exportDialog({ scopes, initial }) {
  return new Promise((resolve) => {
    const state = { ...initial, scope: scopes.some((s) => s.id === initial.scope) ? initial.scope : scopes[0].id };
    const current = () => scopes.find((s) => s.id === state.scope);
    const isEmpty = (scope) => scope.notes + scope.pageNotes === 0;

    const options = h('div', { class: 'export-options' });
    const submit = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => dialog.close('confirm') }, icon('download', { size: 14 }), t('exportAction'));
    const empty = h('p', { class: 'choice-hint export-empty' }, t('exportEmpty'));

    function renderOptions() {
      const scope = current();
      const rows = [];
      if (state.format === 'json' && scope.snapshots.count > 0) {
        rows.push(
          h(
            'label',
            { class: 'option-check' },
            h('input', { class: 'checkbox', type: 'checkbox', checked: state.snapshots, onchange: (e) => (state.snapshots = e.target.checked) }),
            t('exportIncludeSnapshots', [formatNumber(scope.snapshots.count), formatBytes(scope.snapshots.bytes)]),
          ),
        );
      }
      if (state.format === 'markdown') {
        rows.push(
          field(
            t('exportGroupBy'),
            select([['page', t('exportGroupByPage')], ['color', t('exportGroupByColor')]], state.groupBy, (v) => (state.groupBy = v)),
          ),
        );
      }
      if (state.format === 'csv') {
        rows.push(
          field(
            t('exportSeparator'),
            select([['comma', t('exportSeparatorComma')], ['semicolon', t('exportSeparatorSemicolon')]], state.separator, (v) => (state.separator = v)),
            t('exportSeparatorHint'),
          ),
          h('p', { class: 'choice-hint' }, t('exportCsvFormulaHint')),
        );
      }
      options.replaceChildren(...rows);
      options.hidden = rows.length === 0;
      submit.disabled = isEmpty(scope);
      empty.hidden = !isEmpty(scope);
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
        isEmpty(scope) ? t('exportEmptyScope') : t('exportScopeCount', [formatNumber(scope.notes), formatNumber(scope.pages)]),
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

    const dialog = h(
      'dialog',
      { class: 'dialog export-dialog', 'aria-labelledby': 'export-title' },
      h(
        'div',
        { class: 'dialog-body' },
        h('h2', { class: 'dialog-title', id: 'export-title' }, t('exportDialogTitle')),
        scopes.length > 1 &&
        h('fieldset', { class: 'export-field' }, h('legend', null, t('exportScopeLabel')), h('div', { class: 'choices' }, scopeChoices)),
        h('fieldset', { class: 'export-field' }, h('legend', null, t('exportFormatLabel')), h('div', { class: 'choices' }, formatChoices)),
        options,
        h('p', { class: 'export-note' }, icon('info', { size: 14 }), h('span', null, t('exportNote'))),
        empty,
      ),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => dialog.close('cancel') }, t('actionCancel')),
        submit,
      ),
    );

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(
        confirmed
          ? {
            scope: current(),
            format: state.format,
            options: { snapshots: state.snapshots, groupBy: state.groupBy, separator: state.separator },
            remember: { ...state },
          }
          : null,
      );
    });

    renderOptions();
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('input[name="export-format"]:checked')?.focus();
  });
}
