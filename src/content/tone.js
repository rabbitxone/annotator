const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const DARK_CANVAS = { r: 18, g: 18, b: 18, a: 1 };

const RGB = /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/;

let canvasContext;

function parseWithCanvas(text) {
  if (typeof document === 'undefined') return null;
  try {
    canvasContext ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', {
      willReadFrequently: true,
    });
    canvasContext.clearRect(0, 0, 1, 1);
    canvasContext.fillStyle = '#123456';
    canvasContext.fillStyle = text;
    if (canvasContext.fillStyle === '#123456') return null;
    canvasContext.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = canvasContext.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

export function parseColor(input) {
  if (!input) return null;
  const text = String(input).trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const m = RGB.exec(text);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Math.min(1, Math.max(0, alpha)) };
  }
  return parseWithCanvas(text);
}

export function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function blend(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

const DARK_BELOW = 0.179;

export function resolveTone({ layers, hasImage = false, textColor = null, canvas = WHITE }) {
  if (hasImage) return textColor && luminance(textColor) > 0.5 ? 'dark' : 'light';
  let colour = canvas;
  for (let i = layers.length - 1; i >= 0; i--) colour = blend(layers[i], colour);
  return luminance(colour) < DARK_BELOW ? 'dark' : 'light';
}

export function canvasColor() {
  const scheme = getComputedStyle(document.documentElement).colorScheme || '';
  const wantsDark = /\bdark\b/.test(scheme);
  const wantsLight = /\blight\b/.test(scheme);
  const dark = wantsDark && (!wantsLight || matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? DARK_CANVAS : WHITE;
}

export function toneFor(el, cache = new Map(), canvas = canvasColor()) {
  const start = el.parentElement ?? el;
  if (cache.has(start)) return cache.get(start);

  const layers = [];
  let hasImage = false;
  for (let node = start; node && node.nodeType === 1; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backgroundImage && style.backgroundImage !== 'none') hasImage = true;
    const colour = parseColor(style.backgroundColor);
    if (colour && colour.a > 0) {
      layers.push(colour);
      if (colour.a >= 0.98) break;
    }
  }
  const tone = resolveTone({ layers, hasImage, textColor: parseColor(getComputedStyle(start).color), canvas });
  cache.set(start, tone);
  return tone;
}
