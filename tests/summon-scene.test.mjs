import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSummons, summonChanges, createSummonScene} from '../summon-scene.js';

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

test('changing live artwork restores the DOM floor until the replacement texture loads, including after failure', async () => {
  const sources = ['data:image/webp;base64,AAAA', 'data:image/webp;base64,BBBB'];
  const frames = new Map(), images = [], timers = new Map();
  let sequence = 0, now = 1000, background = sources[0];
  const events = {addEventListener() {}, removeEventListener() {}};
  const style = () => {const values = new Map(); return {getPropertyValue: key => values.get(key) || '', setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key)};};
  const rect = (x, y, width, height) => ({x, y, left: x, top: y, right: x + width, bottom: y + height, width, height});
  const rows = [0, 1].map(owner => ({...events, dataset: {owner: String(owner)}, getBoundingClientRect: () => rect(0, owner ? 0 : 220, 800, 220), slots: []}));
  for (const row of rows) {
    row.slots = Array.from({length: 4}, (_, index) => ({dataset: {owner: row.dataset.owner, slot: String(index)}, style: style()}));
    row.querySelectorAll = () => row.slots;
  }
  const slot = rows[0].slots[0], artwork = {}, anchor = {};
  const element = {dataset: {player: '0', uid: 'u1', cardId: 'B0001'}, classList: {contains: () => false},
    querySelector: selector => selector === '.card-art' ? artwork : selector === '.summon-anchor' ? anchor : null, closest: () => slot};
  const arena = {...events, dataset: {}, isConnected: true, clientWidth: 800, clientHeight: 440,
    getBoundingClientRect: () => rect(0, 0, 800, 440), appendChild(canvas) {this.canvas = canvas;},
    querySelectorAll(selector) {
      if (selector.startsWith('.field-unit')) return [element];
      if (selector.startsWith(':scope > .field-row')) return rows;
      if (selector === '[data-camera-placed]') return rows.flatMap(row => row.slots).filter(item => item.dataset.cameraPlaced);
      return [];
    }};
  const document = {...events, baseURI: 'https://www.beast-king.com/', hidden: false, visibilityState: 'visible',
    querySelector: () => arena,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {...events, dataset: {}, width: 0, height: 0, draws: [], setAttribute() {}, remove() {}};
      const context = {setTransform() {}, clearRect() {canvas.draws = [];}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {}, clip() {}, transform() {},
        drawImage(image) {canvas.sourceUrl = image.src || image.sourceUrl; canvas.draws.push(canvas.sourceUrl);},
        getImageData: () => ({width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255)})};
      canvas.getContext = kind => kind === '2d' ? context : null;
      return canvas;
    }};
  const window = {...events, performance: {now: () => now}, devicePixelRatio: 1,
    matchMedia: () => ({...events, matches: false}), getComputedStyle: () => ({backgroundImage: 'url("' + background + '")'}),
    requestAnimationFrame(callback) {const id = ++sequence; frames.set(id, callback); return id;}, cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback) {const id = ++sequence; timers.set(id, callback); return id;}, clearTimeout: id => timers.delete(id),
    Image: class {constructor() {this.naturalWidth = this.naturalHeight = 256; images.push(this);}}};
  const scene = createSummonScene({document, window, getCard: id => ({id, type: 'beast', element: 'river'})});
  const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback(now);
    await new Promise(resolve => setImmediate(resolve));
  };
  try {
    scene.sync(game([unit('u1')]), {motion: false});
    images[0].onload(); await settle();
    assert.equal(slot.dataset.summonFloorReady, 'true');
    assert.ok(arena.canvas.draws.includes(sources[0]), 'the original floor really was drawn');
    assert.equal(slot.dataset.summonState, 'unavailable', 'opaque private art has no invented public silhouette, but its floor remains usable');

    background = sources[1]; scene.refresh(); await settle();
    assert.equal(images.length, 2, 'the live authorized replacement starts a fresh image load');
    assert.equal(slot.dataset.summonFloorReady, undefined, 'the DOM artwork is no longer hidden by the previous source’s ready marker');
    assert.equal(arena.canvas.draws.length, 0, 'the old private texture is not drawn for the new source');

    images[1].onerror(); await settle();
    assert.equal(slot.dataset.summonFloorReady, undefined, 'a failed replacement load leaves its DOM card available');
    assert.equal(slot.dataset.summonState, 'unavailable');

    now += 6000; scene.refresh(); images[2].onload(); await settle();
    assert.equal(slot.dataset.summonFloorReady, 'true', 'readiness returns only after the replacement floor exists');
    assert.ok(arena.canvas.draws.includes(sources[1]));
    assert.equal(arena.canvas.draws.includes(sources[0]), false);
  } finally {scene.destroy();}
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
});
