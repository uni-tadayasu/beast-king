/**
 * ビーストキング — The First Chronicle
 * Four base 1,152-card sets, 17 public Regalia supports and 96 dreamcraft cards: 4,721 cards. All rules text corresponds to
 * effects implemented in engine.js; no network, randomized content, or filler IDs.
 */
import {
  SECOND_SET_CLANS, secondBeastDefinition, secondMiracleDefinition,
  secondGimmickDefinition, secondFusionDefinition,
} from './second-set-data.js?v=20261125-34';
import {balanceCreature, balancedMiracleStats, balancedGimmickStats} from './catalog-balance.js?v=20261125-34';

import {ADDITIONAL_CARD_SETS,makeAdditionalCards,EXPANSION_FAMILIES as ADDITIONAL_FAMILIES,EXPANSION_EFFECT_KINDS as ADDITIONAL_EFFECT_KINDS} from './additional-set-data.js?v=20261125-34';
import {FIFTH_CARD_SET,FIFTH_FAMILIES,FIFTH_EFFECT_KINDS,makeFifthCards} from './fifth-set-data.js?v=20261125-34';
import {makeExpansionRecipes} from './expansion-recipes.js?v=20261125-34';
import {makePremiumCards,upgradeRegalia,PREMIUM_SET_ADDITIONS} from './premium-cards.js?v=20261125-34';
import {PREMIUM_DECK} from './premium-deck.js?v=20261125-34';
export const EXPANSION_FAMILIES=Object.freeze([...ADDITIONAL_FAMILIES.map(f=>Object.freeze({...f,setId:'BK04',editionLabel:'第四弾'})),...FIFTH_FAMILIES]);
export const EXPANSION_EFFECT_KINDS=Object.freeze([...ADDITIONAL_EFFECT_KINDS,...FIFTH_EFFECT_KINDS]);

export const CARD_SETS = Object.freeze([
  { id: 'BK01', edition: 1, editionLabel: '第一弾', name: '六源の覚醒', reading: 'ろくげんのかくせい', coverId: 'B0001', cardCount: 1152 },
  { id: 'BK02', edition: 2, editionLabel: '第二弾', name: '王源の継承', reading: 'おうげんのけいしょう', coverId: 'B0512', cardCount: 1152 },
  ...ADDITIONAL_CARD_SETS,
  FIFTH_CARD_SET,
].map(set=>Object.freeze({...set,cardCount:set.cardCount+(PREMIUM_SET_ADDITIONS[set.id]??0)})));

const CARD_SERIES = Object.freeze([
  { id: 'dawn', name: '星光', color: '#e9c475', glyph: '✦', description: '星を冠する守護者。結界と回復で、揺るがない戦線を築く。' },
  { id: 'tide', name: '蒼海', color: '#72cce8', glyph: '◈', description: '記憶を湛えた深海。手札を整え、静かな波で勝機を引き寄せる。' },
  { id: 'ember', name: '紅炎', color: '#ef8b69', glyph: '✹', description: '消えない心火の眷属。烈火と速攻で、相手のハートポイントを追い詰める。' },
  { id: 'gale', name: '風嵐', color: '#80d3c1', glyph: '❋', description: '空路を駆ける自由な翼。速さと手数で、戦場の流れをつかむ。' },
  { id: 'grove', name: '翠樹', color: '#a9cf7c', glyph: '❧', description: '忘れられた森の盟約。癒やしと強化を重ね、命を大きく育てる。' },
  { id: 'stone', name: '地晶', color: '#d4b18a', glyph: '◇', description: '大地に眠る不動の意志。厚い守護と結界で、敵の攻勢を受け止める。' },
  { id: 'dusk', name: '宵闇', color: '#c4a2e5', glyph: '☾', description: '月の裏側に息づく契約。吸収と奇襲で、失った力を奪い返す。' },
  { id: 'aether', name: '霊機', color: '#99b9f7', glyph: '⌘', description: '想いで動く古代の機構。知恵と連携で、未来の一手を組み上げる。' },
].map(Object.freeze));

const ORIGIN_MAP = Object.freeze({ dawn: 'flower', tide: 'river', ember: 'seed', gale: 'grass', grove: 'tree', stone: 'mountain', dusk: 'seed', aether: 'grass' });
export const ORIGINS = Object.freeze([
  { id: 'mountain', name: '山', color: '#bca789', glyph: '▲', description: '山の不動の力。守護と結界で、揺るがない戦線を築く。' },
  { id: 'river', name: '川', color: '#75c8e6', glyph: '≈', description: '川の流れを読む知恵。回復と手札補給で、次の一手を整える。' },
  { id: 'seed', name: '種', color: '#dcc17e', glyph: '◉', description: '種に眠る可能性。ダメージと吸収を重ね、勝機を育てる。' },
  { id: 'grass', name: '草', color: '#8dce89', glyph: '❧', description: '草のしなやかな生命力。速さと連携で、戦場の流れを動かす。' },
  { id: 'flower', name: '花', color: '#e6a4be', glyph: '✿', description: '花ひらく守りの力。守護と回復を組み合わせ、味方を支える。' },
  { id: 'tree', name: '木', color: '#a2bc7d', glyph: '♧', description: '木々が重ねる生命の力。回復と強化で、戦線を大きく育てる。' },
  { id: 'king', name: '王', color: '#edbd65', glyph: '♛', description: '王冠を戴く魔獣の力。黄金の装甲と揺るがぬ意志で、戦いを導く。' },
].map(Object.freeze));
// Preserve the existing UI/engine import while exposing seven ordered origins.
export const ELEMENTS = ORIGINS;

