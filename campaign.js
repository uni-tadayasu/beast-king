/** Twenty fixed solo battles. Progress is JSON-safe and independent of the UI. */
export const CAMPAIGN_VERSION = 1;
export const CAMPAIGN_CHAPTER_COUNT = 10;
export const CAMPAIGN_ROUNDS_PER_CHAPTER = 2;
export const CAMPAIGN_TOTAL_BATTLES = 20;

const chapterDefinitions = [
  {
    title: '山門の目覚め', description: '山と花の守り手を訪ね、攻める一手と守る一手を確かめる。',
    battles: [
      { title: '石門の番人', description: '守備力を見極め、越えられる相手から道を開こう。', opponentName: '石門のロウ', cpuDeckId: 'crystal-oath', difficulty: 'easy' },
      { title: '花冠の導き', description: '守護の魔獣を突破し、ハートポイントへの一撃を狙おう。', opponentName: '花冠のミレイ', cpuDeckId: 'star-crown', difficulty: 'easy' },
    ],
  },
  {
    title: '鏡川を渡る者', description: '流れゆく川としなやかな草。移り変わる盤面に、次の一手を選ぶ。',
    battles: [
      { title: '水面にひそむ記憶', description: '手札を補う相手に、魔獣とミラクルを組み合わせて挑もう。', opponentName: '渡し守のセナ', cpuDeckId: 'azure-memory', difficulty: 'easy' },
      { title: '草原を駆ける約束', description: '素早く展開する魔獣たちを、守りと攻めで受け止めよう。', opponentName: '草笛のリク', cpuDeckId: 'sky-promise', difficulty: 'easy' },
    ],
  },
  {
    title: '芽吹きの試練', description: '種に眠る熱と木々の生命。異なる二つの戦略に向き合う。',
    battles: [
      { title: '種火の鼓動', description: '速攻とダメージに備え、ハートポイントを守りながら攻めよう。', opponentName: '種火のアカネ', cpuDeckId: 'crimson-pulse', difficulty: 'easy' },
      { title: '古樹との盟約', description: '回復と強化が重なる前に、攻めどころをつかもう。', opponentName: '樹守のイオ', cpuDeckId: 'verdant-pact', difficulty: 'normal' },
    ],
  },
  {
    title: '宵闇の回廊', description: '見えているカードだけでは読めない、仕掛けと連携の試練。',
    battles: [
      { title: '月影の密約', description: '伏せられたギミックを意識し、攻撃の順番を考えよう。', opponentName: '月影のシオン', cpuDeckId: 'moon-shadow', difficulty: 'normal' },
      { title: '霊機の応答', description: '魔獣が並ぶ前に切り込み、相手の連携を崩そう。', opponentName: '機律師のトワ', cpuDeckId: 'aether-future', difficulty: 'normal' },
    ],
  },
  {
    title: '砕けぬ誓い', description: '堅い守りと鋭い攻め。二つの壁を、自分のデッキで越えてゆく。',
    battles: [
      { title: '晶砦の試問', description: '高い守備力に対し、強化と合成召喚で突破口を作ろう。', opponentName: '晶砦のダグ', cpuDeckId: 'crystal-oath', difficulty: 'normal' },
      { title: '紅炎の返礼', description: '速さに押し切られないよう、盤面とハートポイントを整えよう。', opponentName: '焔使いのカイ', cpuDeckId: 'crimson-pulse', difficulty: 'normal' },
    ],
  },
  {
    title: '巡る命の庭', description: '長い勝負を支える回復と補給。限られたカードを、勝ち筋につなぐ。',
    battles: [
      { title: '翠庭の再生', description: '回復を重ねる相手へ、まとまった攻撃を届けよう。', opponentName: '翠庭のネリ', cpuDeckId: 'verdant-pact', difficulty: 'normal' },
      { title: '蒼流の継承', description: '相手の選択肢が増えても、攻める機会を見失わないように。', opponentName: '水鏡のルカ', cpuDeckId: 'azure-memory', difficulty: 'normal' },
    ],
  },
  {
    title: '風の塔の共鳴', description: '連続する展開を読み解き、いよいよ覇王の強さに挑む。',
    battles: [
      { title: '塔へ続く追い風', description: '軽い魔獣の連携を受け止め、次のターンの主導権を取ろう。', opponentName: '風読みのハル', cpuDeckId: 'sky-promise', difficulty: 'normal' },
      { title: '天頂の調律', description: '強化される魔獣たちを見極め、相手の要を狙おう。', opponentName: '調律師のレイ', cpuDeckId: 'aether-future', difficulty: 'hard' },
    ],
  },
  {
    title: '影を越える花', description: '逆転の仕掛けと揺るがない守り。磨いてきた判断が問われる。',
    battles: [
      { title: '夜渡りの駆け引き', description: '吸収と反射に備え、攻撃する魔獣と順番を選ぼう。', opponentName: '夜渡りのユラ', cpuDeckId: 'moon-shadow', difficulty: 'hard' },
      { title: '星花の守護者', description: '結界と守護を越え、勝利につながる一手を重ねよう。', opponentName: '星花のエルナ', cpuDeckId: 'star-crown', difficulty: 'hard' },
    ],
  },
  {
    title: '六源の関門', description: '王冠へ続く最後の関門。蓄えた力と慎重な一手で扉を開く。',
    battles: [
      { title: '不動の門衛', description: '合成魔獣も使いこなし、守りの厚い戦線を崩そう。', opponentName: '門衛長のオウガ', cpuDeckId: 'crystal-oath', difficulty: 'hard' },
      { title: '静寂の審判', description: '仕掛けを読みながら、相手に逆転の隙を与えず進もう。', opponentName: '審判者のリゼ', cpuDeckId: 'moon-shadow', difficulty: 'hard' },
    ],
  },
  {
    title: '王冠のその先', description: '二十の戦いが、一つの戦略になる。あなたの36枚で最後の試練へ。',
    battles: [
      { title: '王座を守る共鳴', description: '連携と全体強化を越えて、王座へ続く道を切り開こう。', opponentName: '王座のアーク', cpuDeckId: 'aether-future', difficulty: 'hard' },
      { title: '星冠との決戦', description: '守りと反撃の機会を見極め、最後のハートポイントを削り切ろう。', opponentName: '星冠王アステル', cpuDeckId: 'star-crown', difficulty: 'hard' },
    ],
  },
];

