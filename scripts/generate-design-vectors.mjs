/** Original BEAST KING vector system. © 2026 Beast King.
 * Regenerate with: node scripts/generate-design-vectors.mjs
 * For branding only (preserving later card templates/UI icons), add --brand-only.
 * No external images, fonts, packages or network requests are used.
 */
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootLayout = await access(join(root, 'catalog.js')).then(() => true, () => false);
const webRoot = rootLayout ? root : join(root, 'dist');
const output = join(webRoot, 'assets/design-v2');
const copyright = '© 2026 Beast King';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const palette = Object.freeze({ midnight: '#101329', indigo: '#222448', violet: '#493264', amethyst: '#9f87c9', silver: '#e8e3f1', gold: '#e0c98f', muted: '#aaa0bd' });
const iconBody = (paths, stroke = 1.65) => `<g fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;

const uiIcons = {
  music: ['BGM', '<path d="M9 17V5l10-2v12M9 8l10-2"/><path d="M9 17c0 2-1.7 3.5-3.5 3.5S3 19.6 3 18.5 4.5 16 6.5 16H9Zm10-2c0 2-1.7 3.5-3.5 3.5S13 17.6 13 16.5s1.5-2.5 3.5-2.5H19Z"/>'],
  musicMute: ['BGMオフ', '<path d="M9 17V10m0-5 10-2v8M12 7.4 19 6M9 17c0 2-1.7 3.5-3.5 3.5S3 19.6 3 18.5 4.5 16 6.5 16H9Zm10-2c0 2-1.7 3.5-3.5 3.5S13 17.6 13 16.5s1.5-2.5 3.5-2.5H19ZM3 3l18 18"/>'],
  treasure: ['秘宝', '<path d="m7.5 3.5 9 0 5 6-9.5 12-9.5-12Z"/><path d="M2.5 9.5h19M7.5 3.5l1 6L12 21.5l3.5-12 1-6M8.5 9.5l3.5-6 3.5 6"/>'],
  globe: ['オンライン', '<circle cx="12" cy="12" r="9"/><path d="M3.4 9h17.2M3.4 15h17.2M12 3c-4.7 4.7-4.7 13.3 0 18M12 3c4.7 4.7 4.7 13.3 0 18"/>'],
  crown: ['王冠', '<path d="m3 6 5 3 4-6 4 6 5-3-2 12H5Z"/><path d="M5.7 14h12.6M7 21h10"/><path d="m12 9.5 1.7 2-1.7 2-1.7-2Z" fill="currentColor" stroke="none"/>'],
  home: ['ホーム', '<path d="m2.5 10 9.5-7.5 9.5 7.5M5 8.5V21h14V8.5"/><path d="M9 21v-6a3 3 0 0 1 6 0v6M9 8h6"/>'],
  sword: ['攻撃・対戦', '<path d="m17 2.5 4.5 0 0 4.5-11 11-4.5-4.5Z"/><path d="M18 6 8.2 15.8M4 12l8 8M6 18l-3 3M3 18l3 3"/>'],
  cards: ['カード・デッキ', '<path d="M10 2.5h9l2 2V20l-2 1.5H10L8 20V4.5Z"/><path d="M5 5H3v14l2 2M11.5 7h6M11.5 16h6"/><path d="m14.5 9 2.5 2.5-2.5 2.5-2.5-2.5Z"/>'],
  book: ['遊び方', '<path d="M12 5C9 2.8 5.5 2.8 2.5 4V20c3-1.2 6.5-1.2 9.5 1 3-2.2 6.5-2.2 9.5-1V4c-3-1.2-6.5-1.2-9.5 1Z"/><path d="M12 5v16M5.5 8c1.3-.2 2.3 0 3.5.6M15 8.6c1.2-.6 2.2-.8 3.5-.6M5.5 12c1.3-.2 2.3 0 3.5.6"/>'],
  beast: ['魔獣', '<path d="m4 3 4.5 4 3.5-1 3.5 1L20 3l-1 13-7 5.5L5 16Z"/><path d="m6.5 10.5 4 1.5-2 1.5-2-3Zm11 0-4 1.5 2 1.5 2-3ZM10 16l2-1 2 1-2 2Z" fill="currentColor" stroke="none"/>'],
  spark: ['ミラクル', '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/><path d="m4 4 2 2m12-2-2 2m2 12 2 2M6 18l-2 2" stroke-width="1.2"/>'],
  fusion: ['合成', '<path d="M3 5h4l5 5 5-5h4M3 19h4l5-5 5 5h4"/><path d="m12 7 5 5-5 5-5-5Z"/><path d="m12 10 2 2-2 2-2-2Z" fill="currentColor" stroke="none"/><path d="M3 3v4m18-4v4M3 17v4m18-4v4"/>'],
  trap: ['ギミック', '<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m7 8 5 8 5-8M6 16l6-8 6 8M12 5v2m0 10v2"/>'],
  sound: ['効果音オン', '<path d="M3 9h4l5-5v16l-5-5H3Z"/><path d="M16 8c2.5 2.2 2.5 5.8 0 8M19 5c4.2 3.9 4.2 10.1 0 14"/>'],
  mute: ['効果音オフ', '<path d="M3 9h4l5-5v16l-5-5H3Z"/><path d="m17 9 5 6m0-6-5 6"/>'],
  settings: ['設定', '<path d="m9 2.5 6 0 1 3 3 1 2.5 5.5L19 17.5l-3 1-1 3H9l-1-3-3-1L2.5 12 5 6.5l3-1Z"/><path d="m12 8 4 4-4 4-4-4Z"/>'],
  search: ['検索', '<circle cx="10" cy="10" r="6.5"/><path d="M6.5 9a3.7 3.7 0 0 1 2.5-2.5M15 15l6 6"/>'],
  close: ['閉じる', '<path d="m5 5 14 14M19 5 5 19"/>'],
  shield: ['守備・結界', '<path d="M12 2 21 6l-1.5 8C18.8 17.5 15 20 12 22c-3-2-6.8-4.5-7.5-8L3 6Z"/><path d="m12 6 4 2-1 6-3 3-3-3-1-6Z"/>'],
  heart: ['ハートポイント', '<path d="M12 21C8 18 2.5 13.8 2.5 8.5a5 5 0 0 1 9.5-2 5 5 0 0 1 9.5 2C21.5 13.8 16 18 12 21Z"/><path d="M6.5 7.5a2 2 0 0 1 2 0"/>'],
  energy: ['エーテル', '<path d="M13.5 2 4 13h6.5L9 22l11-13h-7Z"/><path d="m13.5 2-1 7" stroke-width="1.1"/>'],
  layers: ['デッキ枚数', '<path d="m12 2.5 10 5.5-10 5.5L2 8ZM3 13l9 5 9-5M3 17l9 5 9-5"/>'],
  check: ['確認・完了', '<path d="m4 12 5 5L20 5" stroke-width="2"/>'],
  trophy: ['勝利・ランク', '<path d="M7 3h10v6.5c0 3-2 5.5-5 5.5s-5-2.5-5-5.5ZM7 5H3v3c0 2.5 1.5 4 4.5 4M17 5h4v3c0 2.5-1.5 4-4.5 4M12 15v5M7 22h10M9 20h6"/><path d="m12 6 1.5 2-1.5 2-1.5-2Z" fill="currentColor" stroke="none"/>'],
  download: ['保存・ダウンロード', '<path d="M12 3v12m-4-4 4 4 4-4M3 16v4l2 2h14l2-2v-4"/>'],
  upload: ['読み込み・アップロード', '<path d="M12 16V3m-4 4 4-4 4 4M3 16v4l2 2h14l2-2v-4"/>'],
  eye: ['見る・確認', '<path d="M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7S4.5 16.5 2 12Z"/><circle cx="12" cy="12" r="3.5"/><path d="M12 10.5v3" stroke-width="1.8"/>'],
  pause: ['一時停止', '<rect x="5" y="3" width="4.5" height="18" rx="1"/><rect x="14.5" y="3" width="4.5" height="18" rx="1"/>'],
  clock: ['時間', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2M12 3v1m9 8h-1M3 12h1m8 9v-1"/>'],
  info: ['情報', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M10.5 11H12M10.5 17h3"/><circle cx="12" cy="7.5" r=".9" fill="currentColor" stroke="none"/>'],
  back: ['戻る', '<path d="m9 5-7 7 7 7M2 12h14a5 5 0 0 1 5 5"/>'],
};

const origins = [
  { id: 'mountain', name: '山', color: '#cbb49a', paths: '<path d="m2 20 7-15 4 8 3-6 6 13Z"/><path d="m6 11 3 2 2-3M13 13l3 3 2-3M3 20h18"/>' },
  { id: 'river', name: '川', color: '#82c9ee', paths: '<path d="M4 2c8 4-3 8 4 12s-1 7-1 8M10 2c8 4-3 8 4 12s-1 7-1 8M16 2c8 4-3 8 4 12s-1 7-1 8"/>' },
  { id: 'seed', name: '種', color: '#dfc581', paths: '<path d="M17 3C7 2 3 7 4 13c.7 4.3 5 6.2 9 4.5C17.5 15.5 20 9 17 3Z"/><path d="M14 6c-1 6-4 9-7 11M8 17v4m0-2 4 2"/>' },
  { id: 'grass', name: '草', color: '#92cba1', paths: '<path d="M12 21C12 12 10 7 5 3c1 7 3 12 7 18Zm0 0C12 12 15 8 21 5c-1 8-4 12-9 16ZM8 21C7 16 5 13 2 11M12 14c0-5 1-8 3-11M4 22h16"/>' },
  { id: 'flower', name: '花', color: '#e7a8cc', paths: Array.from({ length: 6 }, (_, index) => `<path d="M12 8.3C8 5.5 9.2 2 12 2s4 3.5 0 6.3Z" transform="rotate(${index * 60} 12 12)"/>`).join('') + '<circle cx="12" cy="12" r="2.2"/>' },
  { id: 'tree', name: '木', color: '#b3c58a', paths: '<path d="M8 15H5a3 3 0 0 1-1-5.8A4 4 0 0 1 8 4a4.5 4.5 0 0 1 8 0 4 4 0 0 1 4 5.2A3 3 0 0 1 19 15h-3M12 8v14m0-9-4-3m4 7 4-5M8 22h8"/>' },
  { id: 'king', name: '王', color: '#edbd65', paths: '<path d="m3 6 4 4 5-7 5 7 4-4-2 13H5Z"/><path d="M6 15h12M8 21h8M4 10 1 8l2 7m17-5 3-2-2 7"/><path d="m12 9 2 3-2 2-2-2Z"/>' },
];

// The editable crest SVG is the brand master. Reuse it when rebuilding the
// vector collection so a broad regeneration cannot restore retired branding.
const crestMaster = await readFile(join(output, 'brand/crest.svg'), 'utf8');
const crest = crestMaster.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  .replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/[ \t]+$/gm, '').trim();

const assets = [];
async function emit(file, { id, displayName, group, width, height, viewBox = `0 0 ${width} ${height}`, usage, body, color = palette.silver, preserveSource = false, ...extra }) {
  const titleId = id.replace(/[^a-z0-9_-]/gi, '-') + '-title';
  const source = preserveSource ? await readFile(join(output, file), 'utf8') : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-labelledby="${titleId}" color="${color}"><title id="${titleId}">${escape(displayName)}</title><desc>${escape(usage)}</desc><metadata>${escape(copyright)}. Original vector artwork for BEAST KING.</metadata>${body}</svg>\n`;
  await mkdir(dirname(join(output, file)), { recursive: true });
  if (!preserveSource) await writeFile(join(output, file), source);
  assets.push({ id, path: `assets/design-v2/${file}`, displayName, group, width, height, viewBox, usage, transparent: true, format: 'svg', copyright, sha256: createHash('sha256').update(source).digest('hex'), ...extra });
}

