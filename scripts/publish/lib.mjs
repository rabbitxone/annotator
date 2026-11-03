import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

export function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    positional: argv.filter((arg) => !arg.startsWith('--')),
  };
}

export function requireFile(path, label) {
  if (!path || !existsSync(path)) fail(`${label} not found: ${path ?? '(no path given)'}`);
  return path;
}

export function requireEnv(names, { dryRun }) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length && !dryRun) fail(`Missing environment variables: ${missing.join(', ')}`);
  return Object.fromEntries(names.map((name) => [name, process.env[name] ?? '']));
}

export function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

export async function request(url, init = {}, { expect = [200, 202] } = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!expect.includes(response.status)) {
    throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status} ${response.statusText}\n${text}`);
  }
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { status: response.status, headers: response.headers, text, json };
}

export async function poll(label, check, { intervalMs = 5000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() > deadline) throw new Error(`${label}: timed out after ${Math.round(timeoutMs / 1000)} s`);
    await sleep(intervalMs);
  }
}

export async function run(main) {
  try {
    await main();
  } catch (error) {
    console.error(`::error::${String(error.message ?? error).split('\n')[0]}`);
    console.error(error.message ?? error);
    process.exit(1);
  }
}
