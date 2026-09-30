const WHITESPACE = /[\s​]+/g;
const SPACE_CHAR = /[\s​]/;

export function collapseWhitespace(text) {
  return text.replace(WHITESPACE, ' ');
}

export function normalizeWithMap(raw) {
  let text = '';
  const map = [];
  let inSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (SPACE_CHAR.test(ch)) {
      if (inSpace) continue;
      inSpace = true;
      text += ' ';
    } else {
      inSpace = false;
      text += ch;
    }
    map.push(i);
  }
  return { text, map };
}

function commonSuffixLength(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

const MAX_CANDIDATES = 2000;

export function findQuote(text, quote, position) {
  const exact = collapseWhitespace(quote.exact || '').trim();
  if (!exact) return null;

  const prefix = collapseWhitespace(quote.prefix || '');
  const suffix = collapseWhitespace(quote.suffix || '');

  let best = null;
  let bestScore = -Infinity;
  let from = 0;
  for (let count = 0; count < MAX_CANDIDATES; count++) {
    const start = text.indexOf(exact, from);
    if (start === -1) break;
    const end = start + exact.length;

    let score =
      commonSuffixLength(prefix.trimEnd(), text.slice(Math.max(0, start - prefix.length), start).trimEnd()) +
      commonPrefixLength(suffix.trimStart(), text.slice(end, end + suffix.length).trimStart());
    if (position && Number.isFinite(position.start)) {
      score -= Math.abs(start - position.start) / (text.length + 1);
    }

    if (score > bestScore) {
      bestScore = score;
      best = { start, end };
    }
    from = start + 1;
  }
  return best;
}

export function describeQuote(text, start, end, contextLength) {
  while (start < end && text[start] === ' ') start++;
  while (end > start && text[end - 1] === ' ') end--;
  return {
    quote: {
      exact: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - contextLength), start),
      suffix: text.slice(end, end + contextLength),
    },
    position: { start, end },
  };
}
