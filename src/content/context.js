const WIDGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'video',
  'audio',
  'canvas',
  'svg',
  'nav',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="menuitem"]',
  '[role="toolbar"]',
  '[role="tablist"]',
  '[role="tab"]',
  '[role="grid"]',
  '[role="slider"]',
  '[role="navigation"]',
].join(',');

const MIN_SELECTED_CHARS = 3;

function elementOf(node) {
  return node?.nodeType === 1 ? node : (node?.parentElement ?? null);
}

export function isSelectionAnnotatable(range) {
  if (range.toString().replace(/\s/g, '').length < MIN_SELECTED_CHARS) return false;
  for (const node of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
    if (elementOf(node)?.closest(WIDGET_SELECTOR)) return false;
  }
  return true;
}

export const APP_THRESHOLD = 3;

export function scoreAppLikeness(signals) {
  const { hasAppRole, bigCanvas, bigVideo, bigEditable, controls, textChars, isFeed, innerScroller, composer, shell } =
    signals;
  let score = 0;
  if (hasAppRole) score += 3; // the page says so itself
  if (bigCanvas) score += 3; // maps, design tools, canvas-rendered documents, games
  if (isFeed) score += 3; // role=feed / role=log, or a stream of role=article items
  if (innerScroller) score += 3; // the page frame is fixed, content scrolls inside it (chat, mail)
  if (bigVideo) score += 2; // video players
  if (bigEditable) score += 2; // editors
  if (composer) score += 2; // a message/post box in view
  if (shell) score += 2; // fixed top bar + fixed side panel — an app frame, not a sticky header
  const per1kChars = controls / Math.max(1, textChars / 1000);
  if (controls >= 50 && per1kChars > 8) score += 2; // mostly buttons, little prose
  if (controls >= 200) score += 1;
  return score;
}

export const isAppLike = (signals) => scoreAppLikeness(signals) >= APP_THRESHOLD;

const CONTROL_SELECTOR =
  'button, [role="button"], input:not([type="hidden"]), select, [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]';
const EDITABLE_SELECTOR = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const MAX_PROBED = 24;

const COMPOSER_SELECTOR = 'textarea, [role="textbox"], ' + EDITABLE_SELECTOR;
const MAX_STYLED = 600;

function probeLayout(vw, vh) {
  const docScrolls = document.documentElement.scrollHeight > vh * 1.15;
  let innerScroller = false;
  let bar = false;
  let side = false;
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_ELEMENT);
  for (let i = 0, el = walker.nextNode(); el && i < MAX_STYLED; i++, el = walker.nextNode()) {
    const tag = el.localName;
    if (tag === 'script' || tag === 'style' || tag === 'annotator-ui') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const pos = cs.position;
    const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    if (!innerScroller && !docScrolls && scrollsY && el.scrollHeight > el.clientHeight * 1.2) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height >= vw * vh * 0.4) innerScroller = true;
    }
    if (!bar && (pos === 'fixed' || pos === 'sticky')) {
      const r = el.getBoundingClientRect();
      if (r.width >= vw * 0.6 && r.height > 0 && r.height <= vh * 0.25) bar = true;
      else if (r.height >= vh * 0.6 && r.width > 0 && r.width <= vw * 0.4) side = true;
    } else if (!side && (pos === 'fixed' || pos === 'sticky')) {
      const r = el.getBoundingClientRect();
      if (r.height >= vh * 0.6 && r.width > 0 && r.width <= vw * 0.4) side = true;
    }
  }
  return { innerScroller, shell: bar && side };
}

function hasComposerInView(vw, vh) {
  return Array.from(document.querySelectorAll(COMPOSER_SELECTOR))
    .slice(0, MAX_PROBED)
    .some((el) => {
      const r = el.getBoundingClientRect();
      return r.width >= 240 && r.height >= 24 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    });
}

export function collectSignals() {
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const isBig = (el) => {
    const { width, height } = el.getBoundingClientRect();
    return width * height >= viewportArea * 0.25;
  };
  const anyBig = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, MAX_PROBED).some(isBig);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const layout = probeLayout(vw, vh);

  return {
    ...layout,
    isFeed: !!document.querySelector('[role="feed"], [role="log"]') || document.querySelectorAll('[role="article"]').length >= 3,
    composer: hasComposerInView(vw, vh),
    hasAppRole: !!document.querySelector('[role="application"]'),
    bigCanvas: anyBig('canvas'),
    bigVideo: anyBig('video'),
    bigEditable: document.designMode === 'on' || anyBig(EDITABLE_SELECTOR),
    controls: document.querySelectorAll(CONTROL_SELECTOR).length,
    textChars: (document.body?.innerText ?? '').length,
  };
}