await emit('brand/crest.svg', { id: 'brand-crest', displayName: '六芽の獣冠', group: 'brand', width: 256, height: 256, viewBox: '0 0 128 128', usage: '王冠・獣の瞳・6つの芽を組み合わせたブランド紋章。24px以上のヘッダー、プロフィール、カード裏に使用。', body: crest, minimumSize: 24, preserveSource: true });
await emit('brand/wordmark.svg', { id: 'brand-wordmark', displayName: 'BEAST KING ワードマーク', group: 'brand', width: 880, height: 160, usage: '透明背景の横長ロゴ。文字はGeorgia、Times New Roman、serifの順にフォールバック。', body: `<g transform="translate(4 8) scale(1.1)">${crest}</g><text x="171" y="88" fill="#f0e9db" font-family="Georgia, 'Times New Roman', serif" font-size="66" font-weight="500" letter-spacing="7">BEAST KING</text><path d="M174 118h210m167 0h231" fill="none" stroke="#ceb889" stroke-opacity=".6"/><g fill="#ceb889">${Array.from({ length: 6 }, (_, i) => `<path d="m${410 + i * 21} 112 4 6-4 6-4-6Z"/>`).join('')}</g>`, textFallback: "Georgia, 'Times New Roman', serif" });

if (process.argv.includes('--brand-only')) {
  const manifestFile = join(output, 'vector-manifest.json');
  const previous = JSON.parse(await readFile(manifestFile, 'utf8'));
  const updates = new Map(assets.map(asset => [asset.id, asset]));
  previous.assets = previous.assets.map(asset => updates.get(asset.id) || asset);
  await writeFile(manifestFile, JSON.stringify(previous, null, 2) + '\n');
  console.log(JSON.stringify({output, vectors: assets.length, scope: 'brand-only'}, null, 2));
  process.exit(0);
}

