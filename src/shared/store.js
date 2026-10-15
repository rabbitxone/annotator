import { api } from './api.js';
import { DEFAULT_SETTINGS, PAGE_KEY_PREFIX, SCHEMA_VERSION } from './constants.js';
import { mergePage } from './exchange.js';
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
    .filter((page) => page && Array.isArray(page.annotations) && !isEmpty(page));
}

const validPage = (page) => (page && Array.isArray(page.annotations) ? page : null);

const isEmpty = (page) => page.annotations.length === 0 && !page.note?.trim();

const locks = new Map();

function mutatePage(url, mutate, { touch = true } = {}) {
  const previous = locks.get(url) ?? Promise.resolve();
  const next = previous.then(async () => {
    const key = pageKey(url);
    const current = (await storage().get(key))[key] ?? { url, title: '', updatedAt: 0, annotations: [] };
    const page = mutate(structuredClone(current));
    if (!page) return current;
    if (isEmpty(page)) {
      await storage().remove(key);
    } else {
      if (touch) page.updatedAt = Date.now();
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

function idsByUrl(items) {
  const byUrl = new Map();
  for (const { url, id } of items) {
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(id);
  }
  return byUrl;
}

export async function deleteMany(items) {
  await Promise.all([...idsByUrl(items)].map(([url, ids]) => deleteAnnotations(url, ids)));
}

export async function updateMany(items, patch) {
  const now = Date.now();
  await Promise.all(
    [...idsByUrl(items)].map(([url, ids]) =>
      mutatePage(url, (page) => {
        const wanted = new Set(ids);
        for (const a of page.annotations) if (wanted.has(a.id)) Object.assign(a, patch, { updatedAt: now });
        return page;
      }),
    ),
  );
}

export function restoreAnnotations(url, title, annotations) {
  return mutatePage(url, (page) => {
    if (!page.title && title) page.title = title;
    const known = new Set(page.annotations.map((a) => a.id));
    page.annotations.push(...annotations.filter((a) => !known.has(a.id)));
    return page;
  });
}

export function reanchorAnnotation(url, id, selector) {
  return mutatePage(url, (page) => {
    const target = page.annotations.find((a) => a.id === id);
    if (!target) return null;
    target.quote = selector.quote;
    target.position = selector.position;
    target.updatedAt = Date.now();
    delete target.lostAt;
    return page;
  });
}

export function setLost(url, ids, lost) {
  const wanted = new Set(ids);
  return mutatePage(
    url,
    (page) => {
      let changed = false;
      for (const a of page.annotations) {
        if (!wanted.has(a.id) || !!a.lostAt === lost) continue;
        if (lost) a.lostAt = Date.now();
        else delete a.lostAt;
        changed = true;
      }
      return changed ? page : null;
    },
    { touch: false },
  );
}

export function setPageNote(url, title, note) {
  return mutatePage(url, (page) => {
    if ((page.note ?? '') === note) return null;
    if (title && !page.title) page.title = title;
    if (note.trim()) {
      page.note = note;
      page.noteUpdatedAt = Date.now();
    } else {
      delete page.note;
      delete page.noteUpdatedAt;
    }
    return page;
  });
}

const WRITE_CHUNK = 2000;

async function setInChunks(writes) {
  const entries = Object.entries(writes);
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    await storage().set(Object.fromEntries(entries.slice(i, i + WRITE_CHUNK)));
  }
}

export async function relocatePages(moves) {
  const all = await storage().get(null);
  const leaving = new Set(moves.map(({ from }) => pageKey(from)));
  const writes = {};
  const removes = new Set();
  let moved = 0;
  let merged = 0;
  for (const { from, to } of moves) {
    const page = all[pageKey(from)];
    if (!page || !Array.isArray(page.annotations)) continue;
    const incoming = { ...page, url: to };
    const existing = writes[pageKey(to)] ?? (leaving.has(pageKey(to)) ? null : validPage(all[pageKey(to)]));
    if (existing) merged++;
    writes[pageKey(to)] = existing ? mergePage(existing, incoming).page : incoming;
    removes.add(pageKey(from));
    moved++;
  }
  for (const key of Object.keys(writes)) removes.delete(key);
  if (moved === 0) return { moved, merged };
  await setInChunks(writes);
  if (removes.size) await storage().remove([...removes]);
  return { moved, merged };
}

export async function recategorize(from, to) {
  const all = await storage().get(null);
  const writes = {};
  const now = Date.now();
  let moved = 0;
  for (const [key, page] of Object.entries(all)) {
    if (!key.startsWith(PAGE_KEY_PREFIX) || !Array.isArray(page?.annotations)) continue;
    let touched = false;
    const annotations = page.annotations.map((a) => {
      if (a.color !== from) return a;
      touched = true;
      moved++;
      return { ...a, color: to, updatedAt: now };
    });
    if (touched) writes[key] = { ...page, annotations };
  }
  if (moved) await setInChunks(writes);
  return moved;
}

export async function importPages(pages) {
  const keys = pages.map((page) => pageKey(page.url));
  const stored = keys.length ? await storage().get(keys) : {};
  const writes = {};
  let added = 0;
  let updated = 0;
  for (const incoming of pages) {
    const key = pageKey(incoming.url);
    const result = mergePage(writes[key] ?? validPage(stored[key]), incoming);
    added += result.added;
    updated += result.updated;
    if (result.changed) writes[key] = result.page;
  }
  await setInChunks(writes);
  return { added, updated };
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
