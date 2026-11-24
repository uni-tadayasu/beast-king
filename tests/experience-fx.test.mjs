import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeViewport, toLayoutPoint, toLayoutRect} from '../orientation.js';
import {
  normalizeExperiencePreferences, soundScore, createExperienceAudio,
  publicBattleSnapshot, freshBattleEvents, battlePresentation,
  createExperienceController,
} from '../experience-fx.js';

function fakeAudio() {
  const calls = {created: 0, resume: 0, closed: 0, voices: [], gains: []};
  const parameter = () => ({value: 0, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }});
  const context = {
    state: 'suspended', currentTime: 0, destination: {},
    resume() { calls.resume++; this.state = 'running'; return Promise.resolve(); },
    close() { calls.closed++; this.state = 'closed'; return Promise.resolve(); },
    createGain() { const node = {gain: parameter(), connect() {}, disconnect() { this.disconnected = true; }}; calls.gains.push(node); return node; },
    createOscillator() {
      const node = {frequency: parameter(), connect() {}, disconnect() { this.disconnected = true; }, start(at) { this.started = at; }, stop(at) { this.stopped = at ?? true; if (at === undefined) this.onended?.(); }};
      calls.voices.push(node); return node;
    },
  };
  return {calls, context, factory() { calls.created++; return context; }};
}

test('effects never initialize audio or replay events until a gesture unlocks audio', () => {
  const fake = fakeAudio();
  const audio = createExperienceAudio({audioContextFactory: fake.factory});
  assert.equal(audio.play('summon'), false);
  assert.equal(fake.calls.created, 0);
  audio.unlock();
  assert.equal(fake.calls.created, 1);
  assert.equal(fake.calls.resume, 1);
  assert.equal(fake.calls.voices.length, 0, 'old sounds are discarded, not queued');
  assert.equal(audio.play('summon'), true);
  assert.equal(fake.calls.voices.length, 4);
  audio.unlock();
  assert.equal(fake.calls.created, 1, 'one persistent audio context');
  audio.destroy();
});

test('mute, zero volume and hidden documents immediately stop existing and future voices', () => {
  const fake = fakeAudio();
  let time = 0;
  const audio = createExperienceAudio({audioContextFactory: fake.factory, now: () => time++ * 100});
  audio.unlock(); audio.play('fusion');
  assert.ok(audio.getState().voices > 0);
  audio.sync({enabled: false});
  assert.equal(audio.getState().voices, 0);
  assert.equal(audio.play('attack'), false);
  assert.ok(fake.calls.voices.every(voice => voice.disconnected));
  audio.sync({enabled: true, volume: 0});
  assert.equal(audio.play('heal'), false);
  audio.sync({volume: .25}); audio.play('heal');
  audio.setVisible(false);
  assert.equal(audio.getState().voices, 0);
  assert.equal(audio.play('victory'), false);
  audio.setVisible(true);
  assert.equal(audio.getState().voices, 0, 'visibility does not replay hidden events');
  audio.destroy();
  assert.equal(fake.calls.closed, 1);
  assert.equal(audio.play('select'), false);
});

test('rapid clicks are deduplicated and a CPU event burst cannot exceed 24 active voices', () => {
  const fake = fakeAudio();
  let time = 100;
  const audio = createExperienceAudio({audioContextFactory: fake.factory, now: () => time});
  audio.unlock();
  assert.equal(audio.play('click'), true);
  assert.equal(audio.play('click'), false);
  for (let i = 0; i < 20; i++) { time += 100; audio.play('fusion'); }
  assert.equal(audio.getState().voices, 24);
  assert.equal(fake.calls.voices.length, 24);
  audio.destroy();
  assert.equal(audio.getState().voices, 0);
});