export const TYPE_LABELS = Object.freeze({ beast: '魔獣', miracle: 'ミラクル', gimmick: 'ギミック', fusion: '合成魔獣' });
export const FUSION_CARD_ID = 'M0256';
export const POINT_SCALE = 100;
export const FUSION_MATERIAL_BONUS = 100;
export const RARITY_ORDER = Object.freeze(['N', 'R', 'KR', 'KKR', 'GR', 'GGR']);
export const RARITY_LABELS = Object.freeze({ N: 'ノーマル', R: 'レア', KR: 'キラレア', KKR: 'キラキラレア', GR: 'ギラレア', GGR: 'ギラギラレア' });
export const KEYWORD_LABELS = Object.freeze({ guard: '守護', rush: '速攻', drain: '吸収' });
export const MODEL_LABELS = Object.freeze({ attack: 'アタック型', defense: 'ディフェンス型', hybrid: 'アタック・ディフェンス型' });
export const SUBTYPE_LABELS = Object.freeze({ power: '威力カード', regeneration: '再生カード', reflection: '反射カード', support: '魔獣サポートカード' });
export const MODEL_DESCRIPTIONS = Object.freeze({
  attack: 'アタック型：相手の魔獣の攻撃を受けると、守備力にかかわらず消滅してお墓ゾーンへ移動する。持ち主のハートポイントは相手の攻撃力分を全て受ける。結界では軽減できず、反撃もしない。',
  defense: 'ディフェンス型：相手の攻撃力が守備力以下なら生存し、守備力も持ち主のハートポイントも減らない。攻撃力が守備力を上回ると消滅してお墓ゾーンへ移動し、持ち主のハートポイントは超過分だけ減る。結界では軽減できず、反撃もしない。',
  hybrid: 'アタック・ディフェンス型：攻撃するときは攻撃力を使い、攻撃を受けるときは守備力で判定する。相手の攻撃力が守備力以下なら生存し、守備力も持ち主のハートポイントも減らない。攻撃力が守備力を上回ると消滅してお墓ゾーンへ移動し、持ち主のハートポイントは超過分だけ減る。結界では軽減できず、反撃もしない。',
});

const REALMS = [
  {
    tiers: ['星灯', '黎明', '光輪', '天耀', '銀冠', '聖環', '星冠', '天極'],
    breeds: ['竜', '獅子', '翼獣', '霊狐', '麒麟', '梟', '騎獣', '白鹿'],
    names: ['アスティル', 'レオルカ', 'セレフィス', 'リュミナ', 'キリオス', 'ノクティル', 'アルテシア', 'エルシオン'],
    champion: '星冠竜 アストレイア',
    miracle: ['天弓', '祝祷', '星図', '戴冠', '流星雨', '光輪壁', '光の契約', '黎明の雫'],
    trap: ['星屑の矢衾', '銀の天蓋', '星読みの書架', '夜明けの泉'],
    prefixes: ['小夜星', '暁天', '星冠', '天極'],
    trapPrefixes: ['灯火', '星砂', '銀環', '薄明', '白光', '天冠', '星宮', '永輝'],
    lore: '夜が明けるたび、失われた星に新しい名を贈る。',
    effects: ['shield', 'none', 'heal', 'draw', 'buff_all', 'none', 'shield', 'heal'],
  },
  {
    tiers: ['泡沫', '汐音', '碧潮', '珊瑚', '深淵', '月海', '海冠', '滄極'],
    breeds: ['鯨', '海竜', '水狐', '海馬', '甲獣', '海蛇', '翼魚', '水精'],
    names: ['ネレシア', 'セイリオン', 'ミオル', 'リーヴァ', 'クラステル', 'オルディス', 'フィネア', 'アクシェル'],
    champion: '海詠鯨 ネレシア',
    miracle: ['潮槍', '命の潮', '記憶の航路', '真珠の誓い', '大渦', '潮汐の帳', '深海の契約', '水鏡の雫'],
    trap: ['逆巻く海溝', '貝殻の砦', '漂流者の書庫', '海底の湧水'],
    prefixes: ['浅瀬', '碧潮', '月海', '滄極'],
    trapPrefixes: ['泡影', '砂洲', '珊瑚', '碧流', '深海', '海冠', '潮宮', '悠洋'],
    lore: '海が覚えている物語を、波のひとつに封じている。',
    effects: ['draw', 'heal', 'none', 'shield', 'draw', 'none', 'heal', 'buff_all'],
  },
  {
    tiers: ['火花', '燎原', '紅蓮', '溶岩', '焔牙', '赫天', '炎冠', '灼極'],
    breeds: ['狼', '火竜', '鳳鳥', '火狐', '炎獅子', '角獣', '熔蛇', '焔鬼'],
    names: ['ヴェルガ', 'イグレシア', 'フェルノア', 'コハク', 'レガリオ', 'バルディン', 'サラティス', 'エンライ'],
    champion: '焔帝狼 ヴェルガ',
    miracle: ['焔槍', '火守りの祈り', '熾火の予兆', '赤鉄の誓い', '火の雨', '炎幕', '心火の契約', '再燃の息吹'],
    trap: ['埋火の罠', '焦土の防壁', '炎刻みの石板', '火精の灯炉'],
    prefixes: ['熾火', '紅蓮', '炎冠', '灼極'],
    trapPrefixes: ['火種', '赤砂', '溶鉄', '熾紅', '焔牙', '炎冠', '火宮', '恒炎'],
    lore: '燃え尽きるためではない。明日を灯すための炎。',
    effects: ['damage_core', 'none', 'damage_core', 'shield', 'none', 'buff_all', 'damage_core', 'heal'],
  },
  {
    tiers: ['微風', '青嵐', '疾空', '雲海', '蒼翼', '雷鳴', '風冠', '空極'],
    breeds: ['鷹', '風竜', '飛燕', '天馬', '翼狼', '雷鳥', '嵐獣', '風精'],
    names: ['シルファ', 'アエリオン', 'ハヤテ', 'スピレア', 'ルフナ', 'ライディス', 'ヴェント', 'フィリス'],
    champion: '空翔鷹 シルファ',
    miracle: ['風刃', '薫風の祈り', '空路の便り', '疾風の誓い', '雷雲', '風の帳', '嵐の契約', '天露'],
    trap: ['逆風の回廊', '雲の防壁', '風読みの羅針盤', '雲上の泉'],
    prefixes: ['初風', '青嵐', '風冠', '空極'],
    trapPrefixes: ['そよぎ', '風砂', '青雲', '疾風', '雷翼', '風冠', '空宮', '常凪'],
    lore: 'その翼に境界はない。風の向こうが、いつも始まり。',
    effects: ['none', 'draw', 'none', 'damage_core', 'draw', 'shield', 'buff_all', 'none'],
  },
  {
    tiers: ['若芽', '木洩', '翠葉', '古樹', '花守', '森羅', '樹冠', '翠極'],
    breeds: ['鹿', '樹竜', '花狐', '森熊', '苔亀', '葉梟', '枝角獣', '花精'],
    names: ['フィオリア', 'アルボル', 'リリシア', 'モルガン', 'トルフィ', 'ネムリス', 'セルヴァ', 'フロリア'],
    champion: '森霊鹿 フィオリア',
    miracle: ['荊の槍', '芽吹きの祈り', '年輪の記憶', '花冠の誓い', '花嵐', '蔦の天幕', '森の契約', '生命の雫'],
    trap: ['絡みつく根', '古木の砦', '樹洞の書庫', '聖樹の泉'],
    prefixes: ['萌芽', '翠葉', '樹冠', '翠極'],
    trapPrefixes: ['双葉', '若枝', '緑陰', '花守', '古樹', '樹冠', '森宮', '千翠'],
    lore: '小さな芽の約束が、千年先の森をつくる。',
    effects: ['heal', 'buff_all', 'none', 'heal', 'shield', 'buff_all', 'draw', 'none'],
  },
  {
    tiers: ['砂礫', '赤岩', '晶洞', '重鋼', '金剛', '地脈', '晶冠', '地極'],
    breeds: ['亀', '岩竜', '晶獅子', '石牛', '鋼犀', '砂蠍', '山羊', '岩精'],
    names: ['バサルガ', 'ジオリス', 'クォルツ', 'ゴルディア', 'フェルガン', 'スコルド', 'ガルネア', 'テラノア'],
    champion: '晶砦亀 バサルガ',
    miracle: ['晶槍', '地母の祈り', '化石の記憶', '岩心の誓い', '地割れ', '金剛壁', '大地の契約', '地脈の息吹'],
    trap: ['落石の峡谷', '黒曜の城塞', '地層の石室', '鉱泉の脈'],
    prefixes: ['砂紋', '晶洞', '晶冠', '地極'],
    trapPrefixes: ['砂岩', '赤土', '晶砂', '重鋼', '金剛', '晶冠', '岩宮', '久遠'],
    lore: '山が語る言葉は少ない。その約束は、決して崩れない。',
    effects: ['shield', 'none', 'shield', 'buff_all', 'heal', 'none', 'shield', 'damage_core'],
  },
  {
    tiers: ['夕影', '宵月', '夜霧', '黒羽', '冥華', '幽天', '月冠', '宵極'],
    breeds: ['豹', '影竜', '月狐', '夜鴉', '夢蝕獣', '黒狼', '影蛇', '幽精'],
    names: ['ノクシア', 'ヴェスパー', 'ツキシロ', 'クロウィス', 'ソムニア', 'ネヴァル', 'シェディア', 'ルナリス'],
    champion: '月影豹 ノクシア',
    miracle: ['影縫い', '月守りの祈り', '夢の記録', '黒羽の誓い', '宵闇の雨', '月蝕の帳', '夜の契約', '夢醒めの露'],
    trap: ['影踏みの回廊', '黒鏡の障壁', '夢見の書架', '月影の泉'],
    prefixes: ['夕月', '夜霧', '月冠', '宵極'],
    trapPrefixes: ['夕影', '宵砂', '月輪', '黒羽', '冥華', '月冠', '夜宮', '常夜'],
    lore: '闇は光を奪わない。まだ見ぬ願いを、静かに隠す。',
    effects: ['damage_core', 'heal', 'draw', 'none', 'damage_core', 'shield', 'none', 'buff_all'],
  },
  {
    tiers: ['歯車', '霊銅', '銀軸', '星炉', '響鋼', '天機', '機冠', '霊極'],
    breeds: ['兵', '機竜', '機獅子', '時計鳥', '輪脚獣', '霊甲獣', '灯蛾', '機精'],
    names: ['オルフェン', 'クロノア', 'ギアリオン', 'ティクリス', 'ロディア', 'アーケル', 'ルミネア', 'エトリア'],
    champion: '霊機兵 オルフェン',
    miracle: ['霊弾', '再起動', '記録結晶', '歯車の誓い', '共振波', '霊子障壁', '機心の契約', '修復光'],
    trap: ['逆転歯車', '霊鋼の隔壁', '記憶の端末', '再生の炉'],
    prefixes: ['微動', '星炉', '機冠', '霊極'],
    trapPrefixes: ['零時', '霊砂', '銀軸', '星炉', '響鋼', '機冠', '機宮', '永動'],
    lore: '歯車を動かすのは、忘れられた誰かの願い。',
    effects: ['draw', 'buff_all', 'shield', 'none', 'draw', 'shield', 'none', 'damage_core'],
  },
];

