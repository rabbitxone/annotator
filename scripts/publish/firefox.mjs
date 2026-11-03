import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, requireEnv, requireFile, run } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

await run(async () => {
  const { dryRun, positional } = parseArgs(process.argv.slice(2));
  const zip = resolve(requireFile(positional[0], 'Firefox package'));
  const sourceZip = resolve(requireFile(positional[1], 'Source package'));
  const env = requireEnv(['AMO_JWT_ISSUER', 'AMO_JWT_SECRET'], { dryRun });
  const node = (await readFile(join(root, '.nvmrc'), 'utf8')).trim();

  const work = await mkdtemp(join(tmpdir(), 'annotator-amo-'));
  try {
    const extension = join(work, 'extension');
    execFileSync('unzip', ['-q', zip, '-d', extension]);

    const metadata = join(work, 'amo-metadata.json');
    await writeFile(
      metadata,
      JSON.stringify({
        version: {
          approval_notes: [
            'Build instructions (the attached source archive is the full repository at this version):',
            `1. Node.js ${node} (see .nvmrc) and npm.`,
            '2. npm ci',
            '3. npm run build',
            '4. The submitted extension is the content of dist/firefox (esbuild bundles of src/, no minification).',
          ].join('\n'),
        },
      }),
    );

    const args = [
      'sign',
      '--channel=listed',
      `--source-dir=${extension}`,
      `--artifacts-dir=${join(work, 'artifacts')}`,
      `--amo-metadata=${metadata}`,
      `--upload-source-code=${sourceZip}`,
      '--approval-timeout=0',
    ];
    const webExt = join(root, 'node_modules', '.bin', 'web-ext');
    if (dryRun) {
      console.log(`[dry-run] would run: web-ext ${args.join(' ')}`);
      return;
    }
    execFileSync(webExt, args, {
      stdio: 'inherit',
      env: { ...process.env, WEB_EXT_API_KEY: env.AMO_JWT_ISSUER, WEB_EXT_API_SECRET: env.AMO_JWT_SECRET },
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