test('blocked or interrupted audio fails silently and never accumulates stale sounds', () => {
  const fake = fakeAudio();
  fake.context.resume = () => Promise.reject(new Error('blocked'));
  const audio = createExperienceAudio({audioContextFactory: fake.factory});
  assert.equal(audio.unlock(), false);
  assert.equal(audio.play('pack-open'), false);
  fake.context.state = 'running';
  assert.equal(fake.calls.voices.length, 0);
  assert.equal(audio.play('pack-open'), true);
  audio.destroy();
});

test('stored preferences tolerate corruption and all sound envelopes stay short and bounded', () => {
  assert.deepEqual(normalizeExperiencePreferences(null), {enabled: true, volume: .55, motion: true, intensity: 'full'});
  assert.equal(normalizeExperiencePreferences({volume: Infinity}).volume, .55);
  assert.equal(normalizeExperiencePreferences({volume: 8}).volume, 1);
  assert.equal(normalizeExperiencePreferences({volume: -2}).volume, 0);
  assert.equal(normalizeExperiencePreferences({intensity: 'subtle', motion: false}).motion, false);
  for (const kind of ['click', 'nav', 'select', 'close', 'confirm', 'deny', 'summon', 'fusion', 'attack', 'damage', 'destroy', 'heal', 'shield', 'buff', 'miracle', 'gimmick', 'draw', 'turn', 'victory', 'defeat', 'pack-charge', 'pack-open', 'reveal']) {
    const score = soundScore(kind, 'GGR');
    assert.ok(score.length >= 1 && score.length <= 7, kind);
    for (const note of score) {
      assert.ok(note.frequency >= 20 && note.frequency <= 18000, kind);
      assert.ok(note.end >= 20 && note.end <= 18000, kind);
      assert.ok(note.gain > 0 && note.gain <= .12, kind);
      assert.ok(note.delay + note.duration < 2, kind);
    }
  }
  assert.ok(soundScore('reveal', 'GGR').length > soundScore('reveal', 'N').length);
});

test('cyber interface cues are distinct and finish within a quarter second', () => {
  const cues = ['click', 'nav', 'select', 'confirm', 'close', 'deny'].map(kind => soundScore(kind));
  assert.equal(new Set(cues.map(score => JSON.stringify(score))).size, cues.length);
  for (const score of cues) assert.ok(Math.max(...score.map(note => note.delay + note.duration)) <= .25);
  assert.ok(cues[0].some(note => note.end < note.frequency), 'button tick has a falling electronic transient');
  assert.ok(cues[1].some(note => note.end > note.frequency), 'navigation has a rising electronic sweep');
});

const event = (type, text = type, turn = 1) => ({type, text, turn});
test('battle log rollover and unchanged rerenders do not replay old effects', () => {
  const old = Array.from({length: 48}, (_, i) => event('damage', String(i)));
  const next = [...old.slice(3), event('summon'), event('heal'), event('turn', 'new turn', 2)];
  assert.deepEqual(freshBattleEvents(old, old), []);
  assert.deepEqual(freshBattleEvents(old, next), next.slice(-3));
  assert.deepEqual(freshBattleEvents([], [event('summon')]), [event('summon')]);
});

test('one long automated turn retains early fusion and later recovery beats', () => {
  const before = {turn: 3, active: 1, winner: null, log: [event('turn', 'cpu turn', 3)]};
  const log = [...before.log, event('fusion', 'fusion', 3), ...Array.from({length: 75}, (_, i) => event('info', String(i), 3)), event('heal', 'recovery', 3), event('attack', 'attack', 3)];
  const game = {turn: 4, active: 0, winner: null, players: [{field: []}, {field: []}], log};
  const after = publicBattleSnapshot(game), beats = battlePresentation(before, after);
  assert.ok(beats.some(beat => beat.kind === 'fusion'));
  assert.ok(beats.some(beat => beat.kind === 'heal'));
  assert.ok(beats.some(beat => beat.kind === 'turn'));
});