const KEYWORD_TEXT = {
  guard: '守護：相手は守護を持つ魔獣を先に攻撃しなければならない。',
  rush: '速攻：召喚したターンから攻撃できる。',
  drain: '吸収：戦闘で相手のハートポイントを実際に減らした分、自分のハートポイントを回復する。',
};
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const idFor = (prefix, index) => `${prefix}${String(index + 1).padStart(4, '0')}`;
const freezeCard = input => {
  const card = balanceCreature(input);
  const kind = card.effect.kind;
  const value = ['none', 'draw', 'fusion'].includes(kind) ? card.effect.value : card.effect.value * POINT_SCALE;
  const effect = Object.freeze({ kind, value });
  let text = card.text;
  if (card.type === 'beast') text = beastText(kind, value, card.keywords);
  else if (card.type === 'fusion') text = `特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+${FUSION_MATERIAL_BONUS}。` + beastText(kind, value, card.keywords);
  else if (card.type === 'miracle' && kind !== 'fusion') text = miracleText(kind, value);
  else if (card.type === 'gimmick') text = gimmickText(kind, value);
  const royal = card.id === 'B0512';
  const origin = royal ? 'king' : (card.origin || ORIGIN_MAP[card.element]);
  const model = card.type === 'fusion' ? 'hybrid' : card.type === 'beast' ? (card.model || (card.keywords.includes('guard') || card.hp > card.attack ? 'defense' : 'attack')) : null;
  const subtype = card.type === 'miracle' ? (['damage_enemy','draw','buff','sweep'].includes(kind) ? 'power' : 'regeneration') : card.type === 'gimmick' ? (['ambush','barrier'].includes(kind) ? 'reflection' : 'support') : null;
  if (model) text += ' ' + MODEL_DESCRIPTIONS[model];
  return Object.freeze({ ...card, ...(royal ? { name: '王冠竜 レガリア', flavor: '王冠は与えられるものではない。守り抜いた誓いが、黄金の翼になる。' } : {}), ...(model ? { model } : {}), ...(subtype ? { subtype } : {}), setId: card.setId || (royal ? 'BK02' : 'BK01'), series: card.series || card.element, element: origin, origin, attack: card.attack * POINT_SCALE, hp: card.hp * POINT_SCALE, effect, text, keywords: Object.freeze(card.keywords) });
};
const TIER_RARITIES = Object.freeze(['N', 'N', 'R', 'KR', 'KR', 'KKR', 'GR', 'GGR']);
const rarityForTier = tier => TIER_RARITIES[tier];

