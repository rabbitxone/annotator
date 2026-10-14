import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createBackup } from '../../src/shared/exchange.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/burn.mjs', import.meta.url));
const HTML = '<html><body><p>The quick brown fox.</p></body></html>';
const annotation = { id: 'a1', color: 'yellow', note: 'fast', quote: { exact: 'brown fox', prefix: 'quick ', suffix: '.' }, createdAt: 1, updatedAt: 1 };

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'annotator-cli-'));
  await mkdir(join(dir, 'papers', 'set1'), { recursive: true });
  const file = join(dir, 'papers', 'set1', 'a.html');
  await writeFile(file, HTML);
  const url = pathToFileURL(file).href;
  const backup = join(dir, 'backup.json');
  await writeFile(backup, JSON.stringify(createBackup([{ url, title: 'A', updatedAt: 1, annotations: [annotation] }])));
  return { dir, file, backup };
}

test('writes the notes into the file at the path they were made under', async () => {
  const { file, backup } = await setup();
  const { stdout } = await run('node', [script, backup]);
  assert.match(stdout, /1 file\(s\) updated/);
  assert.ok((await readFile(file, 'utf8')).includes('<mark data-annotator-id="a1"'));
  assert.match((await run('node', [script, backup])).stdout, /0 file\(s\) updated, 1 already up to date/);
});

test('--dry-run changes nothing', async () => {
  const { file, backup } = await setup();
  const { stdout } = await run('node', [script, backup, '--dry-run']);
  assert.match(stdout, /would update/);
  assert.equal(await readFile(file, 'utf8'), HTML);
});

test('--root finds the files below a folder that lives somewhere else', async () => {
  const { dir, backup } = await setup();
  // The same project, cloned to another place on the computer
  await mkdir(join(dir, 'clone', 'papers', 'set1'), { recursive: true });
  const copy = join(dir, 'clone', 'papers', 'set1', 'a.html');
  await writeFile(copy, HTML);
  const { stdout } = await run('node', [script, backup, '--root', join(dir, 'clone', 'papers')]);
  assert.match(stdout, /1 file\(s\) updated/);
  assert.ok((await readFile(copy, 'utf8')).includes('<mark'));
});

test('says what is wrong instead of a stack trace', async () => {
  const { dir } = await setup();
  const bad = join(dir, 'not-a-backup.json');
  await writeFile(bad, '{"hello":1}');
  await assert.rejects(run('node', [script, bad]), (err) => err.code === 2 && /not an Annotator backup/.test(err.stderr));
  await assert.rejects(run('node', [script]), (err) => err.code === 2 && /Missing the backup file/.test(err.stderr));
});
