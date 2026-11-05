export function injectStyle(root, css) {
  try {
    if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function') {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const before = root.adoptedStyleSheets.length;
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      if (root.adoptedStyleSheets.length > before) return { update: (next) => sheet.replaceSync(next), alive: () => true };
    }
  } catch { }
  const el = document.createElement('style');
  el.textContent = css;
  (root.head ?? root.documentElement ?? root).append(el);
  return { update: (next) => (el.textContent = next), alive: () => el.isConnected };
}