function beastText(kind, value, keywords) {
  const rules = {
    none: '召喚時の効果はない。',
    draw: `召喚時、カードを${value}枚引く。手札が4枚に達したら、それ以上は引かない。`,
    heal: `召喚時、自分のハートポイントを${value}回復する。`,
    damage_core: `召喚時、相手のハートポイントに${value}ダメージ。`,
    buff_all: `召喚時、自身を含む味方の魔獣すべての攻撃力を${value}上げる。`,
    shield: `召喚時、自分のハートポイントに結界${value}を加える。結界はハートポイントへのダメージを吸収する（魔獣への攻撃で持ち主が受けるダメージを除く）。`,
  };
  return [rules[kind], ...keywords.map(k => KEYWORD_TEXT[k])].join(' ');
}

function makeBeasts() {
  const result = [];
  CARD_SERIES.forEach((element, e) => {
    const realm = REALMS[e];
    for (let tier = 0; tier < 8; tier++) for (let variant = 0; variant < 8; variant++) {
      const local = tier * 8 + variant;
      const index = e * 64 + local;
      const cost = tier + 1;
      const kind = realm.effects[(variant + tier) % 8];
      const keywords = [];
      if ((e === 0 || e === 5) && variant % 3 === 1 || variant === 6) keywords.push('guard');
      if ((e === 2 || e === 3) && variant % 3 === 0 || (variant === 3 && tier % 2 === 1)) keywords.push('rush');
      if (e === 6 && variant % 3 === 0 || (variant === 7 && tier >= 3)) keywords.push('drain');
      const value = kind === 'none' ? 0 : kind === 'draw' ? (cost >= 7 ? 2 : 1) : kind === 'buff_all' ? (cost >= 7 ? 2 : 1) : kind === 'heal' ? 2 + Math.floor(cost / 2) : kind === 'damage_core' ? 1 + Math.floor(cost / 3) : 1 + Math.floor(cost / 2);
      const tax = (kind === 'none' ? 0 : 1) + (kind === 'draw' || kind === 'buff_all' ? 1 : 0);
      const attack = clamp(cost + (variant % 3) - 1 - Math.floor(tax / 2) - (keywords.includes('drain') ? 1 : 0), 1, 9);
      const hp = clamp(cost + 2 - (variant % 3) - (tax % 2) - (keywords.includes('rush') ? 1 : 0) + (keywords.includes('guard') ? 1 : 0), 1, 10);
      let card = {
        id: idFor('B', index), index: index + 1, name: `${realm.tiers[tier]}${realm.breeds[variant]} ${realm.names[variant]}`,
        type: 'beast', category: 'beast', element: element.id, cost, rarity: rarityForTier(tier, variant), attack, hp,
        effect: { kind, value }, keywords, text: beastText(kind, value, keywords),
        flavor: realm.lore, art: e * 2 + (variant % 2),
      };
      if (local === 0) {
        const championEffects = [ ['shield', 2], ['draw', 2], ['damage_core', 3], ['draw', 1], ['heal', 6], ['shield', 5], ['damage_core', 2], ['buff_all', 1] ];
        const championKeywords = [ ['guard'], [], ['rush'], ['rush'], ['guard'], ['guard'], ['drain'], [] ];
        const [championKind, championValue] = championEffects[e];
        const championStats = [[6,7],[5,7],[6,5],[5,6],[5,8],[4,9],[6,6],[5,6]];
        card = { ...card, name: realm.champion, cost: 6, rarity: 'GGR', attack: championStats[e][0], hp: championStats[e][1],
          effect: { kind: championKind, value: championValue }, keywords: championKeywords[e],
          text: beastText(championKind, championValue, championKeywords[e]), art: e * 2 };
      }
      result.push(card);
    }
  });
  const defenseIds = new Set();
  for (let series = 0; series < 8; series++) {
    const score = c => (c.keywords.includes('guard') ? 1000 : 0) + (c.hp - c.attack) * 100 + c.hp * 10;
    const ordered = result.slice(series * 64, (series + 1) * 64).sort((a,b) => score(b) - score(a) || a.index - b.index);
    ordered.slice(0,32).forEach(c => defenseIds.add(c.id));
  }
  return result.map(card => freezeCard({ ...card, model: defenseIds.has(card.id) ? 'defense' : 'attack' }));
}

