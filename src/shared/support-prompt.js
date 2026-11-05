import { api } from './api.js';

const KEY = 'supportPrompt';
export const RATE_AFTER_OPENS = 5;

export function pickPrompt({ opens = 0, rated = false } = {}) {
  return !rated && opens >= RATE_AFTER_OPENS && opens % 2 === 1 ? 'rate' : 'support';
}

let loading = null;
let current = 'support';

export function loadSupportPrompt() {
  loading ??= (async () => {
    const stored = (await api.storage.local.get(KEY))[KEY] ?? {};
    const state = { rated: stored.rated === true, opens: (Number.isInteger(stored.opens) ? stored.opens : 0) + 1 };
    await api.storage.local.set({ [KEY]: state });
    current = pickPrompt(state);
  })().catch(() => { });
  return loading;
}

export const supportPrompt = () => current;

export async function markRated() {
  const stored = (await api.storage.local.get(KEY).catch(() => ({})))[KEY] ?? {};
  await api.storage.local.set({ [KEY]: { ...stored, rated: true } }).catch(() => { });
}
