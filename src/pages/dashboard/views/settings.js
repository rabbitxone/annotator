import { h } from '../../../shared/dom.js';
import { t } from '../../../shared/i18n.js';
import { aboutLinks, versionLabel } from '../../components/about-links.js';
import { categoriesPanel, dataPanel, privacyNote, settingsPanel, shortcutsPanel } from '../../components/settings.js';
import { deleteCategory, importBackup, openRelocate, saveCategories } from '../data.js';
import { openExport } from '../export.js';
import { stopWatching } from '../load-more.js';
import { categoryCounts, state } from '../state.js';

const sectionTitle = (key) => h('h2', { class: 'eyebrow settings-section-title' }, t(key));

function about() {
  return h(
    'div',
    { class: 'about' },
    h('div', null, h('p', { class: 'about-title' }, versionLabel()), h('p', { class: 'setting-sublabel' }, t('aboutText'))),
    aboutLinks({ guide: false }),
  );
}

const SECTIONS = [
  ['appearance', 'settingsAppearance'],
  ['categories', 'settingsCategories'],
  ['shortcuts', 'settingsShortcuts'],
  ['data', 'settingsData'],
];

function contents() {
  return h(
    'nav',
    { class: 'settings-toc', 'aria-label': t('navSettings') },
    SECTIONS.map(([id, key]) =>
      h('button', { type: 'button', onclick: () => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t(key)),
    ),
  );
}

export function settingsView() {
  stopWatching();
  const title = (id) => {
    const el = sectionTitle(SECTIONS.find(([key]) => key === id)[1]);
    el.id = `settings-${id}`;
    return el;
  };
  return [
    h(
      'div',
      { class: 'settings-page' },
      h(
        'div',
        { class: 'settings-layout' },
        title('appearance'),
        settingsPanel(state.settings, { fileAccess: state.fileAccess }),
        title('categories'),
        categoriesPanel(state.settings, { counts: categoryCounts(), onChange: saveCategories, onDelete: deleteCategory }),
        title('shortcuts'),
        shortcutsPanel(),
        title('data'),
        dataPanel({
          onExport: () => openExport('all'),
          onImport: importBackup,
          onRelocate: openRelocate,
        }),
        privacyNote(),
        about(),
      ),
      contents(),
    ),
  ];
}
