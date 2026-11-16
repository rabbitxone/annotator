export const TAB_COMMANDS = new Set(['create-from-selection', 'toggle-panel', 'reanchor', 'go-to', 'status']);

const MAX_COUNT = 1_000_000;
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;

export function fromExtensionPage(sender, { extensionId, extensionUrl }) {
  return !!sender && sender.id === extensionId && typeof sender.url === 'string' && sender.url.startsWith(extensionUrl);
}

export function cleanCount(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_COUNT) : 0;
}

export function handleMessage(message, sender, sendResponse, deps) {
  const topFrame = sender?.tab?.id != null && sender.frameId === 0 && sender.id === deps.extensionId;
  switch (message?.type) {
    case 'count':
      if (topFrame) deps.setBadge(sender.tab.id, cleanCount(message.count));
      return false;
    case 'enabled':
      if (topFrame) deps.setEnabled(sender.tab, message.enabled === true);
      return false;
    case 'tab-command': {
      const inner = message.message;
      if (!fromExtensionPage(sender, deps) || !Number.isInteger(message.tabId) || !TAB_COMMANDS.has(inner?.type)) return false;
      deps.sendToTab(message.tabId, inner).then(
        (response) => sendResponse(response ?? true),
        () => sendResponse(false),
      );
      return true;
    }
    case 'save-favicon':
      if (!topFrame || !deps.faviconSupported() || typeof message.url !== 'string') return false;
      deps.saveFavicon({ url: message.url }, sender.tab).catch((err) => console.warn('Annotator: saving the page icon failed', err));
      return false;
    case 'open-and-go':
      if (!fromExtensionPage(sender, deps) || typeof message.url !== 'string' || !isId(message.id)) return false;
      deps.openAndGo(message.url, message.id).then(
        (result) => sendResponse(result),
        () => sendResponse({ ok: false }),
      );
      return true;
    default:
      return false;
  }
}