const brandIcons = {};
for (const [name, [displayName, paths]] of Object.entries(uiIcons)) {
  const body = iconBody(paths);
  brandIcons[name] = body;
  await emit(`icons/${name}.svg`, { id: `ui-icon-${name}`, displayName, group: 'ui-icon', width: 24, height: 24, usage: '24×24の共通UIアイコン。currentColorで色を変更できる。', body, inlineKey: name });
}
for (const origin of origins) {
  const body = iconBody(origin.paths, 1.55);
  brandIcons[`origin-${origin.id}`] = body;
  await emit(`icons/origin-${origin.id}.svg`, { id: `origin-${origin.id}`, displayName: `${origin.name}のオリジン`, group: 'origin', width: 24, height: 24, usage: 'オリジンの識別、カード分類、プロフィール。山・川・種・草・花・木・王の表示順。', body, color: origin.color, origin: origin.id, accent: origin.color });
}

const outerCard = 'M23 3H337L357 23V497L337 517H23L3 497V23Z';
const innerCard = 'M29 15H331L345 29V491L331 505H29L15 491V29Z';
const categoryDefinitions = [
  { id: 'beast', name: '通常魔獣', accent: '#b3c6dc', secondary: '#5e6392', icon: 'beast' },
  { id: 'fusion', name: '合成魔獣', accent: '#d4b7f0', secondary: '#8a64b8', icon: 'fusion' },
  { id: 'miracle', name: 'ミラクル', accent: '#b6c2f4', secondary: '#706cc0', icon: 'spark' },
  { id: 'gimmick', name: 'ギミック', accent: '#e1c68f', secondary: '#8f739b', icon: 'trap' },
];
// Each corner carries six small buds, one for each of the six origins.
// They stay on the narrow outer rail, outside the illustration and type areas.
function sixBudCorner(accent) {
  return `<path d="M7.5 58V27.5l20-20H58" fill="none" stroke="${accent}" stroke-opacity=".7" stroke-width=".7"/>
  <g fill="${accent}" fill-opacity=".26" stroke="${accent}" stroke-opacity=".83" stroke-width=".65" stroke-linejoin="round">
    <path d="M29 7.5c1.5-3 4-3.5 6-1-1.5 3-4 3.5-6 1Zm10 0c1.5-3 4-3.5 6-1-1.5 3-4 3.5-6 1Zm10 0c1.5-3 4-3.5 6-1-1.5 3-4 3.5-6 1Z"/>
    <path d="M7.5 29c-3 1.5-3.5 4-1 6 3-1.5 3.5-4 1-6Zm0 10c-3 1.5-3.5 4-1 6 3-1.5 3.5-4 1-6Zm0 10c-3 1.5-3.5 4-1 6 3-1.5 3.5-4 1-6Z"/>
  </g><path d="m16.3 16.3 3.1-.8-.8 3.1-3.1.8Z" fill="${accent}" fill-opacity=".6"/>`;
}
function cardFrame(category) {
  const p = `frame-${category.id}`;
  const sideMarks = category.id === 'fusion'
    ? '<path d="m8 132 11 12-11 12 11 12-11 12m344-48-11 12 11 12-11 12 11 12M8 267l11 12-11 12 11 12-11 12m344-48-11 12 11 12-11 12 11 12"/>'
    : category.id === 'miracle'
      ? '<path d="M10 126v37m340-37v37M10 261v37m340-37v37"/><path d="m10 176 4 8-4 8-4-8Zm340 0 4 8-4 8-4-8ZM10 311l4 8-4 8-4-8Zm340 0 4 8-4 8-4-8Z"/>'
      : category.id === 'gimmick'
        ? '<path d="M8 131h9v39H8m344-39h-9v39h9M8 270h9v39H8m344-39h-9v39h9"/><path d="M8 140h4m-4 21h4m336-21h4m-4 21h4M8 279h4m-4 21h4m336-21h4m-4 21h4"/>'
        : '<path d="m8 137 8 10-8 10m344-20-8 10 8 10M8 282l8 10-8 10m344-20-8 10 8 10"/>';
  const junction = category.id === 'fusion'
    ? '<path d="m173 346 7 5v8l-7 5-7-5v-8Zm14 0 7 5v8l-7 5-7-5v-8Z"/>'
    : category.id === 'miracle'
      ? '<path d="m180 345 2.7 7.3 7.3 2.7-7.3 2.7-2.7 7.3-2.7-7.3-7.3-2.7 7.3-2.7Z"/>'
      : category.id === 'gimmick'
        ? '<path d="M172 347h16v16h-16Zm4 4h8v8h-8M168 351h4m16 8h4m-16-12v-4m8 20v4"/>'
        : '<path d="m168 350 6 9 6-7 6 7 6-9m-18 9 6 6 6-6"/>';
  const budCorner = sixBudCorner(category.accent);
  return `<defs><linearGradient id="${p}-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${category.accent}"/><stop offset=".36" stop-color="#70657e"/><stop offset=".7" stop-color="#d5cce0"/><stop offset="1" stop-color="${category.secondary}"/></linearGradient><linearGradient id="${p}-panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#20213a" stop-opacity=".95"/><stop offset=".2" stop-color="#171a31" stop-opacity=".99"/><stop offset="1" stop-color="#13172b"/></linearGradient></defs>
  <path d="${outerCard} ${innerCard}" fill="#17182e" fill-rule="evenodd"/>
  <path d="${outerCard}" fill="none" stroke="url(#${p}-metal)" stroke-width="1.65"/>
  <path d="${innerCard}" fill="none" stroke="${category.accent}" stroke-opacity=".46" stroke-width=".8"/>
  <path d="M32 18h296l14 14v30H18V32Z" fill="#15192e" fill-opacity=".93" stroke="${category.accent}" stroke-opacity=".35"/>
  <path d="M18 390h324v101l-14 14H32l-14-14Z" fill="url(#${p}-panel)"/>
  <path d="M24 396h134m44 0h134M31 477h298" fill="none" stroke="${category.accent}" stroke-opacity=".32" stroke-width=".7"/>
  <g transform="translate(0 42)" fill="none" stroke="${category.accent}" stroke-width="1" stroke-opacity=".8" stroke-linecap="round" stroke-linejoin="round">${junction}</g>
  <g>${budCorner}</g><g transform="translate(360 0) scale(-1 1)">${budCorner}</g><g transform="translate(0 520) scale(1 -1)">${budCorner}</g><g transform="translate(360 520) scale(-1 -1)">${budCorner}</g>
  <g fill="none" stroke="${category.accent}" stroke-opacity=".8" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round">${sideMarks}</g>
  <path d="m35 17 17 10v20L35 57 18 47V27Z" fill="#25243b" stroke="url(#${p}-metal)" stroke-width="1.25"/>
  <g transform="translate(311 28) scale(.86)" color="${category.accent}">${iconBody(uiIcons[category.icon][1], 1.5)}</g>
  <path d="M103 510h64m26 0h64" fill="none" stroke="${category.accent}" stroke-opacity=".3" stroke-width=".7"/><path d="m180 507 2 3-2 3-2-3Z" fill="${category.accent}" fill-opacity=".7"/>`;
}
for (const category of categoryDefinitions) await emit(`cards/frame-${category.id}.svg`, { id: `card-frame-${category.id}`, displayName: `${category.name}カードフレーム`, group: 'card-frame', width: 360, height: 520, usage: '直立カード用。透明なアート窓、静かな説明欄、細い金属線。四隅には自然の6オリジンを表す6芽の彫金を配置。中央の王冠は王のオリジンを表す。カード画像に重ね、文字は各safeAreaに別途表示する。', body: cardFrame(category), accent: category.accent, motifs: { cornerBudCount: 6, origins: origins.map(origin => origin.id), categoryShape: { beast: '獣の牙', fusion: '連なる六角', miracle: '四方の光', gimmick: '噛み合う機構' }[category.id] }, safeAreas: { art: [24, 66, 312, 312], name: [61, 26, 243, 29], rules: [31, 408, 298, 65], stats: [31, 485, 298, 17], cost: [24, 26, 22, 23] } });

