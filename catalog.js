/**
 * ビーストキング — The First Chronicle
 * Original, deterministic 1,024-card core set. All rules text corresponds to
 * effects implemented in engine.js; no network, randomized content, or filler IDs.
 */
export const ELEMENTS = Object.freeze([
  { id: 'dawn', name: '星光', color: '#e9c475', glyph: '✦', description: '星を冠する守護者。結界と回復で、揺るがない戦線を築く。' },
  { id: 'tide', name: '蒼海', color: '#72cce8', glyph: '◈', description: '記憶を湛えた深海。手札を整え、静かな波で勝機を引き寄せる。' },
  { id: 'ember', name: '紅炎', color: '#ef8b69', glyph: '✹', description: '消えない心火の眷属。烈火と速攻で、相手のコアを追い詰める。' },
  { id: 'gale', name: '風嵐', color: '#80d3c1', glyph: '❋', description: '空路を駆ける自由な翼。速さと手数で、戦場の流れをつかむ。' },
  { id: 'grove', name: '翠樹', color: '#a9cf7c', glyph: '❧', description: '忘れられた森の盟約。癒やしと強化を重ね、命を大きく育てる。' },
  { id: 'stone', name: '地晶', color: '#d4b18a', glyph: '◇', description: '大地に眠る不動の意志。厚い守護と結界で、敵の攻勢を受け止める。' },
  { id: 'dusk', name: '宵闇', color: '#c4a2e5', glyph: '☾', description: '月の裏側に息づく契約。吸収と奇襲で、失った力を奪い返す。' },
  { id: 'aether', name: '霊機', color: '#99b9f7', glyph: '⌘', description: '想いで動く古代の機構。知恵と連携で、未来の一手を組み上げる。' },
].map(Object.freeze));

export const TYPE_LABELS = Object.freeze({ beast: '魔獣', miracle: 'ミラクル', gimmick: 'ギミック' });
export const RARITY_ORDER = Object.freeze(['N', 'R', 'KR', 'KKR', 'GR', 'GGR']);
export const RARITY_LABELS = Object.freeze({ N: 'ノーマル', R: 'レア', KR: 'キラレア', KKR: 'キラキラレア', GR: 'ギラレア', GGR: 'ギラギラレア' });
export const KEYWORD_LABELS = Object.freeze({ guard: '守護', rush: '速攻', drain: '吸収' });

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
  drain: '吸収：戦闘で実際に与えたダメージ分、自分のコアを回復する。',
};
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const idFor = (prefix, index) => `${prefix}${String(index + 1).padStart(4, '0')}`;
const freezeCard = (card) => Object.freeze({ ...card, effect: Object.freeze(card.effect), keywords: Object.freeze(card.keywords) });
const TIER_RARITIES = Object.freeze(['N', 'N', 'R', 'KR', 'KR', 'KKR', 'GR', 'GGR']);
const rarityForTier = tier => TIER_RARITIES[tier];

function beastText(kind, value, keywords) {
  const rules = {
    none: '召喚時の効果はない。',
    draw: `召喚時、カードを${value}枚引く。手札が4枚に達したら、それ以上は引かない。`,
    heal: `召喚時、自分のコアを${value}回復する。`,
    damage_core: `召喚時、相手のコアに${value}ダメージ。`,
    buff_all: `召喚時、自身を含む味方の魔獣すべての攻撃力を${value}上げる。`,
    shield: `召喚時、自分のコアに結界${value}を加える。結界はコアへのダメージを吸収する。`,
  };
  return [rules[kind], ...keywords.map(k => KEYWORD_TEXT[k])].join(' ');
}

function makeBeasts() {
  const result = [];
  ELEMENTS.forEach((element, e) => {
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
        type: 'beast', element: element.id, cost, rarity: rarityForTier(tier, variant), attack, hp,
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
      result.push(freezeCard(card));
    }
  });
  return result;
}

