// Page snapshots live in the extension's IndexedDB rather than storage.local: they are much
// larger than notes and storage.local is read in full whenever the note lists load.
// Metadata and HTML bodies are kept in separate stores so lists never load the bodies.

import { api } from './api.js';

const DB_NAME = 'annotator';
const DB_VERSION = 1;
const META = 'snapshots';
const BODIES = 'snapshotBodies';
const CHANNEL = 'annotator-snapshots';

export const MAX_VERSIONS = 5;

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(META, { keyPath: 'id' }).createIndex('url', 'url');
      database.createObjectStore(BODIES, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

const result = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

const byDate = (a, b) => a.capturedAt - b.capturedAt;

export async function listSnapshots(url) {
  const tx = (await db()).transaction(META);
  return (await result(tx.objectStore(META).index('url').getAll(url))).sort(byDate);
}

export async function allSnapshotMeta() {
  const tx = (await db()).transaction(META);
  return (await result(tx.objectStore(META).getAll())).sort(byDate);
}

export async function getSnapshot(id) {
  const tx = (await db()).transaction([META, BODIES]);
  const [meta, body] = await Promise.all([result(tx.objectStore(META).get(id)), result(tx.objectStore(BODIES).get(id))]);
  return meta && body ? { ...meta, html: body.html } : null;
}

/** The first snapshot is the original and is always kept; the oldest of the rest go first. */
export function versionsToDrop(metas, max = MAX_VERSIONS) {
  const sorted = [...metas].sort(byDate);
  const drop = [];
  while (sorted.length > max) drop.push(sorted.splice(1, 1)[0].id);
  return drop;
}

async function write(snapshots, removeIds = []) {
  const tx = (await db()).transaction([META, BODIES], 'readwrite');
  const meta = tx.objectStore(META);
  const bodies = tx.objectStore(BODIES);
  for (const { html, ...rest } of snapshots) {
    meta.put(rest);
    bodies.put({ id: rest.id, html });
  }
  for (const id of removeIds) {
    meta.delete(id);
    bodies.delete(id);
  }
  await finished(tx);
}

export async function saveSnapshot(snapshot) {
  await write([snapshot]);
  const drop = versionsToDrop(await listSnapshots(snapshot.url));
  if (drop.length) await write([], drop);
  notify();
  return listSnapshots(snapshot.url);
}

export async function importSnapshots(snapshots) {
  const known = new Set((await allSnapshotMeta()).map((s) => s.id));
  const fresh = snapshots.filter((s) => !known.has(s.id));
  if (fresh.length === 0) return 0;
  await write(fresh);
  for (const url of new Set(fresh.map((s) => s.url))) {
    const drop = versionsToDrop(await listSnapshots(url));
    if (drop.length) await write([], drop);
  }
  notify();
  return fresh.length;
}

/** Keeps snapshots with their pages when notes are moved to new addresses ([{ from, to }]). */
export async function relocateSnapshots(moves) {
  const target = new Map(moves.map(({ from, to }) => [from, to]));
  const tx = (await db()).transaction(META, 'readwrite');
  const store = tx.objectStore(META);
  const all = await result(store.getAll());
  const touched = new Set();
  for (const meta of all) {
    const to = target.get(meta.url);
    if (!to) continue;
    store.put({ ...meta, url: to });
    touched.add(to);
  }
  await finished(tx);
  for (const url of touched) {
    const drop = versionsToDrop(await listSnapshots(url));
    if (drop.length) await write([], drop);
  }
  if (touched.size) notify();
}

export async function deleteSnapshots(ids) {
  if (ids.length === 0) return;
  await write([], ids);
  notify();
}

export async function exportSnapshots() {
  const metas = await allSnapshotMeta();
  const tx = (await db()).transaction(BODIES);
  const store = tx.objectStore(BODIES);
  const bodies = await Promise.all(metas.map((m) => result(store.get(m.id))));
  return metas.map((meta, i) => ({ ...meta, html: bodies[i]?.html ?? '' }));
}

function notify() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('changed');
    channel.close();
  } catch {
    // BroadcastChannel unavailable
  }
}

export function snapshotPageUrl({ url, id, annotationId }) {
  const params = new URLSearchParams({ url });
  if (id) params.set('id', id);
  if (annotationId) params.set('a', annotationId);
  return api.runtime.getURL(`snapshot.html#${params}`);
}

export function onSnapshotsChange(listener) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = () => listener();
  return () => channel.close();
}
