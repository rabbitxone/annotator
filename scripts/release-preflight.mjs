import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const citation = await readFile(join(root, 'CITATION.cff'), 'utf8');
const citationVersion = citation.match(/^version:\s*"?([^"\s]+)"?\s*$/m)?.[1];

const problems = [];
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) problems.push(`Tag "${tag}" is not vX.Y.Z`);
if (tag !== `v${pkg.version}`) problems.push(`Tag ${tag} does not match package.json version ${pkg.version}`);
if (lock.version !== pkg.version) problems.push(`package-lock.json version ${lock.version} != package.json ${pkg.version}`);
if (citationVersion !== pkg.version) problems.push(`CITATION.cff version ${citationVersion} != package.json ${pkg.version}`);

if (problems.length) {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
}
console.log(`Version ${pkg.version} is consistent (tag, package.json, package-lock.json, CITATION.cff).`);
