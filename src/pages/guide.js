import { api } from '../shared/api.js';
import { applyCategories } from '../shared/apply-categories.js';
import { h } from '../shared/dom.js';
import { fileAccessAllowed, fileAccessKeys } from '../shared/file-access.js';
import { applyI18n, t } from '../shared/i18n.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { keysNode, shortcutNode } from '../shared/keys.js';
import * as store from '../shared/store.js';
import { installTooltips } from '../shared/tooltip.js';
import { startAnnotator } from '../content/annotator.js';
import { fileAccessButton } from './components/file-access.js';
import { openShortcutSettings } from './components/settings.js';

const DEMO_ADDRESS = 'https://annotator.invalid/guide';

function demoStore() {
  let page = null;
  const touch = (url, title) => (page ??= { url, title, updatedAt: 0, annotations: [] });
  const find = (id) => page?.annotations.find((a) => a.id === id);
  return {
    ensureMigrated: async () => { },
    getSettings: async () => ({ ...(await store.getSettings()), selectionToolbar: true }),
    onStoreChange: (listener) =>
      store.onStoreChange(({ settings }) => settings && listener({ pages: new Map(), settings: { ...settings, selectionToolbar: true } })),
    getPage: async () => (page ? structuredClone(page) : null),
    addAnnotation: async (url, title, annotation) => {
      touch(url, title).annotations.push(structuredClone(annotation));
    },
    updateAnnotation: async (_url, id, patch) => {
      Object.assign(find(id) ?? {}, patch);
    },
    deleteAnnotations: async (_url, ids) => {
      if (page) page.annotations = page.annotations.filter((a) => !ids.includes(a.id));
    },
    reanchorAnnotation: async (_url, id, selector) => {
      Object.assign(find(id) ?? {}, selector);
    },
    setPageNote: async (url, title, note) => {
      touch(url, title).note = note;
    },
    setLost: async () => { },
  };
}

const COMMANDS = {
  highlight: { type: 'create-from-selection', withNote: false, fromCommand: true },
  'highlight-note': { type: 'create-from-selection', withNote: true, fromCommand: true },
  'toggle-panel': { type: 'toggle-panel' },
};

function startDemo() {
  const demo = document.getElementById('demo');
  const annotator = startAnnotator({
    store: demoStore(),
    address: () => DEMO_ADDRESS,
    allows: (el) => demo.contains(el),
    alwaysOn: true,
  });
  // No content script runs on extension pages, so shortcuts are handled here
  api.commands?.onCommand?.addListener((command) => {
    if (document.visibilityState === 'visible' && document.hasFocus() && COMMANDS[command]) annotator.handle(COMMANDS[command]);
  });
  document.getElementById('demo-panel').addEventListener('click', () => annotator.handle({ type: 'toggle-panel' }));
  document.getElementById('demo-reset').addEventListener('click', () => {
    location.hash = 'demo-card';
    location.reload();
  });
}

function keysRow(shortcut) {
  return h(
    'p',
    { class: 'guide-keys' },
    shortcut ? shortcutNode(shortcut, { className: 'kbd', size: 13 }) : h('kbd', { class: 'kbd kbd-empty' }, t('shortcutNone')),
  );
}

function step(iconName, title, text, extra) {
  return h(
    'li',
    { class: 'guide-step' },
    h('span', { class: 'guide-step-icon' }, icon(iconName, { size: 18 })),
    h('div', { class: 'guide-step-body' }, h('h2', { class: 'guide-step-title' }, title), h('p', { class: 'guide-step-text' }, text), extra),
  );
}

async function renderSteps() {
  const commands = await Promise.resolve(api.commands?.getAll?.()).catch(() => []);
  const shortcut = (name) => commands?.find((c) => c.name === name)?.shortcut || '';
  const fileAccess = await fileAccessAllowed();

  document.getElementById('steps').replaceChildren(...[
    step('highlighter', t('guideStepHighlightTitle'), t('guideStepHighlightText'), keysRow(shortcut('highlight'))),
    step('noteEdit', t('guideStepNoteTitle'), t('guideStepNoteText'), keysRow(shortcut('highlight-note'))),
    step(
      'keyboard',
      t('guideStepKeysTitle'),
      t('guideStepKeysText'),
      h('p', { class: 'guide-keys' }, ['1–9', '/', 'N'].map((key) => keysNode([key], { className: 'kbd' }))),
    ),
    step('panel', t('guideStepPanelTitle'), t('guideStepPanelText'), keysRow(shortcut('toggle-panel'))),
    step('tag', t('guideStepCategoriesTitle'), t('guideStepCategoriesText')),
    step('note', t('guideStepAllTitle'), t('guideStepAllText')),
    fileAccess === false && step('folder', t('guideStepFilesTitle'), t(fileAccessKeys.text), h('p', { class: 'guide-keys' }, fileAccessButton())),
    step('shield', t('privacyTitle'), t('privacyText')),
  ].filter(Boolean));
}

async function init() {
  applyI18n();
  hydrateIcons();
  installTooltips();
  applyCategories(await store.getSettings());
  await renderSteps();
  startDemo();

  document.getElementById('open-dashboard').addEventListener('click', () => {
    location.href = api.runtime.getURL('dashboard.html');
  });
  document.getElementById('change-shortcuts').addEventListener('click', openShortcutSettings);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && renderSteps());
}

init();