const MIRACLE_KINDS = ['damage_enemy', 'heal', 'draw', 'buff', 'sweep', 'shield', 'drain', 'renew'];
const miracleStats = balancedMiracleStats;
function miracleText(kind, value) {
  return {
    damage_enemy: `敵の魔獣1体の守備力を${value}減らすか、相手のハートポイントに${value}ダメージ。`,
    heal: `自分のハートポイントを${value}回復する。ハートポイントの上限は5000。`,
    draw: `カードを${value}枚引く。手札が4枚に達したら、それ以上は引かない。`,
    buff: `味方の魔獣1体の攻撃力・現在守備力・最大守備力をそれぞれ${value}上げる。`,
    sweep: `敵の魔獣すべての守備力を${value}減らす。`,
    shield: `自分のハートポイントに結界${value}を加える。結界はハートポイントへのダメージを吸収する（魔獣への攻撃で持ち主が受けるダメージを除く）。`,
    shield_heal: `自分のハートポイントを${value}回復し、結界${value}を加える。回復上限は5000。結界はハートポイントへのダメージを吸収する（魔獣への攻撃で持ち主が受けるダメージを除く）。`,
    drain: `相手のハートポイントに${value}ダメージ。実際に与えたダメージ分、自分のハートポイントを回復する。`,
    renew: `味方の魔獣すべての守備力を${value}回復する。それぞれの最大守備力を超えない。`,
  }[kind];
}
function makeMiracles() {
  const result = [];
  CARD_SERIES.forEach((element, e) => {
    const realm = REALMS[e];
    for (let rank = 0; rank < 4; rank++) MIRACLE_KINDS.forEach((kind, k) => {
      const index = e * 32 + rank * 8 + k;
      const { cost, value } = miracleStats(kind, rank, element.id);
      const id = idFor('M', index);
      const fusionSpell = id === FUSION_CARD_ID;
      const resolvedKind = kind === 'shield' ? 'shield_heal' : kind;
      result.push(freezeCard({
        id, index: 513 + index, name: fusionSpell ? '合成' : `${realm.prefixes[rank]}の${realm.miracle[k]}`,
        type: 'miracle', element: element.id, cost: fusionSpell ? 3 : cost,
        rarity: fusionSpell ? 'R' : rank === 3 && k >= 6 ? (k === 6 ? 'GR' : 'GGR') : ['N', 'R', 'KR', 'KKR'][rank], attack: 0, hp: 0,
        effect: fusionSpell ? { kind: 'fusion', value: 0 } : { kind: resolvedKind, value }, keywords: [],
        text: fusionSpell ? '自分の手持ち・出場ゾーン・お墓ゾーンから魔獣カード（合成魔獣を含む）を1枚以上選び、すべて異世界ゾーンへ送る。1つのゾーンだけでも、混合でもよい。特殊ゾーンの特殊デッキから合成魔獣1体を召喚する。素材2枚目以降、1枚につき攻撃力・守備力+100。追加エーテルは不要。' : miracleText(resolvedKind, value),
        flavor: fusionSpell ? '重ねた命の記憶が、まだ見ぬ姿を結ぶ。' : `${element.name}の願いが、一瞬を奇跡に変える。`, art: fusionSpell ? 18 : 16 + (k % 4),
      }));
    });
  });
  return result;
}

const GIMMICK_KINDS = ['ambush', 'barrier', 'spring', 'fountain'];
const gimmickStats = balancedGimmickStats;
function gimmickText(kind, value) {
  return {
    ambush: `相手の魔獣が攻撃した時、攻撃した魔獣に${value}の反射ダメージ。消滅させた場合はその攻撃を止める。発動後、お墓ゾーンへ送る。`,
    barrier: `自分のハートポイントが直接攻撃された時、そのダメージを${value}軽減し、軽減した分を攻撃した魔獣へ反射する。攻撃した魔獣が消滅した場合、残りの攻撃も止める。発動後、お墓ゾーンへ送る。`,
    spring: `次の自分のターン開始時、味方の魔獣すべての攻撃力・現在守備力・最大守備力をそれぞれ${value}上げる。発動後、お墓ゾーンへ送る。`,
    fountain: `次の自分のターン開始時、味方の魔獣すべての守備力を${value}回復する。それぞれの最大守備力を超えない。発動後、お墓ゾーンへ送る。`,
  }[kind];
}

function makeGimmicks() {
  const result = [];
  CARD_SERIES.forEach((element, e) => {
    const realm = REALMS[e];
    for (let rank = 0; rank < 8; rank++) GIMMICK_KINDS.forEach((kind, k) => {
      const index = e * 32 + rank * 4 + k;
      const { cost, value } = gimmickStats(kind, rank, element.id);
      result.push(freezeCard({
        id: idFor('G', index), index: 769 + index, name: `${realm.trapPrefixes[rank]}の${realm.trap[k]}`,
        type: 'gimmick', element: element.id, cost, rarity: TIER_RARITIES[rank], attack: 0, hp: 0,
        effect: { kind, value }, keywords: [], text: gimmickText(kind, value),
        flavor: '勝敗は、まだ見えていない一手から動き出す。', art: 20 + k,
      }));
    });
  });
  return result;
}

const FUSION_REALMS = [
  { tiers: ['双星', '聖環', '天穹', '極光'], breeds: ['双翼竜', '冠獅鷲', '星詠獣', '天輪凰'], names: ['アステリオン', 'レオセレス', 'ミラルシア', 'フェリオル'] },
  { tiers: ['澄潮', '蒼環', '海淵', '悠洋'], breeds: ['潮牙竜', '海麟鯨', '珊翼獣', '渦冠蛇'], names: ['マレノア', 'ネレクシス', 'リュアネア', 'オルセイア'] },
  { tiers: ['双炎', '赫環', '灼天', '恒焔'], breeds: ['熔牙獅', '焔翼竜', '紅蓮凰', '火冠狼'], names: ['ヴァルセオ', 'イグネリア', 'フェニオル', 'グレンシア'] },
  { tiers: ['双嵐', '風環', '天翔', '蒼極'], breeds: ['翼角獣', '雷冠鷲', '雲駆竜', '風輪馬'], names: ['シルヴェリア', 'ライオルネ', 'アエルディス', 'スフィリア'] },
  { tiers: ['双芽', '翠環', '万緑', '永樹'], breeds: ['花冠鹿', '樹翼竜', '森羅獅', '命輪獣'], names: ['フィオルネ', 'アルヴェリア', 'セレヴァン', 'フロレティア'] },
  { tiers: ['双晶', '鋼環', '山岳', '万象'], breeds: ['鉱翼竜', '地冠亀', '晶角牛', '岩輪獅'], names: ['バサルディア', 'ジオグラン', 'クォルディス', 'ガルゼリア'] },
  { tiers: ['双月', '幽環', '冥夜', '永宵'], breeds: ['夜翼豹', '影冠竜', '月蝕狐', '夢輪鴉'], names: ['ノクレシア', 'ヴェスティア', 'ツキハルカ', 'ソムネリス'] },
  { tiers: ['双軸', '霊環', '天律', '無窮'], breeds: ['機翼竜', '星炉獣', '響冠兵', '時輪鳥'], names: ['オルフィリア', 'クロネルガ', 'ギアレシス', 'ティクノア'] },
];
const FUSION_RARITIES = ['N', 'N', 'R', 'R', 'KR', 'KR', 'KR', 'KKR', 'KKR', 'KKR', 'GR', 'GR', 'GGR', 'GGR', 'GGR', 'GGR'];
function makeFusions() {
  const result = [];
  CARD_SERIES.forEach((element, e) => {
    const realm = REALMS[e], fusion = FUSION_REALMS[e];
    for (let rank = 0; rank < 4; rank++) for (let variant = 0; variant < 4; variant++) {
      const local = rank * 4 + variant, index = e * 16 + local;
      const kind = realm.effects[(rank * 2 + variant) % 8];
      const value = kind === 'none' ? 0 : kind === 'heal' || kind === 'shield' ? 2 + rank : kind === 'damage_core' ? 1 + Math.floor(rank / 2) : 1;
      const keywords = variant === 1 || (rank === 3 && variant === 0) ? ['guard'] : variant === 2 && (e === 2 || e === 3) ? ['rush'] : variant === 3 && e === 6 ? ['drain'] : [];
      result.push(freezeCard({
        id: idFor('F', index), index: 1025 + index,
        name: `${fusion.tiers[rank]}${fusion.breeds[variant]} ${fusion.names[variant]}`,
        type: 'fusion', category: 'beast', model: 'hybrid', element: element.id, cost: 0, rarity: FUSION_RARITIES[local],
        attack: 4 + rank, hp: 4 + (rank + variant + 1) % 4,
        effect: { kind, value }, keywords,
        text: '特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+100。' + beastText(kind, value, keywords),
        flavor: `${element.name}の記憶がひとつになり、新たな王獣の名を刻む。`, art: 24 + e * 2 + (variant % 2),
      }));
    }
  });
  return result;
}