test('the effects snapshot excludes every private zone and detaches from live game mutations', () => {
  const player = {core: 5000, shield: 0, hand: ['SECRET-HAND'], deck: ['SECRET-DECK'], special: ['SECRET-SPECIAL'], traps: [{cardId: 'SECRET-TRAP'}], field: [{uid: 'u1', cardId: 'B0001', attack: 100, hp: 300, private: 'secret'}]};
  const game = {turn: 1, active: 0, winner: null, players: [player, player], log: [event('set', 'ギミックを設置')]};
  const snapshot = publicBattleSnapshot(game);
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET|private/);
  player.field[0].hp = 0;
  assert.equal(snapshot.players[0].field[0].hp, 300);
  assert.equal(publicBattleSnapshot(null), null);
});

test('battle presentation coalesces CPU bursts while retaining turn and result; fusion is not double-announced', () => {
  const before = {turn: 1, active: 0, winner: null, log: [event('start')]};
  const after = {turn: 2, active: 1, winner: 0, log: [event('start'), ...['miracle', 'fusion', 'summon', 'attack', 'damage', 'destroy', 'heal', 'buff', 'shield', 'draw', 'result'].map(kind => event(kind))]};
  const result = battlePresentation(before, after);
  assert.ok(result.length <= 7);
  assert.equal(result.filter(item => item.kind === 'fusion').length, 1);
  assert.equal(result.some(item => item.kind === 'miracle' || item.kind === 'summon'), false);
  assert.deepEqual(result.slice(-2), [{kind: 'turn', player: 1}, {kind: 'victory'}]);
  assert.deepEqual(battlePresentation(after, after), []);
});

