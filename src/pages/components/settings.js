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

export function privacyNote() {
  return h(
    'div',
    { class: 'privacy-note' },
    icon('shield', { size: 18 }),
    h('div', null, h('strong', null, t('privacyTitle')), t('privacyText')),
  );
}