function makeSecondBeasts() {
  const result = [];
  SECOND_SET_CLANS.forEach((clan, e) => {
    const seriesIndex = CARD_SERIES.findIndex(series => series.id === clan.balanceSeries);
    const realm = REALMS[seriesIndex], group = [];
    for (let local = 0; local < (e === 7 ? 63 : 64); local++) {
      const tier = Math.floor(local / 8), variant = local % 8, cost = tier + 1;
      const index = e * 64 + local;
      const kind = realm.effects[(variant + tier + e) % 8];
      const keywords = [];
      if ((['king', 'mountain'].includes(clan.origin) && variant % 3 === 1) || variant === 6) keywords.push('guard');
      if ((['seed', 'grass'].includes(clan.origin) && variant % 3 === 0) || (variant === 3 && tier % 2 === 1)) keywords.push('rush');
      if ((clan.id === 'eclipse' && variant % 3 === 0) || (variant === 7 && tier >= 3)) keywords.push('drain');
      const value = kind === 'none' ? 0 : kind === 'draw' || kind === 'buff_all' ? (cost >= 7 ? 2 : 1) : kind === 'heal' ? 2 + Math.floor(cost / 2) : kind === 'damage_core' ? 1 + Math.floor(cost / 3) : 1 + Math.floor(cost / 2);
      const tax = (kind === 'none' ? 0 : 1) + (kind === 'draw' || kind === 'buff_all' ? 1 : 0);
      group.push({
        ...secondBeastDefinition(index), index: 1153 + index, category: 'beast', element: clan.balanceSeries,
        cost, rarity: rarityForTier(tier),
        attack: clamp(cost + (variant % 3) - 1 - Math.floor(tax / 2) - (keywords.includes('drain') ? 1 : 0), 1, 9),
        hp: clamp(cost + 2 - (variant % 3) - (tax % 2) - (keywords.includes('rush') ? 1 : 0) + (keywords.includes('guard') ? 1 : 0), 1, 10),
        effect: { kind, value }, keywords, flavor: clan.lore, art: seriesIndex * 2 + variant % 2,
      });
    }
    const score = c => (c.keywords.includes('guard') ? 1000 : 0) + (c.hp - c.attack) * 100 + c.hp * 10;
    const defense = new Set([...group].sort((a, b) => score(b) - score(a) || a.index - b.index).slice(0, e === 7 ? 31 : 32).map(card => card.id));
    result.push(...group.map(card => freezeCard({ ...card, model: defense.has(card.id) ? 'defense' : 'attack' })));
  });
  return result;
}

function makeSecondMiracles(fusionText) {
  return Array.from({ length: 256 }, (_, index) => {
    const clan = SECOND_SET_CLANS[Math.floor(index / 32)], local = index % 32, rank = Math.floor(local / 8), k = local % 8;
    const kind = MIRACLE_KINDS[k], fusion = index === 255, { cost, value } = miracleStats(kind, rank, clan.balanceSeries);
    return freezeCard({
      ...secondMiracleDefinition(index), index: 1665 + index, element: clan.balanceSeries,
      cost: fusion ? 3 : cost,
      rarity: fusion ? 'R' : rank === 3 && k >= 6 ? (k === 6 ? 'GR' : 'GGR') : ['N', 'R', 'KR', 'KKR'][rank],
      attack: 0, hp: 0, effect: fusion ? { kind: 'fusion', value: 0 } : { kind: kind === 'shield' ? 'shield_heal' : kind, value }, keywords: [],
      text: fusion ? fusionText : '', flavor: fusion ? '受け継いだ誓いが、王の源へ新しい姿を刻む。' : `${clan.name}の誓いが、王国の明日を形づくる。`, art: fusion ? 18 : 16 + k % 4,
    });
  });
}

function makeSecondGimmicks() {
  return Array.from({ length: 256 }, (_, index) => {
    const clan = SECOND_SET_CLANS[Math.floor(index / 32)], local = index % 32, rank = Math.floor(local / 4), k = local % 4;
    const kind = GIMMICK_KINDS[k], { cost, value } = gimmickStats(kind, rank, clan.balanceSeries);
    return freezeCard({
      ...secondGimmickDefinition(index), index: 1921 + index, element: clan.balanceSeries,
      cost, rarity: TIER_RARITIES[rank], attack: 0, hp: 0, effect: { kind, value }, keywords: [],
      flavor: `${clan.name}が託した仕掛けは、守るべき瞬間を待っている。`, art: 20 + k,
    });
  });
}

