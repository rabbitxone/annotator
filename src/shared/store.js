import { api } from './api.js';
import { DEFAULT_SETTINGS, PAGE_KEY_PREFIX, SCHEMA_VERSION } from './constants.js';
import { migrateLegacy } from './migrate.js';

const storage = () => api.storage.local;

export const pageKey = (url) => PAGE_KEY_PREFIX + url;

let migration = null;
export function ensureMigrated() {
  migration ??= (async () => {
    const { schemaVersion, annotations } = await storage().get(['schemaVersion', 'annotations']);
    if (schemaVersion >= SCHEMA_VERSION) return;

    if (annotations && typeof annotations === 'object') {
      const all = await storage().get(null);
      const existing = {};
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(PAGE_KEY_PREFIX)) existing[value.url] = value;
      }
      const pages = migrateLegacy(annotations, existing);
      const writes = { schemaVersion: SCHEMA_VERSION, legacyBackup: annotations };
      for (const page of Object.values(pages)) writes[pageKey(page.url)] = page;
      await storage().set(writes);
      await storage().remove('annotations');
    } else {
      await storage().set({ schemaVersion: SCHEMA_VERSION });
    }
  })().catch((err) => {
    migration = null;
    throw err;
  });
  return migration;
}

export async function getPage(url) {
  const key = pageKey(url);
  const result = await storage().get(key);
  return result[key] ?? null;
}

export async function listPages() {
  const all = await storage().get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(PAGE_KEY_PREFIX))
    .map(([, page]) => page)
    .filter((page) => page && Array.isArray(page.annotations) && page.annotations.length > 0);
}

const locks = new Map();

function mutatePage(url, mutate) {
  const previous = locks.get(url) ?? Promise.resolve();
  const next = previous.then(async () => {
    const key = pageKey(url);
    const current = (await storage().get(key))[key] ?? { url, title: '', updatedAt: 0, annotations: [] };
    const page = mutate(structuredClone(current)) ?? current;
    if (page.annotations.length === 0) {
      await storage().remove(key);
    } else {
      page.updatedAt = Date.now();
      await storage().set({ [key]: page });
    }
    return page;
  });
  locks.set(
    url,
    next.catch(() => { }),
  );
  return next;
}

export function addAnnotation(url, title, annotation) {
  return mutatePage(url, (page) => {
    if (title) page.title = title;
    page.annotations.push(annotation);
    return page;
  });
}

export function updateAnnotation(url, id, patch) {
  return mutatePage(url, (page) => {
    const target = page.annotations.find((a) => a.id === id);
    if (target) Object.assign(target, patch, { updatedAt: Date.now() });
    return page;
  });
}

export function deleteAnnotations(url, ids) {
  const drop = new Set(ids);
  return mutatePage(url, (page) => {
    page.annotations = page.annotations.filter((a) => !drop.has(a.id));
    return page;
  });
}

export async function deleteMany(items) {
  const byUrl = new Map();
  for (const { url, id } of items) {
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(id);
  }
  await Promise.all([...byUrl].map(([url, ids]) => deleteAnnotations(url, ids)));
}

function withDefaults(stored) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (stored && key in stored) settings[key] = stored[key];
  }
  return settings;
}

export async function getSettings() {
  const { settings } = await storage().get('settings');
  return withDefaults(settings);
}

export async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await storage().set({ settings: next });
  return next;
}

export async function setSiteRule(host, rule) {
  const { siteRules } = await getSettings();
  const next = { ...siteRules };
  if (rule === 'always' || rule === 'never') next[host] = rule;
  else delete next[host];
  return updateSettings({ siteRules: next });
}

export function onStoreChange(listener) {
  const handler = (changes, area) => {
    if (area !== 'local') return;
    const pages = new Map();
    let settings = null;
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith(PAGE_KEY_PREFIX)) {
        pages.set(key.slice(PAGE_KEY_PREFIX.length), change.newValue ?? null);
      } else if (key === 'settings') {
        settings = withDefaults(change.newValue);
      }
    }
    if (pages.size > 0 || settings) listener({ pages, settings });
  };
  api.storage.onChanged.addListener(handler);
  return () => api.storage.onChanged.removeListener(handler);
}
