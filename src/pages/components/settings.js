import { api } from '../../shared/api.js';
import { h } from '../../shared/dom.js';
import { t } from '../../shared/i18n.js';
import { icon } from '../../shared/icons.js';
import { setSiteRule, updateSettings } from '../../shared/store.js';
import { swatchPicker } from './card.js';

function settingItem(iconName, label, sublabel, trailing, callout) {
  return h(
    'div',
    { class: 'setting-item' },
    h(
      'div',
      { class: 'setting-info' },
      h('span', { class: 'setting-icon' }, icon(iconName)),
      h(
        'div',
        null,
        h('p', { class: 'setting-label' }, label),
        sublabel && h('p', { class: 'setting-sublabel' }, sublabel),
      ),
    ),
    trailing,
    callout &&
    h('p', { class: 'setting-callout' }, icon('info', { size: 12 }), h('span', null, callout)),
  );
}

function segmented(options, value, onChange) {
  const group = h(
    'div',
    { class: 'segmented', role: 'group' },
    options.map((opt) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(opt.value === value),
          title: opt.label,
          'aria-label': opt.label,
          dataset: { value: opt.value },
          onclick: () => {
            for (const btn of group.children) btn.setAttribute('aria-pressed', String(btn.dataset.value === opt.value));
            onChange(opt.value);
          },
        },
        opt.icon ? icon(opt.icon, { size: 15 }) : null,
        opt.showLabel === false ? null : opt.label,
      ),
    ),
  );
  return group;
}

function toggle(checked, label, onChange) {
  return h(
    'label',
    { class: 'toggle' },
    h('input', {
      type: 'checkbox',
      role: 'switch',
      checked,
      'aria-label': label,
      onchange: (e) => onChange(e.target.checked),
    }),
    h('span', { class: 'toggle-track' }),
  );
}

export function settingsPanel(settings, { compact = false, site = null, siteAppLike = false } = {}) {
  const save = (patch) => updateSettings(patch);

  return h(
    'div',
    { class: 'settings-panel' },
    settingItem(
      'highlighter',
      t('settingToolbar'),
      t('settingToolbarHint'),
      toggle(settings.selectionToolbar, t('settingToolbar'), (selectionToolbar) => save({ selectionToolbar })),
    ),
    site &&
    settingItem(
      'globe',
      t('settingSiteDisable'),
      site,
      siteAppLike
        ? toggle(settings.siteRules?.[site] !== 'always', t('settingSite'), (on) => setSiteRule(site, on ? 'auto' : 'always'))
        : toggle(settings.siteRules?.[site] === 'never', t('settingSite'), (on) => setSiteRule(site, on ? 'never' : 'auto')),
      siteAppLike ? t('settingSiteAppHint') : null,
    ),
    settingItem(
      'underline',
      t('settingStyle'),
      compact ? null : t('settingStyleHint'),
      segmented(
        [
          { value: 'background', label: t('styleBackground') },
          { value: 'underline', label: t('styleUnderline') },
        ],
        settings.highlightStyle,
        (highlightStyle) => save({ highlightStyle }),
      ),
    ),
    settingItem(
      'note',
      t('settingDefaultColor'),
      compact ? null : t('settingDefaultColorHint'),
      swatchPicker(settings.defaultColor, (defaultColor) => save({ defaultColor })),
    ),
  );
}

const COMMANDS = ['highlight', 'highlight-note', 'toggle-panel'];

function openShortcutSettings() {
  if (api.commands?.openShortcutSettings) api.commands.openShortcutSettings();
  else api.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

const KEY_NAMES = { Period: '.', Comma: ',', Space: '␣' };
const prettyShortcut = (shortcut) => shortcut.replace(/\b(Period|Comma|Space)\b/g, (name) => KEY_NAMES[name]);

export function shortcutsPanel() {
  const rows = h('div');
  const panel = h(
    'div',
    { class: 'settings-panel' },
    rows,
    settingItem(
      'highlighter',
      t('shortcutToolbarKeys'),
      t('shortcutToolbarKeysHint'),
      h('span', { class: 'kbd-group' }, h('kbd', { class: 'kbd' }, '1–5'), h('kbd', { class: 'kbd' }, 'N')),
    ),
    h(
      'div',
      { class: 'setting-item setting-actions' },
      h('p', { class: 'setting-sublabel' }, t('shortcutChangeHint')),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: openShortcutSettings }, icon('keyboard', { size: 14 }), t('shortcutChange')),
    ),
  );

  Promise.resolve(api.commands?.getAll?.())
    .then((commands = []) => {
      const known = new Map(commands.map((c) => [c.name, c.shortcut]));
      rows.replaceChildren(
        ...COMMANDS.map((name) => {
          const shortcut = known.get(name);
          return settingItem(
            name === 'toggle-panel' ? 'panel' : name === 'highlight' ? 'highlighter' : 'noteEdit',
            t(`cmd_${name.replace(/-/g, '_')}`),
            null,
            h('kbd', { class: ['kbd', !shortcut && 'kbd-empty'] }, shortcut ? prettyShortcut(shortcut) : t('shortcutNone')),
          );
        }),
      );
    })
    .catch(() => { });
  return panel;
}

const formatBytes = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function dataPanel({ settings, snapshots, onExportBackup, onExportMarkdown, onImport, onCleanSnapshots }) {
  const file = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: () => {
      if (file.files[0]) onImport(file.files[0]);
      file.value = '';
    },
  });
  return h(
    'div',
    { class: 'settings-panel' },
    settingItem(
      'download',
      t('dataBackup'),
      t('dataBackupHint'),
      h(
        'div',
        { class: 'setting-buttons' },
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: onExportBackup }, icon('download', { size: 14 }), t('dataExport')),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => file.click() }, icon('upload', { size: 14 }), t('dataImport')),
        file,
      ),
    ),
    settingItem(
      'camera',
      t('settingAutoSnapshot'),
      t('settingAutoSnapshotHint'),
      toggle(settings.autoSnapshot, t('settingAutoSnapshot'), (autoSnapshot) => updateSettings({ autoSnapshot })),
    ),
    settingItem(
      'archive',
      t('dataSnapshots'),
      snapshots.count
        ? t('dataSnapshotsHint', [String(snapshots.count), formatBytes(snapshots.bytes)])
        : t('dataSnapshotsNone'),
      snapshots.unused > 0 &&
      h(
        'button',
        { class: 'btn btn-outline btn-sm', type: 'button', onclick: onCleanSnapshots },
        icon('delete', { size: 14 }),
        t('dataSnapshotsClean', String(snapshots.unused)),
      ),
    ),
    settingItem(
      'note',
      t('dataMarkdown'),
      t('dataMarkdownHint'),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: onExportMarkdown }, icon('download', { size: 14 }), t('dataExportMarkdown')),
    ),
  );
}

export function privacyNote() {
  return h(
    'div',
    { class: 'privacy-note' },
    icon('shield', { size: 18 }),
    h('div', null, h('strong', null, t('privacyTitle')), t('privacyText')),
  );
}