await emit('cards/back.svg', { id: 'card-back', displayName: '六芽の獣冠・カード裏', group: 'card-back', width: 360, height: 520, usage: '相手の非公開手札、山札、カードパックで使う直立の共通カード裏。', body: `<defs><linearGradient id="back-ground" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#212543"/><stop offset=".5" stop-color="#362349"/><stop offset="1" stop-color="#10152b"/></linearGradient><linearGradient id="back-metal" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#f1e0b9"/><stop offset=".45" stop-color="#a997bf"/><stop offset="1" stop-color="#d0ae71"/></linearGradient><pattern id="back-weave" width="36" height="36" patternUnits="userSpaceOnUse"><path d="m18 0 18 18-18 18L0 18Z" fill="none" stroke="#a293c4" stroke-opacity=".09"/><path d="m18 13 4 5-4 5-4-5Z" fill="#b9a9d4" fill-opacity=".06"/></pattern></defs><path d="${outerCard}" fill="url(#back-ground)" stroke="url(#back-metal)" stroke-width="3"/><path d="${innerCard}" fill="url(#back-weave)" stroke="#bcb0d0" stroke-opacity=".45"/><path d="M32 33h296v454H32Z" fill="none" stroke="#a69ac7" stroke-opacity=".17"/><path d="M180 70c79 44 116 102 116 190s-37 146-116 190C101 406 64 348 64 260S101 114 180 70Z" fill="none" stroke="#c9af85" stroke-opacity=".38"/><path d="M180 88c66 40 98 95 98 172s-32 132-98 172C114 392 82 337 82 260s32-132 98-172Z" fill="none" stroke="#ada0ce" stroke-opacity=".22"/><circle cx="180" cy="245" r="107" fill="#171b32" fill-opacity=".7" stroke="#b8a3cf" stroke-opacity=".38"/><circle cx="180" cy="245" r="97" fill="none" stroke="#d1ba8a" stroke-opacity=".22"/><g transform="translate(84 145) scale(1.5)">${crest}</g><text x="180" y="365" text-anchor="middle" fill="#e7d9b6" font-family="Georgia, 'Times New Roman', serif" font-size="21" letter-spacing="4">BEAST KING</text><g fill="url(#back-metal)">${Array.from({ length: 6 }, (_, i) => `<path d="m${125 + i * 22} 390 3.5 5-3.5 5-3.5-5Z"/>`).join('')}</g><path d="m18 56 14-23h37m222 0h37l14 23M18 464l14 23h37m222 0h37l14-23" fill="none" stroke="url(#back-metal)" stroke-width="2"/>` });

