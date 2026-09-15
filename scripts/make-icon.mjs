import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// make-icon.mjs - regenerate build/icon.png, build/icon.ico and build/tray.png
//
// Run:  npm run make-icon      (or: node scripts/make-icon.mjs)
//
// The mark is a fused "MW" monogram: the right stem of the M IS the left stem of
// the W, so both letters come out of one continuous stroke. M for the owner's
// name, W for Workstation. Rendered locally with Chromium - no image API, no
// network, no cost.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
// 侧边栏用的品牌图标也在这里生成，保证界面图标与安装包图标永远同源
const RENDERER_ASSETS = path.join(ROOT, 'src', 'renderer', 'src', 'assets');

// ---- locked geometry ------------------------------------------------------
// Glyph space: x 0..200, y 0..100 (y grows downward). One polyline, pen never lifts.
const PTS = [[0, 100], [0, 0], [50, 66], [100, 0], [100, 100], [150, 34], [200, 100], [200, 0]];
const ASPECT = 1.55;    // glyph width / cap height
const GLYPH_H = 0.56;   // cap height / tile side

// Optical tweaks per output size: small icons get a heavier stroke and a slightly
// larger tile, otherwise the mark dissolves in the 16px tray / 24px taskbar.
function tune(size) {
  if (size <= 16) return { t: 34, tileRatio: 0.94, radius: 0.16 };
  if (size <= 24) return { t: 31, tileRatio: 0.92, radius: 0.17 };
  if (size <= 32) return { t: 29, tileRatio: 0.90, radius: 0.18 };
  if (size <= 48) return { t: 28, tileRatio: 0.89, radius: 0.19 };
  if (size <= 64) return { t: 27, tileRatio: 0.88, radius: 0.20 };
  return { t: 26, tileRatio: 0.88, radius: 0.20 };
}

// Transparent canvas: the rounded tile is the only opaque shape, so Windows shows
// no white plate behind the icon.
function svg(size, trayBold = false) {
  const { t, tileRatio, radius } = trayBold ? { t: 34, tileRatio: 0.94, radius: 0.16 } : tune(size);
  const tile = Math.round(size * tileRatio);
  const m = Math.round((size - tile) / 2);
  const r = Math.round(tile * radius);
  const gh = Math.round(tile * GLYPH_H);
  const gw = Math.round(gh * ASPECT);
  const gx = Math.round(m + (tile - gw) / 2);
  const gy = Math.round(m + (tile - gh) / 2);
  const sw = (t / 100) * gh;
  const pts = PTS
    .map(([x, y]) => (gx + (x / 200) * gw).toFixed(2) + ',' + (gy + (y / 100) * gh).toFixed(2))
    .join(' ');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
    + '<defs><clipPath id="cap"><rect x="' + gx + '" y="' + gy + '" width="' + gw + '" height="' + gh + '"/></clipPath></defs>'
    + '<rect x="' + m + '" y="' + m + '" width="' + tile + '" height="' + tile + '" rx="' + r + '" fill="#000000"/>'
    + '<g clip-path="url(#cap)"><polyline points="' + pts + '" fill="none" stroke="#FFFFFF" stroke-width="' + sw.toFixed(3)
    + '" stroke-linejoin="miter" stroke-miterlimit="24" stroke-linecap="butt"/></g></svg>';
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(ICO_SIZES.length, 4);
  const entries = [];
  let offset = 6 + ICO_SIZES.length * 16;
  for (const size of ICO_SIZES) {
    const data = pngs[size];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 2);
    entry.writeUInt16LE(32, 4);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...ICO_SIZES.map((s) => pngs[s])]);
}

const sizes = [...ICO_SIZES, 128, 1024];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
await page.goto('about:blank');

async function render(markup, size) {
  const dataUrl = await page.evaluate(async ({ markup, size }) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  }, { markup, size });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const pngs = {};
for (const size of sizes) pngs[size] = await render(svg(size), size);
const tray = await render(svg(32, true), 32);
await browser.close();

fs.mkdirSync(BUILD, { recursive: true });
fs.writeFileSync(path.join(BUILD, 'icon.png'), pngs[1024]);
fs.writeFileSync(path.join(BUILD, 'icon.ico'), buildIco(pngs));
fs.writeFileSync(path.join(BUILD, 'tray.png'), tray);
fs.mkdirSync(RENDERER_ASSETS, { recursive: true });
fs.writeFileSync(path.join(RENDERER_ASSETS, 'app-icon.png'), pngs[128]);

console.log('build/icon.png  ' + pngs[1024].length + ' bytes (1024, transparent)');
console.log('build/icon.ico  ' + fs.statSync(path.join(BUILD, 'icon.ico')).size + ' bytes (' + ICO_SIZES.join('/') + ')');
console.log('build/tray.png  ' + tray.length + ' bytes (32, transparent)');
console.log('src/renderer/src/assets/app-icon.png  ' + pngs[128].length + ' bytes (128, for the sidebar)');
