import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_DECKS, ELEMENTS, validateDeck, validateSpecialDeck } from '../catalog.js';
import { newGame } from '../engine.js';
import { soloView } from '../mode-views.js';
import {
  CAMPAIGN_CHAPTERS, CAMPAIGN_BATTLES, CAMPAIGN_TOTAL_BATTLES,
  createCampaignProgress, normalizeCampaignProgress, getCampaignBattle,
  isCampaignBattleUnlocked, getNextCampaignBattle, recordCampaignResult,
} from '../campaign.js';

const first = CAMPAIGN_BATTLES[0];
const second = CAMPAIGN_BATTLES[1];

test('all ten chapters contain two playable battles using real 32 + 4 decks and CPU levels', () => {
  assert.equal(CAMPAIGN_CHAPTERS.length, 10);
  assert.equal(CAMPAIGN_TOTAL_BATTLES, 20);
  assert.equal(CAMPAIGN_BATTLES.length, 20);
  assert.equal(new Set(CAMPAIGN_BATTLES.map(battle => battle.id)).size, 20);
  assert.equal(new Set(CAMPAIGN_BATTLES.map(battle => battle.title)).size, 20);
  assert.equal(new Set(CAMPAIGN_BATTLES.map(battle => battle.opponentName)).size, 20);
  assert.equal(new Set(CAMPAIGN_BATTLES.map(battle => battle.cpuDeckId)).size, 8);
  assert.ok(Object.isFrozen(CAMPAIGN_CHAPTERS));
  assert.ok(Object.isFrozen(CAMPAIGN_BATTLES));
  const deckMap = new Map(STARTER_DECKS.map(deck => [deck.id, deck]));
  const player = STARTER_DECKS[0];
  for (const [chapterIndex, chapter] of CAMPAIGN_CHAPTERS.entries()) {
    assert.equal(chapter.number, chapterIndex + 1);
    assert.equal(chapter.battles.length, 2);
    assert.ok(chapter.title && chapter.description);
    assert.ok(Object.isFrozen(chapter.battles));
    for (const [roundIndex, battle] of chapter.battles.entries()) {
      assert.equal(battle.chapter, chapterIndex + 1);
      assert.equal(battle.round, roundIndex + 1);
      assert.equal(battle.index, chapterIndex * 2 + roundIndex);
      assert.equal(getCampaignBattle(battle.id), battle);
      assert.ok(Object.isFrozen(battle));
      assert.ok(['easy', 'normal', 'hard'].includes(battle.difficulty));
      const cpu = deckMap.get(battle.cpuDeckId);
      assert.ok(cpu, `${battle.id} has a real opponent deck`);
      assert.equal(validateDeck(cpu.ids).valid, true);
      assert.equal(validateSpecialDeck(cpu.specialIds).valid, true);
      const game = newGame({ playerDeck: player.ids, playerSpecialDeck: player.specialIds, cpuDeck: cpu.ids, cpuSpecialDeck: cpu.specialIds, difficulty: battle.difficulty, seed: 3100 + battle.index });
      assert.equal(game.players[1].deck.length + game.players[1].hand.length, 32);
      assert.equal(game.players[1].special.length, 4);
      assert.equal(game.players[1].core, 5000);
    }
  }
  assert.equal(CAMPAIGN_BATTLES[0].difficulty, 'easy');
  assert.equal(CAMPAIGN_BATTLES.at(-1).difficulty, 'hard');
  assert.equal(getCampaignBattle(undefined), undefined);
});

test('only a win advances; losses, draws and surrender allow a new attempt without mutating input', () => {
  let progress = createCampaignProgress();
  assert.equal(getNextCampaignBattle(progress), first);
  assert.equal(isCampaignBattleUnlocked(progress, first.id), true);
  assert.equal(isCampaignBattleUnlocked(progress, second.id), false);
  assert.equal(isCampaignBattleUnlocked(progress, 'unknown'), false);
  for (const result of ['loss', 'draw', 'surrender']) {
    const before = structuredClone(progress);
    const update = recordCampaignResult(progress, { battleId: first.id, matchId: `attempt-${result}`, result });
    assert.deepEqual(progress, before);
    assert.equal(update.recorded, true);
    assert.equal(update.advanced, false);
    assert.equal(update.nextBattle, first);
    assert.equal(update.complete, false);
    assert.deepEqual(update.progress.clearedBattleIds, []);
    progress = update.progress;
  }
  const win = recordCampaignResult(progress, { battleId: first.id, matchId: 'first-victory', result: 'win' });
  assert.equal(win.advanced, true);
  assert.equal(win.nextBattle, second);
  assert.deepEqual(win.progress.clearedBattleIds, [first.id]);
  assert.equal(win.progress.results.length, 4);
  assert.equal(isCampaignBattleUnlocked(win.progress, first.id), true);
  assert.equal(isCampaignBattleUnlocked(win.progress, second.id), true);
  assert.equal(isCampaignBattleUnlocked(win.progress, CAMPAIGN_BATTLES[2].id), false);
});