const MIRACLE_KINDS = ['damage_enemy', 'heal', 'draw', 'buff', 'sweep', 'shield', 'drain', 'renew'];
function miracleStats(kind, rank, element) {
  const extra = (element === 'ember' && kind === 'damage_enemy') || (element === 'grove' && (kind === 'heal' || kind === 'renew')) || (element === 'stone' && kind === 'shield') ? 1 : 0;
  switch (kind) {
    case 'damage_enemy': return { cost: rank + 2, value: rank + 2 + extra };
    case 'heal': return { cost: rank + 1, value: 4 + rank * 2 + extra };
    case 'draw': return { cost: 2 + rank * 2, value: 1 + rank };
    case 'buff': return { cost: 2 + rank * 2, value: 1 + rank };
    case 'sweep': return { cost: 2 + rank * 2, value: 1 + rank };
    case 'shield': return { cost: 1 + rank, value: 3 + rank * 2 + extra };
    case 'drain': return { cost: 2 + rank, value: 1 + rank };
    case 'renew': return { cost: 1 + rank, value: 2 + rank + extra };
  }
}
function miracleText(kind, value) {
  return {
    damage_enemy: `敵の魔獣1体、または相手のコアに${value}ダメージ。`,
    heal: `自分のコアを${value}回復する。コアの上限は30。`,
    draw: `カードを${value}枚引く。手札が4枚に達したら、それ以上は引かない。`,
    buff: `味方の魔獣1体の攻撃力・現在体力・最大体力をそれぞれ${value}上げる。`,
    sweep: `敵の魔獣すべてに${value}ダメージ。`,
    shield: `自分のコアに結界${value}を加える。結界はコアへのダメージを吸収する。`,
    drain: `相手のコアに${value}ダメージ。実際に与えたダメージ分、自分のコアを回復する。`,
    renew: `味方の魔獣すべての体力を${value}回復する。それぞれの最大体力を超えない。`,
  }[kind];
}
function makeMiracles() {
  const result = [];
  ELEMENTS.forEach((element, e) => {
    const realm = REALMS[e];
    for (let rank = 0; rank < 4; rank++) MIRACLE_KINDS.forEach((kind, k) => {
      const index = e * 32 + rank * 8 + k;
      const { cost, value } = miracleStats(kind, rank, element.id);
      result.push(freezeCard({
        id: idFor('M', index), index: 513 + index, name: `${realm.prefixes[rank]}の${realm.miracle[k]}`,
        type: 'miracle', element: element.id, cost, rarity: rank === 3 && k >= 6 ? (k === 6 ? 'GR' : 'GGR') : ['N', 'R', 'KR', 'KKR'][rank], attack: 0, hp: 0,
        effect: { kind, value }, keywords: [], text: miracleText(kind, value),
        flavor: `${element.name}の願いが、一瞬を奇跡に変える。`, art: 16 + (k % 4),
      }));
    });
  });
  return result;
}

