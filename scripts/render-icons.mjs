import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const { execSync } = await import('node:child_process');
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(join(globalRoot, 'playwright')));
}

const SIZES = [16, 32, 48, 128];
const svg = await readFile(join(root, 'src/icons/icon.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`,
  );
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await writeFile(join(root, `src/icons/icon-${size}.png`), png);
  console.log(`icon-${size}.png`);
}
await browser.close();