test('repeated match IDs cannot grant another clear, change a past loss, or count for another battle', () => {
  const lost = recordCampaignResult(createCampaignProgress(), { battleId: first.id, matchId: 'one-match', result: 'loss' });
  const repeated = recordCampaignResult(lost.progress, { battleId: first.id, matchId: 'one-match', result: 'win' });
  assert.equal(repeated.recorded, false);
  assert.equal(repeated.advanced, false);
  assert.deepEqual(repeated.progress, lost.progress);
  const won = recordCampaignResult(repeated.progress, { battleId: first.id, matchId: 'second-match', result: 'win' });
  const duplicate = recordCampaignResult(won.progress, { battleId: first.id, matchId: 'second-match', result: 'win' });
  assert.equal(duplicate.recorded, false);
  assert.deepEqual(duplicate.progress, won.progress);
  const reused = recordCampaignResult(won.progress, { battleId: second.id, matchId: 'second-match', result: 'win' });
  assert.equal(reused.recorded, false);
  assert.deepEqual(reused.progress.clearedBattleIds, [first.id]);
  const locked = recordCampaignResult(createCampaignProgress(), { battleId: second.id, matchId: 'skipped-first', result: 'win' });
  assert.equal(locked.recorded, false);
  assert.deepEqual(locked.progress.results, []);
});

test('twenty sequential wins survive JSON save/load and all completed battles remain replayable', () => {
  let progress = createCampaignProgress();
  for (const [index, battle] of CAMPAIGN_BATTLES.entries()) {
    assert.equal(getNextCampaignBattle(progress), battle);
    const update = recordCampaignResult(progress, { battleId: battle.id, matchId: `saved-match-${index}`, result: 'win' });
    assert.equal(update.recorded, true);
    assert.equal(update.advanced, true);
    assert.equal(update.progress.clearedBattleIds.length, index + 1);
    assert.equal(update.complete, index === 19);
    progress = normalizeCampaignProgress(JSON.parse(JSON.stringify(update.progress)));
    assert.deepEqual(progress, update.progress);
  }
  assert.equal(getNextCampaignBattle(progress), null);
  assert.ok(CAMPAIGN_BATTLES.every(battle => isCampaignBattleUnlocked(progress, battle.id)));
  const replay = recordCampaignResult(progress, { battleId: first.id, matchId: 'replay-first', result: 'win' });
  assert.equal(replay.recorded, true);
  assert.equal(replay.advanced, false);
  assert.equal(replay.complete, true);
  assert.equal(replay.nextBattle, null);
  assert.equal(replay.progress.clearedBattleIds.length, 20);
  assert.equal(replay.progress.results.length, 21);
  const replayLoss = recordCampaignResult(replay.progress, { battleId: first.id, matchId: 'replay-loss', result: 'loss' });
  assert.deepEqual(replayLoss.progress.clearedBattleIds, progress.clearedBattleIds);
});

test('restoring malformed progress drops invalid data and cannot leave gaps in the chapter sequence', () => {
  const raw = {
    version: 99,
    clearedBattleIds: [first.id, first.id, CAMPAIGN_BATTLES[3].id, 'missing'],
    results: [null, { matchId: 'ok', battleId: first.id, result: 'win' }, { matchId: 'ok', battleId: second.id, result: 'win' }, { matchId: '', battleId: first.id, result: 'win' }, { matchId: 'bad-result', battleId: first.id, result: 'unknown' }, { matchId: 'bad-id', battleId: 'missing', result: 'win' }],
  };
  const copy = structuredClone(raw);
  const restored = normalizeCampaignProgress(raw);
  assert.deepEqual(restored.clearedBattleIds, [first.id]);
  assert.deepEqual(restored.results, [{ matchId: 'ok', battleId: first.id, result: 'win' }]);
  assert.deepEqual(raw, copy);
  for (const invalid of [undefined, null, [], 'progress', 23]) assert.deepEqual(normalizeCampaignProgress(invalid), createCampaignProgress());
  assert.equal(recordCampaignResult(restored).recorded, false);
  assert.equal(recordCampaignResult(restored, { battleId: second.id, matchId: '  ', result: 'win' }).recorded, false);
});

test('solo screen exposes twenty ordered selections with locks, the selected encounter, and a separate practice mode', () => {
  const starter = STARTER_DECKS[0];
  const props = { data: { deckName: '<試練&契約>', deckIds: starter.ids, specialIds: starter.specialIds }, STARTER_DECKS, elementMap: Object.fromEntries(ELEMENTS.map(element => [element.id, element])), icon: () => '<svg></svg>' };
  const initial = soloView(props);
  assert.equal((initial.match(/data-action="campaign-select"/g) || []).length, 20);
  assert.equal((initial.match(/class="campaign-chapter(?:[ "])/g) || []).length, 10);
  assert.equal((initial.match(/aria-label="第\d+章 第[12]回戦 [^"]+" disabled/g) || []).length, 19);
  assert.match(initial, new RegExp(`data-action="campaign-start" data-battle="${first.id}">`));
  assert.match(initial, /data-action="start-game"/);
  assert.match(initial, /章の進行には影響しません/);
  assert.match(initial, /&lt;試練&amp;契約&gt;/);
  const won = recordCampaignResult(createCampaignProgress(), { battleId: first.id, matchId: 'view-win', result: 'win' });
  const secondView = soloView({ ...props, campaignProgress: won.progress, campaignBattleId: second.id });
  assert.match(secondView, new RegExp(`data-action="campaign-start" data-battle="${second.id}">`));
  assert.match(secondView, /花冠のミレイ/);
  assert.match(secondView, /aria-valuenow="1"/);
  const replay = soloView({ ...props, campaignProgress: won.progress, campaignBattleId: first.id });
  assert.match(replay, /もう一度、挑戦する/);
  const invalidDeck = soloView({ ...props, data: { ...props.data, specialIds: [] } });
  assert.match(invalidDeck, new RegExp(`data-action="campaign-start" data-battle="${first.id}" disabled`));
  const lockedSelection = soloView({ ...props, campaignBattleId: CAMPAIGN_BATTLES.at(-1).id });
  assert.match(lockedSelection, new RegExp(`data-action="campaign-start" data-battle="${first.id}">`));
});