function makeSecondFusions() {
  return Array.from({ length: 128 }, (_, index) => {
    const e = Math.floor(index / 16), local = index % 16, rank = Math.floor(local / 4), variant = local % 4;
    const clan = SECOND_SET_CLANS[e], seriesIndex = CARD_SERIES.findIndex(series => series.id === clan.balanceSeries);
    const kind = REALMS[seriesIndex].effects[(rank * 2 + variant + e) % 8];
    const value = kind === 'none' ? 0 : kind === 'heal' || kind === 'shield' ? 2 + rank : kind === 'damage_core' ? 1 + Math.floor(rank / 2) : 1;
    const keywords = variant === 1 || (rank === 3 && variant === 0) ? ['guard'] : variant === 2 && ['seed', 'grass'].includes(clan.origin) ? ['rush'] : variant === 3 && clan.id === 'eclipse' ? ['drain'] : [];
    return freezeCard({
      ...secondFusionDefinition(index), index: 2177 + index, category: 'beast', model: 'hybrid', element: clan.balanceSeries,
      cost: 0, rarity: FUSION_RARITIES[local], attack: 4 + rank, hp: 4 + (rank + variant + 1) % 4,
      effect: { kind, value }, keywords, flavor: `${clan.name}の異なる命が結び合い、継承に新しい道を拓く。`, art: 24 + seriesIndex * 2 + variant % 2,
    });
  });
}

// Existing indices, IDs, names and pack membership remain fixed. Balance
// revision 4 is applied before public rules text and frozen values are created.
const legacyCards = [...makeBeasts(), ...makeMiracles(), ...makeGimmicks(), ...makeFusions()];
const restoredAether = Object.freeze({
  ...legacyCards[511], id: 'B1024', index: 1664, setId: 'BK01',
  name: '霊極機精 エトリア', flavor: REALMS[7].lore, element: 'grass', origin: 'grass', series: 'aether',
  artBrief: Object.freeze({ species: 'ancient mechanical spirit', anatomy: 'a small empty copper torso surrounded by independently floating gear limbs, translucent luminous membrane wings, a single delicate eye suspended inside an open ring-shaped head; no humanoid face', material: 'verdigris copper, clear glass, pale grass-green energy', palette: 'dark olive, amber brass and luminous lime', environment: 'abandoned clockwork garden under warm early-morning sun', composition: 'full-body suspended pose with limbs widely separated' }),
});
// Both expansions are individually balanced, without changing IDs, combat
// rules, rarity or illustration. Protect the authored starter themes.
const REGULAR_ORIGINS=['mountain','river','seed','grass','flower','tree'];
const ORIGIN_QUOTAS=Object.freeze({
 BK01:{beast:[86,86,85,85,85,85],miracle:[42,42,43,43,43,43],gimmick:[43,43,42,42,43,43],fusion:[21,21,22,22,21,21]},
 BK02:{beast:[85,85,85,85,85,86],miracle:[43,43,43,43,42,42],gimmick:[42,42,43,43,43,43],fusion:[22,22,21,21,21,21]},
});
function balanceOrigins(cards){
 const preserve=new Set(['B1024','M0256']);
 const themeSpell=[5,1,0,4,7,5,6,3];
 for(let e=0;e<8;e++){
  for(const n of [0,1,2,8,11,16,19,24,47])preserve.add(idFor('B',e*64+n));
  for(const n of [0,3,8+themeSpell[e]])preserve.add(idFor('M',e*32+n));
  for(const n of [0,1,2,3])preserve.add(idFor('G',e*32+n));
  for(const n of [0,4,8,12])preserve.add(idFor('F',e*16+n));
 }
 const overrides=new Map();
 for(const [set,types] of Object.entries(ORIGIN_QUOTAS))for(const [type,quotas] of Object.entries(types)){
  const group=cards.filter(c=>c.setId===set&&c.type===type&&c.id!=='B0512');
  const remaining=new Map(REGULAR_ORIGINS.map((o,i)=>[o,quotas[i]]));
  const width=type==='beast'?64:type==='fusion'?16:32;
  const order=c=>{const n=Number(c.id.slice(1))-1,local=n%width;return ((local*13)%width)*16+Math.floor(n/width)%16;};
  const ordered=[...group].sort((a,b)=>Number(preserve.has(b.id))-Number(preserve.has(a.id))||order(a)-order(b)||a.index-b.index);
  const pool=[];
  for(const card of ordered){const slots=remaining.get(card.origin)||0;if(slots>0)remaining.set(card.origin,slots-1);else{if(preserve.has(card.id))throw Error('Protected origin quota: '+card.id);pool.push(card);}}
  for(const card of pool){
   const available=REGULAR_ORIGINS.filter(o=>remaining.get(o)>0);
   if(!available.length)throw Error('Origin quotas too small for '+set+'/'+type);
   const next=available.sort((a,b)=>remaining.get(b)/quotas[REGULAR_ORIGINS.indexOf(b)]-remaining.get(a)/quotas[REGULAR_ORIGINS.indexOf(a)])[0];
   overrides.set(card.id,next);remaining.set(next,remaining.get(next)-1);
  }
  if([...remaining.values()].some(n=>n!==0))throw Error('Origin quota mismatch for '+set+'/'+type);
 }
 return cards.map(card=>overrides.has(card.id)?Object.freeze({...card,origin:overrides.get(card.id),element:overrides.get(card.id)}):card);
}
export const CARDS = Object.freeze([...balanceOrigins([
  ...legacyCards.map(card => card.id === 'B0512' ? upgradeRegalia(card,{modelDescriptions:MODEL_DESCRIPTIONS}) : card), ...makeSecondBeasts(), restoredAether,
  ...makeSecondMiracles(legacyCards.find(card => card.id === FUSION_CARD_ID).text),
  ...makeSecondGimmicks(), ...makeSecondFusions(),
]),...makeAdditionalCards({modelDescriptions:MODEL_DESCRIPTIONS,fusionText:legacyCards.find(card=>card.id===FUSION_CARD_ID).text}),...makePremiumCards({modelDescriptions:MODEL_DESCRIPTIONS}),...makeFifthCards({modelDescriptions:MODEL_DESCRIPTIONS,fusionText:legacyCards.find(card=>card.id===FUSION_CARD_ID).text})]);
const cardsBySet = new Map(CARD_SETS.map(set => [set.id, Object.freeze(CARDS.filter(card => card.setId === set.id))]));
const EMPTY_SET = Object.freeze([]);
export const getCardsForSet = id => cardsBySet.get(id) || EMPTY_SET;
export const CARD_MAP = new Map(CARDS.map(card => [card.id, card]));
export const getCard = id => CARD_MAP.get(id);
export const DECK_SIZE = 32;
export const DECK_MIN = DECK_SIZE;
export const DECK_MAX = DECK_SIZE;
export const SPECIAL_DECK_SIZE = 4;
export const DECK_COPY_LIMIT = 2;

