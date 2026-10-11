import { api } from '../shared/api.js';
import { t } from '../shared/i18n.js';
import { rolloutOnInstall } from '../shared/rollout.js';
import { ensureMigrated, updateSettings } from '../shared/store.js';
import { listSnapshots, saveSnapshot, snapshotPageUrl } from '../shared/snapshots.js';
import { normalizeUrl } from '../shared/url.js';

const MENU_ID = 'annotator-create';

async function createMenus() {
  await api.contextMenus.removeAll();
  api.contextMenus.create({ id: MENU_ID, title: t('menuCreate'), contexts: ['selection'] });
}

const disabledTabs = new Set();

function syncMenuFor(tabId) {
  api.contextMenus.update(MENU_ID, { visible: !disabledTabs.has(tabId) }).catch(() => { });
}

api.tabs.onActivated.addListener(({ tabId }) => syncMenuFor(tabId));
api.tabs.onRemoved.addListener((tabId) => disabledTabs.delete(tabId));
api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'loading') return;
  disabledTabs.delete(tabId);
  syncMenuFor(tabId);
});

async function injectIntoOpenTabs() {
  const tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(
    tabs.map((tab) => api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })),
  );
}

async function applyRollout(details) {
  const { settings } = await api.storage.local.get('settings');
  const plan = rolloutOnInstall({ ...details, storedSettings: settings });
  if (!plan) return;
  if (plan.settings) await updateSettings(plan.settings);
  await api.storage.local.set({ whatsNew: plan.whatsNew });
}

api.runtime.onInstalled.addListener(async (details) => {
  createMenus();
  ensureMigrated().catch((err) => console.error('Annotator: migration failed', err));
  // Settings for existing users must be in place before content scripts read them.
  await applyRollout(details).catch((err) => console.error('Annotator: rollout failed', err));
  injectIntoOpenTabs().catch(() => { });
});
api.runtime.onStartup.addListener(createMenus);

async function sendToTab(tabId, message) {
  try {
    return await api.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch {
    await api.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return api.tabs.sendMessage(tabId, message, { frameId: 0 });
  }
}

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id || !info.selectionText?.trim()) return;
  sendToTab(tab.id, { type: 'create-from-selection' }).catch(() => {
    // Restricted page
  });
});

const COMMAND_MESSAGES = {
  highlight: { type: 'create-from-selection', withNote: false, fromCommand: true },
  'highlight-note': { type: 'create-from-selection', withNote: true, fromCommand: true },
  'toggle-panel': { type: 'toggle-panel' },
};

api.commands?.onCommand.addListener(async (command, tab) => {
  const message = COMMAND_MESSAGES[command];
  if (!message) return;
  const target = tab ?? (await api.tabs.query({ active: true, currentWindow: true }))[0];
  if (target?.id == null) return;
  sendToTab(target.id, message).catch(() => {
    // Restricted page
  });
});

async function openAndGo(url, id) {
  const tab = await api.tabs.create({ url });
  const deadline = Date.now() + 20000;

  const onUpdated = async (tabId, change) => {
    if (tabId !== tab.id || change.status !== 'complete') return;
    api.tabs.onUpdated.removeListener(onUpdated);
    while (Date.now() < deadline) {
      try {
        await sendToTab(tab.id, { type: 'go-to', id });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };
  api.tabs.onUpdated.addListener(onUpdated);
  setTimeout(() => api.tabs.onUpdated.removeListener(onUpdated), 20000);
}

const MAX_SNAPSHOT_HTML = 8 * 1024 * 1024;

function snapshotSummary(list) {
  const strip = (s) => s && { id: s.id, capturedAt: s.capturedAt, hash: s.hash };
  return { count: list.length, first: strip(list[0]), latest: strip(list.at(-1)) };
}

function storeSnapshot(snapshot, sender) {
  const url = normalizeUrl(snapshot?.url ?? '');
  if (!url || url !== normalizeUrl(sender.tab?.url ?? '') || typeof snapshot.html !== 'string' || snapshot.html.length > MAX_SNAPSHOT_HTML) {
    return Promise.reject(new Error('invalid snapshot'));
  }
  return saveSnapshot({
    id: String(snapshot.id),
    url,
    title: String(snapshot.title ?? ''),
    capturedAt: Date.now(),
    hash: String(snapshot.hash ?? ''),
    size: snapshot.html.length,
    auto: !!snapshot.auto,
    html: snapshot.html,
  });
}

function setBadge(tabId, count) {
  const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
  api.action.setBadgeText({ tabId, text }).catch(() => { });
  if (count > 0) api.action.setBadgeBackgroundColor({ tabId, color: '#01AD35' }).catch(() => { });
  api.action.setBadgeTextColor?.({ tabId, color: '#FFFFFF' })?.catch?.(() => { });
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case 'count':
      if (sender.tab?.id != null) setBadge(sender.tab.id, message.count);
      return false;
    case 'enabled':
      if (sender.tab?.id != null) {
        if (message.enabled) disabledTabs.delete(sender.tab.id);
        else disabledTabs.add(sender.tab.id);
        if (sender.tab.active) syncMenuFor(sender.tab.id);
      }
      return false;
    case 'save-snapshot':
      storeSnapshot(message.snapshot, sender).then(
        (list) => sendResponse(snapshotSummary(list)),
        () => sendResponse(null),
      );
      return true;
    case 'load-reader':
      if (sender.tab?.id == null) return false;
      api.scripting
        .executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, files: ['reader.js'] })
        .then(
          () => sendResponse(true),
          () => sendResponse(false),
        );
      return true;
    case 'snapshot-meta':
      listSnapshots(message.url).then(
        (list) => sendResponse(snapshotSummary(list)),
        () => sendResponse(null),
      );
      return true;
    case 'open-snapshot':
      api.tabs.create({ url: snapshotPageUrl(message) });
      return false;
    case 'tab-command':
      sendToTab(message.tabId, message.message).then(
        (response) => sendResponse(response ?? true),
        () => sendResponse(false),
      );
      return true;
    case 'open-and-go':
      openAndGo(message.url, message.id).then(
        () => sendResponse(true),
        () => sendResponse(false),
      );
      return true;
    default:
      return false;
  }
});