export const CAMPAIGN_CHAPTERS = Object.freeze(chapterDefinitions.map((chapter, chapterIndex) => {
  const number = chapterIndex + 1;
  const id = `chapter-${String(number).padStart(2, '0')}`;
  const battles = Object.freeze(chapter.battles.map((battle, roundIndex) => Object.freeze({
    ...battle,
    id: `${id}-round-${roundIndex + 1}`,
    chapter: number,
    chapterId: id,
    chapterTitle: chapter.title,
    round: roundIndex + 1,
    index: chapterIndex * CAMPAIGN_ROUNDS_PER_CHAPTER + roundIndex,
  })));
  return Object.freeze({ id, number, title: chapter.title, description: chapter.description, battles });
}));

export const CAMPAIGN_BATTLES = Object.freeze(CAMPAIGN_CHAPTERS.flatMap(chapter => chapter.battles));
const battleById = new Map(CAMPAIGN_BATTLES.map(battle => [battle.id, battle]));
const resultTypes = new Set(['win', 'loss', 'draw', 'surrender']);

/** A fresh progress value for local storage or backup export. */
export function createCampaignProgress() {
  return { version: CAMPAIGN_VERSION, clearedBattleIds: [], results: [] };
}

export function getCampaignBattle(id) {
  return battleById.get(id);
}

/** Accept only a contiguous sequence of clears, so later chapters cannot skip prerequisites. */
export function normalizeCampaignProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createCampaignProgress();
  const suppliedClears = new Set(Array.isArray(raw.clearedBattleIds) ? raw.clearedBattleIds : []);
  const clearedBattleIds = [];
  for (const battle of CAMPAIGN_BATTLES) {
    if (!suppliedClears.has(battle.id)) break;
    clearedBattleIds.push(battle.id);
  }
  const seenMatches = new Set();
  const results = [];
  for (const entry of Array.isArray(raw.results) ? raw.results : []) {
    if (!entry || typeof entry !== 'object' || typeof entry.matchId !== 'string' || !entry.matchId.trim() || entry.matchId.length > 200 || !battleById.has(entry.battleId) || !resultTypes.has(entry.result) || seenMatches.has(entry.matchId)) continue;
    seenMatches.add(entry.matchId);
    results.push({ matchId: entry.matchId, battleId: entry.battleId, result: entry.result });
  }
  return { version: CAMPAIGN_VERSION, clearedBattleIds, results };
}

/** Cleared battles remain playable; the first uncleared battle is also unlocked. */
export function isCampaignBattleUnlocked(progress, id) {
  const battle = getCampaignBattle(id);
  return !!battle && battle.index <= normalizeCampaignProgress(progress).clearedBattleIds.length;
}

export function getNextCampaignBattle(progress) {
  return CAMPAIGN_BATTLES[normalizeCampaignProgress(progress).clearedBattleIds.length] || null;
}

/**
 * Pure, idempotent result recording. Repeated match IDs never change progress.
 * Losses, draws and surrender are recorded but do not unlock the next battle.
 */
export function recordCampaignResult(raw, { battleId, matchId, result } = {}) {
  const progress = normalizeCampaignProgress(raw);
  const battle = getCampaignBattle(battleId);
  const resultView = (recorded, advanced) => ({
    progress,
    recorded,
    advanced,
    nextBattle: CAMPAIGN_BATTLES[progress.clearedBattleIds.length] || null,
    complete: progress.clearedBattleIds.length === CAMPAIGN_TOTAL_BATTLES,
  });
  if (!battle || typeof matchId !== 'string' || !matchId.trim() || matchId.length > 200 || !resultTypes.has(result)) return resultView(false, false);
  if (battle.index > progress.clearedBattleIds.length || progress.results.some(entry => entry.matchId === matchId)) return resultView(false, false);
  progress.results.push({ matchId, battleId, result });
  const advanced = result === 'win' && battle.index === progress.clearedBattleIds.length;
  if (advanced) progress.clearedBattleIds.push(battle.id);
  return resultView(true, advanced);
}
