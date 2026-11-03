import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const file = join(root, 'CITATION.cff');
const today = new Date().toISOString().slice(0, 10);

const updated = (await readFile(file, 'utf8'))
  .replace(/^version:.*$/m, `version: ${pkg.version}`)
  .replace(/^date-released:.*$/m, `date-released: ${today}`);
await writeFile(file, updated);
console.log(`CITATION.cff -> version ${pkg.version}, date-released ${today}`);
