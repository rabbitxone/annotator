import { readFile } from 'node:fs/promises';
import { parseArgs, poll, request, requireEnv, requireFile, run } from './lib.mjs';

const API = 'https://api.addons.microsoftedge.microsoft.com/v1';

const operationId = (headers) => (headers.get('location') ?? '').split('/').filter(Boolean).pop();

await run(async () => {
  const { dryRun, positional } = parseArgs(process.argv.slice(2));
  const zip = requireFile(positional[0], 'Edge package');
  const env = requireEnv(['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'], { dryRun });
  const notes = process.env.EDGE_NOTES ?? '';
  const product = `${API}/products/${env.EDGE_PRODUCT_ID}`;

  if (dryRun) {
    console.log(`[dry-run] would upload ${zip} to ${product}/submissions/draft/package and then publish the submission`);
    return;
  }

  const headers = { Authorization: `ApiKey ${env.EDGE_API_KEY}`, 'X-ClientID': env.EDGE_CLIENT_ID };

  console.log(`Uploading ${zip} …`);
  const upload = await request(`${product}/submissions/draft/package`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: await readFile(zip),
  });
  const uploadOperation = operationId(upload.headers);
  if (!uploadOperation) throw new Error(`Edge upload: no operation ID in the Location header\n${upload.text}`);

  await poll('Edge upload', async () => {
    const { json } = await request(`${product}/submissions/draft/package/operations/${uploadOperation}`, { headers });
    if (json?.status === 'InProgress') return undefined;
    if (json?.status !== 'Succeeded') throw new Error(`Edge upload failed: ${JSON.stringify(json)}`);
    console.log(json.message);
    return json;
  });

  console.log('Submitting for certification …');
  let publish;
  try {
    publish = await request(`${product}/submissions`, {
      method: 'POST',
      headers: notes ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: notes ? JSON.stringify({ notes }) : undefined,
    });
  } catch (error) {
    if (!notes || !/ 40[0-9] /.test(error.message)) throw error;
    console.warn('JSON notes were rejected, retrying with plain text');
    publish = await request(`${product}/submissions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: notes,
    });
  }
  const publishOperation = operationId(publish.headers);
  if (!publishOperation) throw new Error(`Edge publish: no operation ID in the Location header\n${publish.text}`);

  await poll('Edge publish', async () => {
    const { json } = await request(`${product}/submissions/operations/${publishOperation}`, { headers });
    if (json?.status === 'InProgress') return undefined;
    if (json?.status === 'Succeeded') {
      console.log(json.message);
      return json;
    }
    if (json?.errorCode === 'InProgressSubmission') {
      throw new Error(
        'Edge: the previous submission is still in review. Re-run this job after certification finishes ' +
          '(the package was uploaded to the draft, so nothing is lost).',
      );
    }
    throw new Error(`Edge publish failed: ${JSON.stringify(json)}`);
  });
});
