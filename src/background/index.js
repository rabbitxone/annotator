import { api } from '../shared/api.js';
import { t } from '../shared/i18n.js';
import { ensureMigrated } from '../shared/store.js';

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

api.runtime.onInstalled.addListener(() => {
  createMenus();
  injectIntoOpenTabs().catch(() => { });
  ensureMigrated().catch((err) => console.error('Annotator: migration failed', err));
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