const GIMMICK_KINDS = ['ambush', 'barrier', 'spring', 'fountain'];
function gimmickStats(kind, rank, element) {
  const bonus = kind === 'ambush' && element === 'dusk' || kind === 'barrier' && element === 'dawn' ? 1 : 0;
  const value = kind === 'ambush' ? 2 + rank + bonus : kind === 'barrier' ? 3 + rank * 2 + bonus : kind === 'spring' ? 2 + rank * 2 : 4 + rank * 2;
  return { cost: kind === 'spring' ? Math.min(8, 1 + rank) : 1 + rank, value };
}
function gimmickText(kind, value) {
  return {
    ambush: `相手の魔獣が攻撃した時、攻撃した魔獣に${value}ダメージ。倒した場合はその攻撃を止める。発動後、墓地へ送る。`,
    barrier: `自分のコアが攻撃された時、その攻撃のダメージを${value}軽減する。発動後、墓地へ送る。`,
    spring: `次の自分のターン開始時、自分のコアに結界${value}を加える。結界はコアへのダメージを吸収する。発動後、墓地へ送る。`,
    fountain: `次の自分のターン開始時、自分のコアを${value}回復する。発動後、墓地へ送る。`,
  }[kind];
}
function makeGimmicks() {
  const result = [];
  ELEMENTS.forEach((element, e) => {
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

export const CARDS = Object.freeze([...makeBeasts(), ...makeMiracles(), ...makeGimmicks()]);
export const CARD_MAP = new Map(CARDS.map(card => [card.id, card]));
export const getCard = id => CARD_MAP.get(id);
export const DECK_MIN = 32;
export const DECK_MAX = CARDS.length * 3;

export function validateDeck(ids) {
  const errors = [];
  if (!Array.isArray(ids)) return { valid: false, errors: ['デッキの形式が正しくありません。'] };
  if (ids.length < DECK_MIN) errors.push(`デッキには最低${DECK_MIN}枚必要です（現在${ids.length}枚）。`);
  const counts = new Map();
  for (const id of ids) {
    if (typeof id !== 'string' || !CARD_MAP.has(id)) {
      if (!errors.includes('収録されていないカードが含まれています。')) errors.push('収録されていないカードが含まれています。');
      continue;
    }
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const [id, count] of counts) if (count > 3) errors.push(`${getCard(id).name}は3枚までです（現在${count}枚）。`);
  return { valid: errors.length === 0, errors };
}

const STARTER_INFO = [
  ['star-crown', '星冠の契約', '守護と結界で、星冠竜へつなぐ', '守護の魔獣と結界でコアを守り、星冠竜 アストレイアと共に攻め返す。迷ったらこのデッキから。'],
  ['azure-memory', '蒼海の記憶', '手札を整え、波を味方に', '海詠鯨 ネレシアが手札を補充。豊富な選択肢で相手の攻勢を受け流す。'],
  ['crimson-pulse', '紅炎の鼓動', '烈火と速攻で、一気に攻める', '速攻の魔獣とコアへの火力が主役。焔帝狼 ヴェルガで最後の一撃を狙う。'],
  ['sky-promise', '風嵐の約束', '速さと手数で、先手を取る', '小さな魔獣で道を開き、空翔鷹 シルファが追撃。軽快な展開を楽しめる。'],
  ['verdant-pact', '翠樹の盟約', '癒やし、育てる、生命の連携', '回復と魔獣強化で盤面を維持。森霊鹿 フィオリアと長い勝負を制する。'],
  ['crystal-oath', '地晶の誓約', '揺るがない砦から反撃する', '高体力の守護と結界で耐える。晶砦亀 バサルガが戦線を支える堅守型。'],
  ['moon-shadow', '宵闇の密約', '吸収と奇襲で、形勢を変える', '月影豹 ノクシアの吸収と伏せた罠が切り札。相手の攻撃を逆転のきっかけに。'],
  ['aether-future', '霊機の共鳴', '知恵を重ね、連携を組み上げる', 'ドローで手札を回し、霊機兵 オルフェンで味方を一斉強化。展開を重視する。'],
];

export const STARTER_DECKS = Object.freeze(ELEMENTS.map((element, e) => {
  const b = local => idFor('B', e * 64 + local);
  const m = local => idFor('M', e * 32 + local);
  const g = local => idFor('G', e * 32 + local);
  const beastLocals = [1, 2, 8, 11, 16, 19, 24];
  const ids = beastLocals.flatMap(n => [b(n), b(n)]).concat(b(0), b(47));
  // Low-cost answers, one draw tool, and a faction-flavoured second-rank option.
  const themeSpell = [5, 1, 0, 4, 7, 5, 6, 3][e];
  for (const local of [0, 2, 3, 8 + themeSpell]) ids.push(m(local), m(local));
  // Every starter follows the requested 16 beasts / 8 miracles / 8 gimmicks.
  ids.push(g(0), g(0));
  for (const local of [1, 2, 3]) ids.push(g(local), g(local));
  const [id, name, subtitle, description] = STARTER_INFO[e];
  return Object.freeze({ id, name, subtitle, description, element: element.id, ids: Object.freeze(ids) });
}));

export const CATALOG_VERSION = 1;