const rarities = [
  ['N', 'ノーマル', '#c8c5d4', '#746f87'], ['R', 'レア', '#dfe6f3', '#8b9bbd'],
  ['KR', 'キラレア', '#cdbdf2', '#8369ba'], ['KKR', 'キラキラレア', '#e9cdf7', '#a679c1'],
  ['GR', 'ギラレア', '#e9d5a2', '#ac8956'], ['GGR', 'ギラギラレア', '#fff0c8', '#b592c9'],
];
for (const [index, [code, displayName, light, dark]] of rarities.entries()) {
  const p = `rarity-${code.toLowerCase()}`;
  const spokes = Array.from({ length: index + 1 }, (_, i) => { const angle = (i - index / 2) * 15; return `<path d="m64 7 3 5-3 5-3-5Z" transform="rotate(${angle} 64 64)"/>`; }).join('');
  const rays = index >= 2 ? Array.from({ length: index === 5 ? 12 : 8 }, (_, i) => `<path d="M64 18v7" transform="rotate(${i * (index === 5 ? 30 : 45)} 64 64)"/>`).join('') : '';
  const body = `<defs><linearGradient id="${p}-metal" x1=".1" y1="0" x2=".8" y2="1"><stop stop-color="${light}"/><stop offset=".5" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient><linearGradient id="${p}-face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#30283f"/><stop offset="1" stop-color="#171b30"/></linearGradient></defs><path d="m64 15 40 23v46l-40 29-40-29V38Z" fill="url(#${p}-face)" stroke="url(#${p}-metal)" stroke-width="${index > 3 ? 2 : 1.3}"/><path d="m64 24 32 18v38l-32 23-32-23V42Z" fill="none" stroke="${light}" stroke-opacity=".35"/><g fill="${light}">${spokes}</g><g fill="none" stroke="${light}" stroke-opacity=".35" stroke-width="1.2">${rays}</g>${index === 5 ? '<path d="m42 34 9 5 13-12 13 12 9-5-4 14H46Z" fill="#ecd7a4"/>' : `<path d="m64 32 ${index + 3} 6-${index + 3} 6-${index + 3}-6Z" fill="${light}" fill-opacity=".8"/>`}<text x="64" y="76" text-anchor="middle" fill="${light}" font-family="Georgia, 'Times New Roman', serif" font-size="${code.length === 3 ? 21 : code.length === 2 ? 25 : 30}" font-weight="600" letter-spacing="1">${code}</text><g fill="${light}" fill-opacity=".8">${Array.from({ length: index + 1 }, (_, i) => `<circle cx="${64 + (i - index / 2) * 7}" cy="88" r="1.5"/>`).join('')}</g>`;
  await emit(`cards/${p}.svg`, { id: p, displayName, group: 'rarity', width: 128, height: 128, usage: `${index + 1}段階目のレアリティ。コードと下部の点の数でも識別できる透明バッジ。`, body, rarity: code, rank: index + 1 });
}

