import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { watch as watchFs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const E2E = args.has('--e2e');
const TARGETS = E2E ? ['chrome'] : ['chrome', 'firefox'];
const outName = (target) => (E2E ? `${target}-e2e` : target);

const ENTRIES = {
  background: 'background/index.js',
  content: 'content/index.js',
  popup: 'pages/popup.js',
  dashboard: 'pages/dashboard.js',
};

function manifestFor(target) {
  const manifest = {
    manifest_version: 3,
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: pkg.version,
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
    action: {
      default_popup: 'popup.html',
      default_title: '__MSG_extName__',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' },
    },
    content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_idle' }],
  };

  if (target === 'chrome') {
    manifest.background = { service_worker: 'background.js' };
  } else {
    manifest.background = { scripts: ['background.js'] };
    manifest.browser_specific_settings = {
      gecko: {
        id: '{9086e877-a103-44dc-b269-7f9cbdf60f1d}',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] },
      },
    };
  }
  return manifest;
}

const FONTS = [
  { pkg: 'dm-sans', weights: [400, 500, 600, 700] },
  { pkg: 'fraunces', weights: [600] },
];

async function buildFonts(out) {
  const fontsDir = join(out, 'fonts');
  await mkdir(fontsDir, { recursive: true });
  let css = '/* Generated from @fontsource packages (SIL Open Font License 1.1). */\n';
  for (const font of FONTS) {
    const base = join(root, 'node_modules/@fontsource', font.pkg);
    for (const weight of font.weights) {
      const source = await readFile(join(base, `${weight}.css`), 'utf8');
      for (const block of source.split(/(?=\/\* )/)) {
        const subset = block.match(/\/\* [\w-]+?-(latin(?:-ext)?)-\d+-normal \*\//)?.[1];
        if (!subset) continue;
        const file = `${font.pkg}-${subset}-${weight}-normal.woff2`;
        await cp(join(base, 'files', file), join(fontsDir, file));
        css += block
          .replace(/src: [^;]+;/, `src: url(./${file}) format('woff2');`)
          .trim()
          .concat('\n');
      }
    }
    await cp(join(base, 'LICENSE'), join(fontsDir, `LICENSE-${font.pkg}.txt`));
  }
  await writeFile(join(fontsDir, 'fonts.css'), css);
}

async function copyStatic(out) {
  await cp(join(src, '_locales'), join(out, '_locales'), { recursive: true });
  await mkdir(join(out, 'icons'), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await cp(join(src, `icons/icon-${size}.png`), join(out, `icons/icon-${size}.png`));
  }
  await cp(join(src, 'icons/icon.svg'), join(out, 'icons/icon.svg'));
  await cp(join(src, 'icons/logo.svg'), join(out, 'icons/logo.svg'));
  for (const page of ['popup.html', 'dashboard.html']) await cp(join(src, 'pages', page), join(out, page));
  await mkdir(join(out, 'styles'), { recursive: true });
  await cp(join(src, 'shared/tokens.css'), join(out, 'styles/tokens.css'));
  for (const sheet of ['app.css', 'popup.css', 'dashboard.css']) {
    await cp(join(src, 'pages/styles', sheet), join(out, 'styles', sheet));
  }
}

async function writeManifest(target, out) {
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifestFor(target), null, 2) + '\n');
}

function esbuildOptions(target, out) {
  return {
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([name, file]) => [name, join(src, file)])),
    outdir: out,
    bundle: true,
    format: 'iife',
    target: target === 'chrome' ? ['chrome114'] : ['firefox128'],
    loader: { '.css': 'text' },
    define: { __E2E__: String(E2E) },
    minify: false,
    legalComments: 'inline',
    logLevel: 'warning',
  };
}

async function buildTarget(target) {
  const out = join(root, 'dist', outName(target));
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await Promise.all([esbuild.build(esbuildOptions(target, out)), copyStatic(out), buildFonts(out), writeManifest(target, out)]);
  console.log(`built dist/${outName(target)}`);
  return out;
}

async function packageAll() {
  const artifacts = join(root, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  for (const target of TARGETS) {
    const zip = join(artifacts, `annotator-${target}-${pkg.version}.zip`);
    await rm(zip, { force: true });
    execFileSync('zip', ['-qr', zip, '.'], { cwd: join(root, 'dist', target) });
    console.log(`packaged artifacts/annotator-${target}-${pkg.version}.zip`);
  }
  const sourceZip = join(artifacts, `annotator-source-${pkg.version}.zip`);
  await rm(sourceZip, { force: true });
  const files = execFileSync('git', ['ls-files'], { cwd: root }).toString().trim().split('\n');
  execFileSync('zip', ['-q', sourceZip, ...files], { cwd: root });
  console.log(`packaged artifacts/annotator-source-${pkg.version}.zip`);
}

if (args.has('--watch')) {
  const contexts = [];
  for (const target of TARGETS) {
    const out = await buildTarget(target);
    const ctx = await esbuild.context(esbuildOptions(target, out));
    await ctx.watch();
    contexts.push(ctx);
  }
  let timer = null;
  watchFs(src, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      for (const target of TARGETS) {
        const out = join(root, 'dist', outName(target));
        await copyStatic(out);
        await writeManifest(target, out);
      }
      console.log('static files updated');
    }, 150);
  });
  console.log('watching src/ …');
} else {
  for (const target of TARGETS) await buildTarget(target);
  if (args.has('--package')) await packageAll();
}