function validateCardList(ids, size, types, label) {
  const errors = [];
  if (!Array.isArray(ids)) return { valid: false, errors: [`${label}の形式が正しくありません。`] };
  if (ids.length !== size) errors.push(`${label}は${size}枚ちょうどで構成してください（現在${ids.length}枚）。`);
  const counts = new Map();
  for (const id of ids) {
    const card = typeof id === 'string' ? CARD_MAP.get(id) : undefined;
    if (!card) {
      if (!errors.includes('収録されていないカードが含まれています。')) errors.push('収録されていないカードが含まれています。');
      continue;
    }
    if (!types.includes(card.type)) {
      const error = label === '特殊デッキ' ? '特殊デッキには合成魔獣だけを入れてください。' : '合成魔獣は特殊デッキに入れてください。';
      if (!errors.includes(error)) errors.push(error);
    }
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const [id, count] of counts) if (count > DECK_COPY_LIMIT) errors.push(`${getCard(id).name}は${DECK_COPY_LIMIT}枚までです（現在${count}枚）。`);
  return { valid: errors.length === 0, errors };
}
export const validateDeck = ids => validateCardList(ids, DECK_SIZE, ['beast', 'miracle', 'gimmick'], 'メインデッキ');
export const validateSpecialDeck = ids => validateCardList(ids, SPECIAL_DECK_SIZE, ['fusion'], '特殊デッキ');

const STARTER_INFO = [
  ['star-crown', '星冠の契約', '守護と結界で、星冠竜へつなぐ', '守護の魔獣と結界でハートポイントを守り、星冠竜 アストレイアと共に攻め返す。迷ったらこのデッキから。'],
  ['azure-memory', '蒼海の記憶', '手札を整え、波を味方に', '海詠鯨 ネレシアが手札を補充。豊富な選択肢で相手の攻勢を受け流す。'],
  ['crimson-pulse', '紅炎の鼓動', '烈火と速攻で、一気に攻める', '速攻の魔獣とハートポイントへの火力が主役。焔帝狼 ヴェルガで最後の一撃を狙う。'],
  ['sky-promise', '風嵐の約束', '速さと手数で、先手を取る', '小さな魔獣で道を開き、空翔鷹 シルファが追撃。軽快な展開を楽しめる。'],
  ['verdant-pact', '翠樹の盟約', '癒やし、育てる、生命の連携', '回復と魔獣強化で盤面を維持。森霊鹿 フィオリアと長い勝負を制する。'],
  ['crystal-oath', '地晶の誓約', '揺るがない砦から攻勢に出る', '高守備力の守護と結界で耐える。晶砦亀 バサルガが戦線を支える堅守型。'],
  ['moon-shadow', '宵闇の密約', '吸収と奇襲で、形勢を変える', '月影豹 ノクシアの吸収と伏せた罠が切り札。相手の攻撃を逆転のきっかけに。'],
  ['aether-future', '霊機の共鳴', '知恵を重ね、連携を組み上げる', 'ドローで手札を回し、霊機兵 オルフェンで味方を一斉強化。展開を重視する。'],
];

// Keep historical presets available to restored saves and authored campaign opponents.
export const DECK_PRESETS = Object.freeze(CARD_SERIES.map((element, e) => {
  const b = local => idFor('B', e * 64 + local);
  const m = local => idFor('M', e * 32 + local);
  const g = local => idFor('G', e * 32 + local);
  // The water starter needs a guard to protect its draw engines and a threat
  // that can convert that hand advantage into pressure. Saved decks are never
  // rewritten; only a newly chosen/purchased preset uses these four cards.
  const beastLocals = e === 1 ? [1, 2, 6, 11, 16, 18, 24] : [1, 2, 8, 11, 16, 19, 24];
  const ids = beastLocals.flatMap(n => [b(n), b(n)]).concat(b(0), b(47));
  // Low-cost answers, one draw tool, and a faction-flavoured second-rank option.
  const themeSpell = [5, 2, 0, 4, 7, 5, 6, 3][e];
  for (const local of [0, 3, 8 + themeSpell]) ids.push(m(local), m(local));
  ids.push(FUSION_CARD_ID, FUSION_CARD_ID);
  // Every starter follows the requested 16 beasts / 8 miracles / 8 gimmicks.
  ids.push(g(0), g(0));
  for (const local of [1, 2, 3]) ids.push(g(local), g(local));
  const [id, name, subtitle, description] = STARTER_INFO[e];
  const specialIds = [0, 4, 8, 12].map(local => idFor('F', e * 16 + local));
  return Object.freeze({ id, name, subtitle, description, series: element.id, element: ORIGIN_MAP[element.id], origin: ORIGIN_MAP[element.id], ids: Object.freeze(ids), specialIds: Object.freeze(specialIds) });
}));

/** The four starter packs offered to new players and selectable in free practice. */
export const STARTER_DECKS = Object.freeze(DECK_PRESETS.slice(0, 4));
export const EXPANSION_DECKS=makeExpansionRecipes(CARDS,STARTER_DECKS);
const expansionDeckById=new Map(EXPANSION_DECKS.map(deck=>[deck.id,deck]));
export const getExpansionDeck=id=>expansionDeckById.get(id);
const deckPresetById = new Map([...DECK_PRESETS,...EXPANSION_DECKS,PREMIUM_DECK].map(deck => [deck.id, deck]));
export const getDeckPreset = id => deckPresetById.get(id);

export const CATALOG_VERSION = 6;