function panel(width, height, feature = false) {
  const p = feature ? 'panel-feature' : 'panel-standard';
  return `<defs><linearGradient id="${p}-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${feature ? '#302849' : '#20243f'}" stop-opacity=".97"/><stop offset=".55" stop-color="#191d35" stop-opacity=".96"/><stop offset="1" stop-color="#2b2043" stop-opacity=".97"/></linearGradient><linearGradient id="${p}-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8c3a0" stop-opacity=".8"/><stop offset=".5" stop-color="#8e79b3" stop-opacity=".45"/><stop offset="1" stop-color="#c0afd7" stop-opacity=".8"/></linearGradient></defs><path d="M26 2H${width - 47}L${width - 2} 47V${height - 22}l-20 20H22L2 ${height - 22}V26Z" fill="url(#${p}-fill)" stroke="url(#${p}-edge)" stroke-width="1.5"/><path d="M28 10H${width - 51}l33 33V${height - 26}l-16 16H26l-16-16V28Z" fill="none" stroke="#b0a1cc" stroke-opacity=".14"/><path d="M28 57V28h55m${width - 138} 0h15l20 20v24M28 ${height - 57}v29h55m${width - 166} 0h55v-29" fill="none" stroke="#bba3ce" stroke-opacity=".5" stroke-width="1.2"/>${feature ? `<path d="M${width / 2 - 48} 11h24l24 12 24-12h24M${width / 2 - 36} ${height - 12}h72" fill="none" stroke="#dfc992" stroke-opacity=".7"/><path d="m${width / 2} 16 4 6-4 6-4-6Z" fill="#e0c98f"/>` : `<path d="M28 92v28m0 15v5" fill="none" stroke="#a68bc6" stroke-opacity=".4"/>`}`;
}
await emit('ui/panel-standard.svg', { id: 'panel-standard', displayName: '標準パネル', group: 'panel', width: 720, height: 440, usage: 'ダイアログ、設定、情報パネルの背景。中央領域にテキストを重ねる。', body: panel(720, 440), safeArea: [42, 42, 636, 356] });
await emit('ui/panel-feature.svg', { id: 'panel-feature', displayName: '特別パネル', group: 'panel', width: 960, height: 360, usage: 'モード選択、進行、報酬などの注目パネル。上中央に小さな結び目の装飾を配置。', body: panel(960, 360, true), safeArea: [48, 46, 864, 266] });

