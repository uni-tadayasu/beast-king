import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSummons, summonChanges} from '../summon-scene.js';

const unit = (uid, cardId = 'B0001', values = {}) => ({uid, cardId, hp: 300, maxHp: 300, attack: 200, ready: true, ...values});
const game = (own = [], enemy = [], logs = []) => ({active: 0, turn: 1, winner: null,
  log: logs, players: [{core: 5000, field: own}, {core: 5000, field: enemy}]});
const event = (type, text = type, turn = 1) => ({type, text, turn});

test('summon snapshots retain only revealed field data, detached from all game mutations', () => {
  const source = game([unit('u1')], [unit('u2', 'B0257')], [event('set', 'ギミックを設置')]);
  for (const player of source.players) Object.assign(player, {
    hand: ['PRIVATE-HAND'], deck: ['PRIVATE-DECK'], special: ['PRIVATE-SPECIAL'],
    traps: [{cardId: 'PRIVATE-TRAP'}], token: 'PRIVATE-TOKEN',
  });
  Object.assign(source.players[1].field[0], {artwork: 'PRIVATE-ART', secret: 'PRIVATE-UNIT'});
  const original = JSON.stringify(source), snapshot = snapshotSummons(source), json = JSON.stringify(snapshot);
  assert.equal(JSON.stringify(source), original, 'snapshot does not modify the game');
  assert.equal(json.includes('PRIVATE-'), false, 'no hidden zones, credentials or private artwork enter snapshots');
  source.players[0].field[0].hp = 12;
  source.players[1].field.splice(0);
  source.log[0].text = 'changed';
  assert.equal(JSON.stringify(snapshot), json, 'retained snapshots are immutable with respect to live game changes');
});

test('both owners can have the same UID or same card without merging their summon identities', () => {
  const before = snapshotSummons(game([unit('shared')], [unit('shared')]));
  assert.deepEqual(before.units.map(value => value.key), ['0:shared', '1:shared']);
  const after = snapshotSummons(game([unit('shared')], [unit('shared', 'B0001', {ready: false})]));
  assert.deepEqual(summonChanges(before, after), [{key: '1:shared', kind: 'attack'}]);
  const ownTwo = snapshotSummons(game([unit('a'), unit('b')]));
  assert.deepEqual(ownTwo.units.map(value => [value.key, value.cardId]), [['0:a', 'B0001'], ['0:b', 'B0001']]);
});

test('rerendering or compacting empty slots does not summon surviving creatures again', () => {
  const before = snapshotSummons(game([unit('first'), unit('survivor', 'B0002')], [unit('enemy')]));
  assert.deepEqual(summonChanges(before, snapshotSummons(game([unit('first'), unit('survivor', 'B0002')], [unit('enemy')]))), []);
  const after = snapshotSummons(game([unit('survivor', 'B0002')], [unit('enemy')]));
  assert.deepEqual(after.units.map(value => value.key), ['0:survivor', '1:enemy']);
  assert.deepEqual(summonChanges(before, after), [], 'array index shifts never create another summon animation');
  assert.equal(snapshotSummons(game([unit('dead', 'B0001', {hp: 0})])).units.length, 0);
  assert.deepEqual(summonChanges(null, before), [], 'resuming an existing field starts from a quiet baseline');
  assert.deepEqual(summonChanges(before, null), [], 'leaving battle does not queue a final effect');
});

test('new creatures, attacks, damage and restoration are derived from confirmed public changes', () => {
  const before = snapshotSummons(game([unit('attack'), unit('damage'), unit('heal')], [unit('replace')]));
  const after = snapshotSummons(game([
    unit('attack', 'B0001', {ready: false}),
    unit('damage', 'B0001', {hp: 200}),
    unit('heal', 'B0001', {hp: 400, maxHp: 400, attack: 300}),
    unit('new', 'B0003'),
  ], [unit('replace', 'F0001')]));
  assert.deepEqual(summonChanges(before, after), [
    {key: '0:attack', kind: 'attack'},
    {key: '0:damage', kind: 'damage'},
    {key: '0:heal', kind: 'heal'},
    {key: '0:new', kind: 'summon'},
    {key: '1:replace', kind: 'summon'},
  ]);
  const noAttack = snapshotSummons(game([unit('waiting', 'B0001', {ready: false})]));
  assert.deepEqual(summonChanges(noAttack, snapshotSummons(game([unit('waiting')]))), [], 'turn readiness never pretends to be an attack');
});

test('only newly public spell activations glow, including after history rollover', () => {
  const history = Array.from({length: 280}, (_, index) => event('info', 'record-' + index));
  const before = snapshotSummons(game([unit('u1')], [], history));
  assert.equal(before.log.length, 256);
  const after = snapshotSummons(game([unit('u1')], [], [...history.slice(2), event('gimmick', '公開されたギミックが発動')]));
  assert.deepEqual(summonChanges(before, after), [{kind: 'activate'}]);
  assert.deepEqual(summonChanges(after, after), [], 'unchanged polling never replays an activation');
  const setOnly = snapshotSummons(game([unit('u1')], [], [...history, event('set', 'ギミックを1枚設置')]));
  assert.deepEqual(summonChanges(before, setOnly), [], 'a facedown placement does not invent its identity or activation');
});
