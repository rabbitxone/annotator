#!/usr/bin/env node
// Writes the highlights and notes from an Annotator JSON backup into the HTML files they belong
// to, the same way Export → HTML files does in the extension: handy in Firefox, in scripts and
// before a commit. Only local files are touched; everything else in them stays as it was.
//
//   node scripts/burn.mjs backup.json                  files at the paths the notes were made under
//   node scripts/burn.mjs backup.json --root ~/papers  files below a folder, wherever it lives on this computer
//
//   --dry-run   say what would change, write nothing
//   --style     background (default) or underline
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { burnPages } from '../src/shared/burn-files.js';
import { resolveCategories } from '../src/shared/categories.js';
import { BackupError, parseBackup } from '../src/shared/exchange.js';
import { isFileUrl } from '../src/shared/url.js';

const USAGE = 'Usage: node scripts/burn.mjs <backup.json> [--root <folder>] [--dry-run] [--style background|underline]';

function parseArguments(argv) {
  const options = { backup: null, root: null, dryRun: false, style: 'background' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--root') options.root = argv[++i];
    else if (arg === '--style') options.style = argv[++i];
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
    else if (!options.backup) options.backup = arg;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (options.help) return options;
  if (!options.backup) throw new Error('Missing the backup file');
  if (!['background', 'underline'].includes(options.style)) throw new Error('--style is background or underline');
  if (options.root === undefined) throw new Error('--root needs a folder');
  return options;
}

const isFile = async (path) => (await stat(path).catch(() => null))?.isFile() ?? false;

function folderFor({ root, dryRun }) {
  const folder = {
    name: root ? basename(resolve(root)) : '',
    find: async (segments) => {
      const path = join(resolve(root), ...segments);
      return (await isFile(path)) ? path : null;
    },
    read: (path) => readFile(path),
    write: dryRun ? undefined : (path, bytes) => writeFile(path, bytes),
  };
  // Without a folder, a page's file is where its address says
  if (!root) {
    folder.locate = async (page) => {
      const path = fileURLToPath(page.url);
      return (await isFile(path)) ? { entry: path, segments: [basename(path)] } : null;
    };
  }
  return folder;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const { pages, categories } = parseBackup(await readFile(options.backup, 'utf8'));
  const files = pages.filter((page) => isFileUrl(page.url));
  if (files.length === 0) {
    console.log('The backup has no notes on local files, so there is nothing to write.');
    return 0;
  }

  const result = await burnPages(folderFor(options), files, { categories: resolveCategories(categories), style: options.style });
  const verb = options.dryRun ? 'would update' : 'updated';
  for (const path of result.updated) console.log(`${verb}  ${path}`);
  for (const path of result.notFound) console.warn(`not found  ${path}`);
  for (const { path } of result.skipped) console.warn(`skipped (not UTF-8)  ${path}`);
  for (const path of result.failed) console.error(`failed  ${path}`);
  if (result.unplaced) console.warn(`${result.unplaced} note(s) could not be marked in the text; they are still saved in the files.`);
  console.log(`${result.updated.length} file(s) ${verb}, ${result.unchanged} already up to date.`);
  return result.failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof BackupError ? 'That is not an Annotator backup (JSON export).' : err.message);
    if (!(err instanceof BackupError)) console.error(USAGE);
    process.exit(2);
  },
);
