#!/usr/bin/env node
/**
 * Regenerate only the Beast King icon family from its native SVG masters.
 * Run: node scripts/generate-brand-icons.mjs
 * Profiles, social artwork, HTML and manifests are deliberately separate.
 */
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  sharp = require(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp'));
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const favicon = await readFile(join(root, 'assets/design-v2/brand/favicon.svg'), 'utf8');
const crest = await readFile(join(root, 'assets/design-v2/brand/crest.svg'), 'utf8');
const body = crest.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/)?.[1]
  .replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/g, '').trim();
if (!body) throw new Error('The crest SVG must contain a self-contained vector mark.');
if (!/viewBox="0 0 32 32"/.test(favicon)) throw new Error('The compact master must keep its 32-unit viewBox.');

function appIcon(maskable = false) {
  const label = maskable ? 'BEAST KING マスク対応アプリアイコン' : 'BEAST KING アプリアイコン';
  // The maskable crest is wholly inside the central 80%-diameter safe circle.
  // Its full-bleed lacquer background stays opaque under any platform mask.
  const transform = maskable ? 'translate(64 52) scale(3)' : 'translate(32 23) scale(3.5)';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="app-icon-title">',
    '  <title id="app-icon-title">' + label + '</title>',
    '  <desc>黒漆とシャンパンゴールド、アイボリーの瞳。王冠と六枚の葉を備えた魔獣の紋章。</desc>',
    '  <metadata>© 2026 Beast King. Native vector artwork. Prestige edition.</metadata>',
    '  <defs><radialGradient id="app-lacquer" gradientUnits="userSpaceOnUse" cx="154" cy="88" r="550">',
    '    <stop stop-color="#252526"/><stop offset=".52" stop-color="#131519"/><stop offset="1" stop-color="#090b0e"/>',
    '  </radialGradient></defs>',
    '  <rect width="512" height="512" fill="url(#app-lacquer)"/>',
    maskable ? '' : '  <rect x="20.75" y="20.75" width="470.5" height="470.5" rx="86" fill="none" stroke="#ceb889" stroke-opacity=".36" stroke-width="1.5"/>',
    '  <g transform="' + transform + '">',
    body,
    '  </g>',
    '</svg>',
    ''
  ].filter(line => line !== '').join('\n') + '\n';
}

async function raster(svg, size, opaque = false) {
  let image = sharp(Buffer.from(svg)).resize(size, size);
  if (opaque) image = image.removeAlpha();
  return image.png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer();
}

function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const directory = Buffer.alloc(frames.length * 16);
  let offset = header.length + directory.length;
  frames.forEach(({size, data}, index) => {
    const at = index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, at);
    directory.writeUInt8(size === 256 ? 0 : size, at + 1);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, directory, ...frames.map(frame => frame.data)]);
}

const report = [];
async function save(relative, data, dimensions) {
  await writeFile(join(root, relative), data);
  report.push({path: relative, bytes: Buffer.byteLength(data), ...(dimensions ? {dimensions} : {})});
}

const app = appIcon();
const maskable = appIcon(true);
await save('assets/icon.svg', favicon, [128, 128]);
await save('assets/favicon.svg', favicon, [128, 128]);
await save('assets/design-v2/brand/app-icon.svg', app, [512, 512]);
await save('assets/design-v2/brand/app-icon-maskable.svg', maskable, [512, 512]);

const faviconFrames = [];
for (const size of [16, 32, 48, 64, 96, 128, 256]) {
  const data = await raster(favicon, size);
  if ([16, 32, 48, 96].includes(size)) await save('assets/favicon-' + size + '.png', data, [size, size]);
  if (size !== 96) faviconFrames.push({size, data});
}
await save('assets/favicon.ico', ico(faviconFrames));
for (const [path, size] of [['assets/apple-touch-icon.png', 180], ['assets/icon-192.png', 192], ['assets/icon-512.png', 512]]) {
  await save(path, await raster(app, size, true), [size, size]);
}
for (const size of [192, 512]) {
  await save('assets/icon-maskable-' + size + '.png', await raster(maskable, size, true), [size, size]);
}
console.log(JSON.stringify({generated: report, icoFrames: faviconFrames.map(frame => frame.size)}, null, 2));