class FakeElement extends EventTarget {
  constructor(tag, doc) { super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.dataset = {}; this.attributes = new Map(); this.style = {setProperty() {}}; this.classList = {add() {}}; this.isConnected = false; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; node.isConnected = true; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  focus() { this.doc.activeElement = this; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
function presentationSetup({reducedMotion = false, rotated = false, audio = null} = {}) {
  const doc = new EventTarget(), win = new EventTarget(), pending = new Map(), stored = new Map();
  let nextTimer = 0;
  doc.hidden = false; doc.visibilityState = 'visible';
  doc.documentElement = {dataset: {}};
  doc.body = new FakeElement('body', doc); doc.body.isConnected = true;
  doc.createElement = tag => new FakeElement(tag, doc);
  doc.querySelector = () => null; doc.querySelectorAll = () => [];
  doc.activeElement = new FakeElement('button', doc); doc.activeElement.isConnected = true;
  win.innerWidth = 1280; win.innerHeight = 720;
  if (audio) win.AudioContext = function() { return audio.factory(); };
  if (rotated) {
    const viewport = landscapeViewport({physicalWidth: 390, physicalHeight: 844, mobile: true});
    const stage = new FakeElement('div', doc); doc.body.appendChild(stage);
    win.innerWidth = 390; win.innerHeight = 844;
    win.BeastKingViewport = {stage, get: () => viewport, toLocalPoint: point => toLayoutPoint(point, viewport), toLocalRect: rect => toLayoutRect(rect, viewport)};
  }
  win.matchMedia = () => Object.assign(new EventTarget(), {matches: reducedMotion});
  win.setTimeout = fn => { const id = ++nextTimer; pending.set(id, fn); return id; };
  win.clearTimeout = id => pending.delete(id);
  const controller = createExperienceController({document: doc, window: win, storage: {getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value)}});
  return {doc, win, controller, pending, flush() { for (const [id, fn] of [...pending]) { pending.delete(id); fn(); } }};
}

// Minimal semantic controls for delegated-event tests. Their real click/change
// order is dispatched against the controller, including explicit app outcomes.
function feedbackControl(doc, {tag = 'button', action = '', type = '', role = '', disabled = false, inert = false, demo = false} = {}) {
  const control = new FakeElement(tag, doc);
  control.dataset.action = action; control.type = type; control.disabled = disabled;
  if (role) control.setAttribute('role', role);
  if (demo) control.setAttribute('data-experience-demo', '');
  control.getAttribute = key => control.attributes.get(key) ?? null;
  control.matches = selector => selector.split(',').some(part => {
    const value = part.trim();
    if (value === ':disabled') return disabled;
    if (value === 'select') return tag === 'select';
    if (value === '[data-experience-demo]') return demo;
    if (value === 'input[type="checkbox"]') return tag === 'input' && type === 'checkbox';
    if (value === 'input[type="radio"]') return tag === 'input' && type === 'radio';
    return false;
  });
  control.closest = selector => selector.startsWith('button,') ? control : selector.includes('[inert]') && inert ? control : null;
  return control;
}
function dispatchControl(doc, type, control, {trusted = true, detail = 1} = {}) {
  const event = new Event(type);
  Object.defineProperties(event, {target: {value: control}, isTrusted: {value: trusted}, detail: {value: detail}});
  doc.dispatchEvent(event);
}

test('keyboard and touch activation each play one cyber control cue, with no hover or render audio', async () => {
  for (const keyboard of [false, true]) {
    const audio = fakeAudio(), {doc, controller} = presentationSetup({audio});
    const control = feedbackControl(doc, {action: 'detail'});
    controller.screen('home');
    dispatchControl(doc, 'pointerover', control);
    assert.equal(audio.calls.created, 0);
    if (!keyboard) dispatchControl(doc, 'pointerdown', control);
    dispatchControl(doc, 'click', control, {detail: keyboard ? 0 : 1});
    await Promise.resolve();
    assert.equal(audio.calls.created, 1, 'trusted activation unlocks the shared effect context');
    assert.equal(audio.calls.voices.length, soundScore('select').length);
    controller.destroy();
  }
});

test('native checkbox click/change is announced once and synchronous outcomes replace the generic click', async () => {
  const audio = fakeAudio(), {doc, controller} = presentationSetup({audio});
  const checkbox = feedbackControl(doc, {tag: 'input', type: 'checkbox'});
  dispatchControl(doc, 'click', checkbox);
  dispatchControl(doc, 'change', checkbox);
  await Promise.resolve();
  assert.equal(audio.calls.voices.length, soundScore('select').length);
  const before = audio.calls.voices.length;
  dispatchControl(doc, 'click', feedbackControl(doc, {action: 'deck-save'}));
  controller.sound('play');
  await Promise.resolve();
  assert.equal(audio.calls.voices.length - before, soundScore('play').length, 'one save must not also play a confirm chime');
  controller.destroy();
});

test('disabled, inert, decorative and synthetic controls are silent, including the sound OFF button', async () => {
  const audio = fakeAudio(), {doc, controller} = presentationSetup({audio});
  controller.unlock();
  for (const options of [{disabled: true}, {inert: true}, {action: 'noop'}, {action: 'sound'}, {action: 'effects-sound'}]) {
    dispatchControl(doc, 'click', feedbackControl(doc, options));
  }
  dispatchControl(doc, 'click', feedbackControl(doc), {trusted: false});
  dispatchControl(doc, 'change', feedbackControl(doc, {tag: 'select'}), {trusted: false});
  await Promise.resolve();
  assert.equal(audio.calls.voices.length, 0);
  controller.destroy();
});

test('system sound preview is cancelled when the page hides and never resumes old samples', () => {
  const audio = fakeAudio(), {doc, controller, flush} = presentationSetup({audio});
  dispatchControl(doc, 'click', feedbackControl(doc, {demo: true}));
  assert.equal(audio.calls.voices.length, soundScore('click').length);
  doc.hidden = true; doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = false; doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  flush();
  assert.equal(audio.calls.voices.length, soundScore('click').length);
  controller.destroy();
});

test('screen entrances preserve fitted canvas geometry at every animation frame', () => {
  for (const rotated of [false, true]) {
    const {doc, controller} = presentationSetup({rotated});
    const page = new FakeElement('main', doc), animations = [];
    // A short screen uses a larger logical canvas plus an inline scale.
    page.style.transform = 'scale(0.8378)';
    page.animate = (frames, options) => animations.push({frames, options});
    doc.querySelector = selector => selector.startsWith('.page,') ? page : null;
    controller.screen('deck');
    assert.equal(animations.length, 1);
    assert.ok(animations[0].options.duration > 0, 'the entrance remains animated');
    assert.notEqual(animations[0].frames[0].opacity, animations[0].frames.at(-1).opacity);
    for (const frame of animations[0].frames) {
      for (const key of ['transform', 'translate', 'scale', 'rotate', 'width', 'height', 'top', 'left']) {
        assert.equal(key in frame, false, key+' must remain under layout control');
      }
    }
    assert.equal(page.style.transform, 'scale(0.8378)');
    controller.screen('deck');
    assert.equal(animations.length, 1, 'unchanged renders do not repeat the entrance');
    controller.destroy();
  }
});

test('pack ceremony is always skippable, resolves once, and returns keyboard focus', async () => {
  const {doc, controller, flush} = presentationSetup();
  const focus = doc.activeElement;
  const promise = controller.openPack({name: '王源の継承', rarity: 'GGR'});
  assert.equal(controller.openPack({name: 'second purchase'}), promise, 'a second request reuses the active presentation');
  const ceremony = doc.body.children.find(node => node.className === 'bk-pack-ceremony');
  assert.equal(ceremony.attributes.get('aria-modal'), 'true');
  const skip = ceremony.children.find(node => node.tagName === 'BUTTON');
  assert.equal(doc.activeElement, skip);
  skip.dispatchEvent(new Event('click'));
  await promise;
  assert.equal(ceremony.isConnected, false);
  assert.equal(doc.activeElement, focus);
  flush();
  assert.equal(doc.body.children.filter(node => node.className === 'bk-pack-ceremony').length, 0);
  controller.destroy();
});

test('reduced motion skips the pack ritual and hiding the tab resolves an active ritual', async () => {
  const reduced = presentationSetup({reducedMotion: true});
  await reduced.controller.openPack();
  assert.equal(reduced.doc.body.children.length, 1, 'only the noninteractive overlay exists');
  reduced.controller.destroy();
  const normal = presentationSetup();
  const promise = normal.controller.openPack();
  normal.doc.hidden = true; normal.doc.visibilityState = 'hidden';
  normal.doc.dispatchEvent(new Event('visibilitychange'));
  await promise;
  assert.equal(normal.doc.body.children.filter(node => node.className === 'bk-pack-ceremony').length, 0);
  normal.controller.destroy();
  assert.equal(normal.pending.size, 0);
});

test('portrait battle feedback uses logical card coordinates and pack rituals stay in the rotated stage', async () => {
  const {doc, win, controller} = presentationSetup({rotated: true});
  const core = new FakeElement('button', doc);
  core.getBoundingClientRect = () => ({left: 300, top: 100, right: 340, bottom: 180, width: 40, height: 80});
  doc.querySelector = selector => selector.includes('[data-player="0"]') ? core : null;
  const game = core => ({turn: 1, active: 0, winner: null, log: core < 5000 ? [event('damage', '200 damage')] : [], players: [{core, shield: 0, field: []}, {core: 5000, shield: 0, field: []}]});
  controller.observeBattle(game(5000), 'battle');
  controller.observeBattle(game(4800), 'battle');
  const layer = win.BeastKingViewport.stage.children.find(node => node.className === 'bk-experience-layer');
  const label = layer.children.find(node => node.className === 'bk-float bk-float-damage');
  assert.equal(label.textContent, '−200');
  assert.equal(label.style.left, '140px');
  assert.equal(label.style.top, '70px');
  const promise = controller.openPack();
  const ceremony = win.BeastKingViewport.stage.children.find(node => node.className === 'bk-pack-ceremony');
  assert.ok(ceremony);
  ceremony.children.find(node => node.tagName === 'BUTTON').dispatchEvent(new Event('click'));
  await promise;
  controller.destroy();
});