const buttonStates = [
  { state: 'normal', name: '通常', top: '#52406f', bottom: '#2b2544', edge: '#b5a0c5', highlight: '#e0c98f', opacity: 1 },
  { state: 'hover', name: 'ホバー', top: '#705886', bottom: '#3b2d56', edge: '#ead6ab', highlight: '#fff0c7', opacity: 1 },
  { state: 'pressed', name: '押下', top: '#26243d', bottom: '#3d2e54', edge: '#c2acd5', highlight: '#c5aa77', opacity: 1 },
  { state: 'disabled', name: '無効', top: '#302b40', bottom: '#232335', edge: '#777082', highlight: '#a29aab', opacity: .65 },
];
for (const item of buttonStates) {
  const p = `button-${item.state}`, offset = item.state === 'pressed' ? 2 : 0;
  const body = `<defs><linearGradient id="${p}-fill" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="${item.top}"/><stop offset="1" stop-color="${item.bottom}"/></linearGradient></defs><g opacity="${item.opacity}"><path d="M17 ${3 + offset}h285l15 15v52l-15 15H17L3 70V18Z" fill="url(#${p}-fill)" stroke="${item.edge}" stroke-width="1.5"/><path d="M20 ${10 + offset}h278l12 12v44l-12 12H20L10 66V22Z" fill="none" stroke="${item.highlight}" stroke-opacity=".18"/><path d="M23 ${17 + offset}h40m194 0h40M23 70h40m194 0h40" fill="none" stroke="${item.highlight}" stroke-opacity=".65"/><path d="m17 38 3 6-3 6-3-6Zm286 0 3 6-3 6-3-6Z" fill="${item.highlight}" fill-opacity=".85"/>${item.state === 'pressed' ? '<path d="M21 13h277l10 10" fill="none" stroke="#0d1021" stroke-opacity=".7" stroke-width="3"/>' : '<path d="M21 5h277" fill="none" stroke="#f3e2ff" stroke-opacity=".14"/>'}</g>`;
  await emit(`ui/${p}.svg`, { id: p, displayName: `ボタン・${item.name}`, group: 'button', width: 320, height: 88, usage: '文字を含まないボタン背景。同じ寸法の4状態を切り替えて使用。', body, state: item.state, safeArea: [33, 23, 254, 43] });
}

