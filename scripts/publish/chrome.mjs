import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseArgs, poll, request, requireEnv, requireFile, run } from './lib.mjs';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://chromewebstore.googleapis.com';

const base64url = (value) => Buffer.from(value).toString('base64url');

async function accessToken(env) {
  if (env.CWS_SERVICE_ACCOUNT_JSON) {
    const key = JSON.parse(env.CWS_SERVICE_ACCOUNT_JSON);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
      base64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })),
    ].join('.');
    const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    });
    return (await request(TOKEN_URL, { method: 'POST', body })).json.access_token;
  }
  const body = new URLSearchParams({
    client_id: env.CWS_CLIENT_ID,
    client_secret: env.CWS_CLIENT_SECRET,
    refresh_token: env.CWS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  return (await request(TOKEN_URL, { method: 'POST', body })).json.access_token;
}

await run(async () => {
  const { dryRun, positional } = parseArgs(process.argv.slice(2));
  const zip = requireFile(positional[0], 'Chrome package');
  const env = requireEnv(['CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'], { dryRun });
  const auth = process.env.CWS_SERVICE_ACCOUNT_JSON
    ? { CWS_SERVICE_ACCOUNT_JSON: process.env.CWS_SERVICE_ACCOUNT_JSON }
    : requireEnv(['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN'], { dryRun });
  Object.assign(env, auth);

  const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
  if (dryRun) {
    console.log(`[dry-run] would upload ${zip} to ${API}/upload/v2/${item}:upload and then publish ${item}`);
    return;
  }

  const headers = { Authorization: `Bearer ${await accessToken(env)}` };

  console.log(`Uploading ${zip} …`);
  const upload = await request(`${API}/upload/v2/${item}:upload`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: await readFile(zip),
  });
  console.log(`Upload state: ${upload.json?.uploadState} (version ${upload.json?.crxVersion ?? 'n/a'})`);

  if (String(upload.json?.uploadState).includes('IN_PROGRESS')) {
    await poll('Chrome upload', async () => {
      const status = (await request(`${API}/v2/${item}:fetchStatus`, { headers })).json;
      const state = String(status.lastAsyncUploadState);
      if (state.includes('IN_PROGRESS')) return undefined;
      if (state !== 'SUCCEEDED') throw new Error(`Chrome upload ended as ${state}: ${JSON.stringify(status)}`);
      return status;
    });
  } else if (upload.json?.uploadState !== 'SUCCEEDED') {
    throw new Error(`Chrome upload ended as ${upload.json?.uploadState}: ${upload.text}`);
  }

  console.log('Submitting for review …');
  const publish = await request(`${API}/v2/${item}:publish`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  });
  const state = publish.json?.state;
  console.log(`Chrome Web Store state: ${state}`);
  if (publish.json?.warningInfo) console.warn(JSON.stringify(publish.json.warningInfo));
  if (state === 'REJECTED' || state === 'CANCELLED') throw new Error(`Chrome Web Store: ${publish.text}`);
});
