/* global document -- used inside page.evaluate(), which runs in the browser */
// Final brand export (run after generate.py, from the repository root):
//   node branding/tools/render.mjs
// 1. fits lockup SVGs to their content, 2. renders PNG exports + favicon.ico into branding/export/,
// 3. copies the web icons into apps/web/public/, 4. renders the brand sheet preview.
// Needs Playwright's Chromium; on hosts without its libraries use the Playwright container
// (see branding/README.md).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const exportDir = path.join(root, 'export');
const publicDir = path.resolve(root, '../apps/web/public');
mkdirSync(exportDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

// 1. Fit lockups: text width depends on the font, so measure the rendered content.
const PAD = 8;
for (const name of readdirSync(path.join(root, 'logo')).filter((file) =>
  file.startsWith('lockup'),
)) {
  const file = path.join(root, 'logo', name);
  const source = readFileSync(file, 'utf8');
  if (!source.includes('data-fit="true"')) continue;
  await page.setContent(`<html><body style="margin:0">${source}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.evaluate(() => {
    const { x, y, width, height } = document.querySelector('svg .lockup').getBBox();
    return { x, y, width, height };
  });
  const [x, y] = [Math.floor(box.x - PAD), Math.floor(box.y - PAD)];
  const [width, height] = [Math.ceil(box.width + 2 * PAD), Math.ceil(box.height + 2 * PAD)];
  writeFileSync(
    file,
    source.replace(
      /<svg ([^>]*?)width="[^"]*" height="[^"]*" viewBox="[^"]*" data-fit="true"/,
      `<svg $1width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"`,
    ),
  );
}

/** Renders an SVG file to a PNG of exactly `width` x `height` pixels. */
async function png(svgPath, outPath, width, height = width) {
  await page.setViewportSize({ width, height });
  const source = readFileSync(svgPath, 'utf8').replace(
    /<svg ([^>]*?)width="[^"]*" height="[^"]*"/,
    `<svg $1width="${width}" height="${height}"`,
  );
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  const buffer = await page.screenshot({
    clip: { x: 0, y: 0, width, height },
    omitBackground: true,
  });
  writeFileSync(outPath, buffer);
  return buffer;
}

/** favicon.ico with embedded PNG images (supported by all current browsers). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

// 2. Exports.
const icons = path.join(root, 'icons');
const banners = path.join(root, 'banners');
const out = (name) => path.join(exportDir, name);

const favicons = [];
for (const size of [16, 32, 48]) {
  favicons.push({
    size,
    data: await png(path.join(icons, 'favicon.svg'), out(`favicon-${size}.png`), size),
  });
}
writeFileSync(out('favicon.ico'), ico(favicons));
await png(path.join(icons, 'app-icon-maskable.svg'), out('apple-touch-icon.png'), 180);
await png(path.join(icons, 'app-icon-dark.svg'), out('icon-192.png'), 192);
await png(path.join(icons, 'app-icon-dark.svg'), out('icon-512.png'), 512);
await png(path.join(icons, 'app-icon-maskable.svg'), out('icon-maskable-512.png'), 512);
await png(path.join(icons, 'app-icon-light.svg'), out('icon-light-512.png'), 512);
for (const theme of ['light', 'dark']) {
  await png(path.join(banners, `social-${theme}.svg`), out(`social-${theme}.png`), 1280, 640);
  await png(path.join(banners, `readme-${theme}.svg`), out(`readme-${theme}.png`), 1600, 400);
}

// 3. Web app icons.
copyFileSync(path.join(icons, 'favicon.svg'), path.join(publicDir, 'favicon.svg'));
for (const name of [
  'favicon.ico',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
]) {
  copyFileSync(out(name), path.join(publicDir, name));
}

// 4. Brand sheet preview.
await page.setViewportSize({ width: 1360, height: 900 });
await page.goto(pathToFileURL(path.join(root, 'preview.html')).href);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out('brand-sheet.png'), fullPage: true });

await browser.close();
console.log(`Exported brand assets to branding/export/ and web icons to apps/web/public/`);