await emit('ui/frame-aurora.svg', { id: 'ornament-aurora', displayName: '銀紫の装飾フレーム', group: 'ornament', width: 720, height: 440, usage: '中央が透明な細線の装飾フレーム。カード一覧、プロフィール、補助パネルに使用。', body: '<g fill="none" stroke="#c2b0dd" stroke-linecap="round"><path d="M60 14H660M60 426H660M14 60V380M706 60V380" stroke-opacity=".3"/><path d="M14 56V26l12-12h30M664 14h30l12 12v30M14 384v30l12 12h30m608 0h30l12-12v-30" stroke-width="1.8"/><path d="M23 62V31l8-8h31m596 0h31l8 8v31M23 378v31l8 8h31m596 0h31l8-8v-31" stroke-opacity=".4"/><path d="m8 220 6-11 6 11-6 11Zm692 0 6-11 6 11-6 11Z" stroke-opacity=".5"/></g><g fill="#c2b0dd"><circle cx="44" cy="14" r="2"/><circle cx="676" cy="14" r="2"/><circle cx="44" cy="426" r="2"/><circle cx="676" cy="426" r="2"/></g>', safeArea: [36, 36, 648, 368] });
await emit('ui/frame-regal.svg', { id: 'ornament-regal', displayName: '薄金の獣冠フレーム', group: 'ornament', width: 720, height: 440, usage: '中央が透明な王冠と六芽の装飾。選択中、勝利、最高レアの強調に使用。', body: '<g fill="none" stroke="#dac18d" stroke-linecap="round" stroke-linejoin="round"><path d="M47 18h256m114 0h256M47 422h626M18 47v346m684-346v346" stroke-opacity=".5"/><path d="m18 55 0-25 12-12h25m610 0h25l12 12v25M18 385v25l12 12h25m610 0h25l12-12v-25" stroke-width="2"/><path d="M27 67V35l8-8h32m586 0h32l8 8v32M27 373v32l8 8h32m586 0h32l8-8v-32" stroke-opacity=".3"/><path d="m331 13 14 8 15-16 15 16 14-8-5 23h-48Z" fill="#16172f" stroke-width="1.4"/><path d="m360 16 4 6-4 6-4-6Z" fill="#dac18d" stroke="none"/></g><g fill="#dac18d" fill-opacity=".85"><path d="M18 80c-12-2-13 8 0 12Zm0 20c-12-2-13 8 0 12Zm0 20c-12-2-13 8 0 12Zm684-40c12-2 13 8 0 12Zm0 20c12-2 13 8 0 12Zm0 20c12-2 13 8 0 12Z"/></g>', safeArea: [42, 48, 636, 350] });

await writeFile(join(webRoot, 'brand-icons.js'), `/** Original BEAST KING UI paths. ${copyright}. Generated by scripts/generate-design-vectors.mjs.\n * Every entry is SVG inner markup for viewBox="0 0 24 24" and uses currentColor.\n */\nexport const BRAND_ICONS = Object.freeze(${JSON.stringify(brandIcons, null, 2)});\n`);
const manifest = {
  schemaVersion: 1, brand: 'BEAST KING', copyright, originalArtwork: true,
  generatedBy: 'scripts/generate-design-vectors.mjs', regenerate: 'node scripts/generate-design-vectors.mjs',
  palette, originOrder: origins.map(({ id, name, color }) => ({ id, name, color })),
  total: assets.length,
  groups: Object.fromEntries([...new Set(assets.map(asset => asset.group))].map(group => [group, assets.filter(asset => asset.group === group).length])),
  inlineModule: 'brand-icons.js', inlineKeys: Object.keys(brandIcons),
  assets,
};
await writeFile(join(output, 'vector-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, vectors: assets.length, inlineIcons: Object.keys(brandIcons).length, groups: manifest.groups }, null, 2));
