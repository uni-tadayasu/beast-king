/** Purposeful feedback for the whole game. No game rules, purchases, hidden
 * cards or save data are changed here. Call openPack only AFTER saving a purchase.
 * Its presentation can always be skipped; it never grants cards itself. */
export const EXPERIENCE_STORAGE_KEY = 'beast-king-experience-v1';
export const RARITY_ORDER = Object.freeze(['N', 'R', 'KR', 'KKR', 'GR', 'GGR']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function normalizeExperiencePreferences(value = {}) {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : true,
    volume: clamp(finite(value?.volume, .55), 0, 1),
    motion: typeof value?.motion === 'boolean' ? value.motion : true,
    intensity: value?.intensity === 'subtle' ? 'subtle' : 'full',
  };
}

/** Original cyber interface cues: a tactile low pulse, a bright digital tick,
 * and a short frequency sweep make each action recognizable without a long
 * tail over the music. Battle and pack scores keep their separate identities. */
export function soundScore(kind, rarity = 'N') {
  const n = (frequency, delay = 0, duration = .15, gain = .07, wave = 'sine', end = frequency) => ({frequency, end, delay, duration, gain, wave});
  const chime = (notes, step = .065, gain = .065) => notes.map((f, i) => n(f, i * step, .24, gain));
  switch (kind) {
    case 'click': return [n(1080, 0, .055, .047, 'triangle', 720), n(310, 0, .038, .028, 'sine', 210), n(2160, .017, .033, .013, 'sine', 1440)];
    case 'nav': return [n(360, 0, .11, .047, 'triangle', 980), n(1320, .035, .075, .025, 'sine', 1760), n(1760, .09, .08, .020)];
    case 'select': return [n(1568, 0, .048, .034), n(1047, .035, .045, .025, 'triangle')];
    case 'close': return [n(880, 0, .09, .04, 'triangle', 330), n(196, .035, .075, .025, 'sine', 130)];
    case 'confirm': return [n(392, 0, .045, .034, 'triangle', 587), n(784, .045, .09, .034), n(1175, .09, .12, .027), n(1568, .105, .08, .012)];
    case 'play': return chime([392, 588, 784], .045, .05);
    case 'deny': return [n(174, 0, .055, .035, 'square', 146), n(146, .07, .085, .04, 'triangle', 110)];
    case 'summon': return [n(110, 0, .28, .095, 'triangle', 220), ...chime([392, 587, 784], .055, .055)];
    case 'fusion': return [n(65, 0, .55, .075, 'triangle', 195), ...chime([262, 330, 392, 523, 784, 1047], .075, .065)];
    case 'attack': return [n(290, 0, .15, .08, 'sawtooth', 65), n(84, .055, .22, .12, 'triangle', 42)];
    case 'damage': return [n(145, 0, .12, .1, 'triangle', 45), n(61, .025, .18, .07)];
    case 'destroy': return [n(210, 0, .2, .06, 'triangle', 55), n(83, .1, .22, .06, 'sine', 31)];
    case 'heal': return chime([523, 659, 784, 1047], .075, .045);
    case 'shield': case 'defend': return [n(740, 0, .24, .055, 'sine', 690), n(1108, .025, .3, .035), n(220, 0, .18, .045, 'triangle')];
    case 'buff': return chime([440, 554, 659], .055, .045);
    case 'miracle': return [n(440, 0, .26, .055, 'triangle', 880), ...chime([659, 988], .055, .04)];
    case 'gimmick': case 'set': return [n(185, 0, .06, .065, 'triangle'), n(277, .065, .08, .055), n(554, .115, .15, .04)];
    case 'draw': return [n(480, 0, .07, .03, 'triangle', 720)];
    case 'turn': return chime([392, 523], .095, .055);
    case 'victory': case 'win': return chime([523, 659, 784, 1047, 784, 1047], .105, .07);
    case 'defeat': return [n(330, 0, .28, .055, 'triangle'), n(277, .18, .3, .055), n(220, .36, .48, .05)];
    case 'draw-game': return chime([392, 494, 392], .11, .05);
    case 'pack-charge': return [n(98, 0, .65, .065, 'triangle', 196), ...chime([392, 494, 587, 784], .12, .035)];
    case 'pack-open': return [n(110, 0, .3, .09, 'triangle', 55), ...chime([523, 659, 784, 1047, 1319], .045, .055)];
    case 'reveal': {
      const rank = Math.max(0, RARITY_ORDER.indexOf(rarity));
      return chime([523, 659, 784, 1047, 1319, 1568].slice(0, rank + 1), .055, .035 + rank * .004);
    }
    default: return [n(660, 0, .075, .04, 'sine', 740)];
  }
}

/** Testable audio lifecycle: zero audio objects until a real gesture, bounded
 * polyphony, immediate mute, and no stale sounds replayed after an interruption. */
export function createExperienceAudio(options = {}) {
  const win = options.window ?? globalThis.window;
  const factory = options.audioContextFactory || (() => {
    const Audio = win?.AudioContext || win?.webkitAudioContext;
    return Audio ? new Audio() : null;
  });
  let preferences = normalizeExperiencePreferences(options.preferences);
  let context = null, master = null, unlocked = false, destroyed = false, visible = true;
  const active = new Set();
  let lastKind = '', lastAt = -Infinity;
  const now = options.now || (() => Date.now());
  const stop = () => {
    for (const voice of active) { try { voice.osc.stop(); } catch {} try { voice.osc.disconnect(); voice.gain.disconnect(); } catch {} }
    active.clear();
  };
  const level = () => {
    if (!master || !context) return;
    try { master.gain.setTargetAtTime(preferences.enabled && visible ? preferences.volume * .8 : 0, context.currentTime, .012); } catch {}
  };
  function unlock() {
    if (destroyed) return false;
    unlocked = true;
    if (!context) {
      try { context = factory(); if (!context) return false; master = context.createGain(); master.connect(context.destination); level(); }
      catch { context = null; master = null; return false; }
    }
    if (context.state === 'suspended') { try { Promise.resolve(context.resume()).catch(() => {}); } catch {} }
    return context.state === 'running';
  }
  function play(kind = 'click', rarity = 'N') {
    if (destroyed || !unlocked || !preferences.enabled || preferences.volume <= 0 || !visible || !context || context.state !== 'running') return false;
    const time = now();
    if (kind === lastKind && time - lastAt < 70) return false;
    if (active.size >= 24) return false;
    lastKind = kind; lastAt = time;
    const score = soundScore(kind, rarity).slice(0, 24 - active.size), start = context.currentTime;
    for (const note of score) {
      let osc, gain;
      try {
        osc = context.createOscillator(); gain = context.createGain();
        const at = start + note.delay;
        osc.type = note.wave;
        osc.frequency.setValueAtTime(note.frequency, at);
        if (note.end !== note.frequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, note.end), at + note.duration);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(note.gain, at + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, at + note.duration);
        osc.connect(gain); gain.connect(master);
        const voice = {osc, gain}; active.add(voice);
        osc.onended = () => { active.delete(voice); try { osc.disconnect(); gain.disconnect(); } catch {} };
        osc.start(at); osc.stop(at + note.duration + .025);
      } catch { try { osc?.disconnect(); gain?.disconnect(); } catch {} }
    }
    return score.length > 0;
  }
  return {
    unlock, play,
    sync(next = {}) { preferences = normalizeExperiencePreferences({...preferences, ...next}); level(); if (!preferences.enabled || preferences.volume === 0) stop(); },
    setVisible(value) { visible = !!value; level(); if (!visible) stop(); },
    getState: () => ({...preferences, unlocked, visible, voices: active.size, running: context?.state === 'running'}),
    destroy() { destroyed = true; stop(); try { master?.disconnect(); Promise.resolve(context?.close?.()).catch(() => {}); } catch {} },
  };
}

const logKey = event => `${event?.turn || 0}\u0000${event?.type || ''}\u0000${event?.text || ''}`;
const MAX_EFFECT_LOG = 256;
export function freshBattleEvents(previous = [], current = []) {
  const a = previous.slice(-MAX_EFFECT_LOG), b = current.slice(-MAX_EFFECT_LOG);
  for (let count = Math.min(a.length, b.length); count >= 0; count--) {
    if (a.slice(a.length - count).every((item, i) => logKey(item) === logKey(b[i]))) return b.slice(count);
  }
  return [];
}

/** Only public information is retained. Opponent hands, decks and face-down
 * gimmick identities never enter the effects layer. */
export function publicBattleSnapshot(game) {
  if (!game?.players?.length) return null;
  return {
    turn: game.turn, active: game.active, winner: game.winner,
    log: (game.log || []).slice(-MAX_EFFECT_LOG).map(({type, text, turn}) => ({type, text, turn})),
    players: game.players.map(player => ({core: player.core, shield: player.shield,
      field: (player.field || []).map(unit => ({uid: unit.uid, cardId: unit.cardId, attack: unit.attack, hp: unit.hp})),
    })),
  };
}

export function battlePresentation(previous, current) {
  if (!previous || !current) return [];
  const events = freshBattleEvents(previous.log, current.log);
  const types = new Set(events.map(event => event.type));
  const output = [];
  for (const kind of ['fusion', 'summon', 'attack', 'damage', 'heal', 'gimmick', 'shield', 'defend', 'destroy', 'miracle', 'buff', 'set', 'draw']) {
    if (types.has(kind) && !(kind === 'miracle' && types.has('fusion')) && !(kind === 'summon' && types.has('fusion'))) output.push({kind});
  }
  if (current.turn !== previous.turn || current.active !== previous.active) output.push({kind: 'turn', player: current.active});
  if (current.winner !== null && current.winner !== previous.winner) output.push({kind: current.winner === 0 ? 'victory' : current.winner === 'draw' ? 'draw-game' : 'defeat'});
  // A complete CPU turn may contain dozens of log records. Keep the important
  // beats and always retain turn/result, without delaying the next legal action.
  const endings = output.filter(event => ['turn', 'victory', 'defeat', 'draw-game'].includes(event.kind));
  return [...output.filter(event => !endings.includes(event)).slice(0, 5), ...endings];
}

const CONTROL_SELECTOR = 'button, a[href], input[type="checkbox"], input[type="radio"], summary, [role="tab"], [data-action], [data-act], [data-nav]';
function controlKind(element) {
  const action = element?.dataset?.action || element?.dataset?.act || '';
  // The application owns the ON confirmation and immediate OFF silence.
  // A card displayed only as an illustration must not pretend to be a control.
  if (['noop', 'sound', 'effects-sound'].includes(action)) return null;
  if (element?.dataset?.nav || action === 'nav' || element?.tagName === 'A') return 'nav';
  if (/close|cancel|back|discard|remove|return/.test(action)) return 'close';
  if (/confirm|save|equip|activate|receive|claim|buy|purchase/.test(action)) return 'confirm';
  if (/hand|unit|select|detail|tab|filter|origin|page|inspect|preset|deck-add|section|scope/.test(action) || element?.dataset?.bkScreenTab || ['tab', 'radio', 'checkbox', 'switch'].includes(element?.getAttribute?.('role')) || ['radio', 'checkbox'].includes(element?.type)) return 'select';
  return 'click';
}

export function createExperienceController(options = {}) {
  const doc = options.document ?? globalThis.document, win = options.window ?? globalThis.window;
  if (!doc?.body || !win) return null;
  if (doc.__beastKingExperience) return doc.__beastKingExperience;
  const storage = options.storage ?? (() => { try { return win.localStorage; } catch { return null; } })();
  let saved;
  try { saved = JSON.parse(storage?.getItem(EXPERIENCE_STORAGE_KEY) || '{}'); } catch { saved = {}; }
  let preferences = normalizeExperiencePreferences(saved), destroyed = false, screenId = null, snapshot = null, battleKey = null;
  const audio = createExperienceAudio({window: win, preferences});
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const overlayHost = () => win.BeastKingViewport?.stage || doc.body;
  const viewport = () => win.BeastKingViewport?.get() || {width: win.innerWidth, height: win.innerHeight};
  const localPoint = point => win.BeastKingViewport?.toLocalPoint(point) || point;
  const layer = doc.createElement('div'); layer.className = 'bk-experience-layer'; layer.setAttribute('aria-hidden', 'true'); overlayHost().appendChild(layer);
  const listeners = [], timers = new Set(), particles = new Set(), battleTimers = new Set();
  let opening = null, previousFocus = null, controlCue = null, sampleSequence = 0;
  const cancelSample = () => { sampleSequence++; };
  const on = (target, type, fn, opts) => { target?.addEventListener(type, fn, opts); listeners.push(() => target?.removeEventListener(type, fn, opts)); };
  const delay = (fn, ms, battle = false) => { const id = win.setTimeout(() => { timers.delete(id); battleTimers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); if (battle) battleTimers.add(id); return id; };
  const visible = () => !doc.hidden && doc.visibilityState !== 'hidden';
  const motion = () => preferences.motion && !reduced?.matches && visible();
  const full = () => motion() && preferences.intensity === 'full';
  const save = () => { try { storage?.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(preferences)); } catch {} };
  const applyPreferences = () => {
    doc.documentElement.dataset.experienceMotion = motion() ? preferences.intensity : 'off';
    audio.sync(preferences); audio.setVisible(visible());
    if (!motion()) { for (const node of particles) node.remove(); particles.clear(); opening?.complete(); }
  };
  const sync = (next = {}) => { const before = JSON.stringify(preferences); preferences = normalizeExperiencePreferences({...preferences, ...next}); if (before !== JSON.stringify(preferences)) save(); if (!preferences.enabled || preferences.volume === 0) cancelSample(); applyPreferences(); return {...preferences}; };
  const rectOf = node => { try { const r = node?.getBoundingClientRect(); return r?.width && r?.height ? (win.BeastKingViewport?.toLocalRect(r) || r) : null; } catch { return null; } };
  const point = (node, fallback) => { const r = rectOf(node); return r ? {x: r.x + r.width / 2, y: r.y + r.height / 2} : fallback || {x: viewport().width / 2, y: viewport().height / 2}; };
  const temporary = (className, x, y, duration = 700, text = '') => {
    if (!motion()) return null;
    if (particles.size >= 36) {
      if (!/bk-battle-beat|bk-float/.test(className)) return null;
      // Damage numbers and the turn prompt take priority over decorative sparks.
      const disposable = [...particles].find(node => node.className.includes('bk-spark')) || particles.values().next().value;
      disposable?.remove(); particles.delete(disposable);
    }
    const node = doc.createElement('span'); node.className = className; node.textContent = text;
    node.style.left = clamp(x, 0, viewport().width) + 'px'; node.style.top = clamp(y, 0, viewport().height) + 'px';
    layer.appendChild(node); particles.add(node); delay(() => { node.remove(); particles.delete(node); }, duration); return node;
  };
  const burst = (kind, node, text) => {
    const p = point(node);
    if (text) temporary(`bk-float bk-float-${kind}`, p.x, p.y, 1050, text);
    const mark = temporary(`bk-impact bk-impact-${kind}`, p.x, p.y, 850);
    if (!mark) return;
    if (full() && ['fusion', 'summon', 'victory', 'heal', 'pack'].includes(kind)) {
      for (let i = 0; i < 8; i++) {
        const spark = temporary(`bk-spark bk-spark-${kind}`, p.x, p.y, 850);
        if (spark) { spark.style.setProperty('--spark-x', Math.cos(i * Math.PI / 4) * (34 + i % 3 * 12) + 'px'); spark.style.setProperty('--spark-y', Math.sin(i * Math.PI / 4) * 44 + 'px'); spark.style.setProperty('--spark-delay', `${i * 12}ms`); }
      }
    }
  };
  const animateNode = (node, kind) => {
    if (!motion() || !node?.animate) return;
    const frames = kind === 'attack' ? [{translate: '0 0'}, {translate: '0 -7px', offset: .35}, {translate: '0 0'}]
      : kind === 'damage' ? [{filter: 'brightness(1)'}, {filter: 'brightness(1.6)', offset: .25}, {filter: 'brightness(1)'}]
      : [{opacity: .55, filter: 'brightness(1.6)'}, {opacity: 1, filter: 'brightness(1)'}];
    try { node.animate(frames, {duration: full() ? 420 : 180, easing: 'cubic-bezier(.2,.8,.2,1)'}); } catch {}
  };
  const sound = (kind = 'click', rarity) => {
    // A synchronous outcome (saved, started, denied) takes the place of the
    // generic button cue queued by capture, so one operation has one response.
    if (controlCue) controlCue.cancelled = true;
    return audio.play(kind, rarity);
  };
  const queueControlSound = kind => {
    if (!kind) return;
    const cue = {kind, cancelled: false}; controlCue = cue;
    Promise.resolve().then(() => {
      if (controlCue === cue) controlCue = null;
      if (!destroyed && !cue.cancelled) audio.play(cue.kind);
    });
  };
  function screen(id) {
    if (screenId === id) return;
    screenId = id;
    const node = doc.querySelector('.page, .entry-screen, .entry, .duel-shell, #app > main, #app > .shell') || doc.querySelector('#app')?.firstElementChild;
    if (motion() && node?.animate) {
      // The viewport fitter owns this element's transform. Animating it would
      // expose the larger logical canvas until the entrance animation ends.
      // A light reveal stays within the fitted bounds throughout the change.
      try { node.animate([{opacity: .35, filter: 'brightness(1.12)'}, {opacity: 1, filter: 'brightness(1)'}], {duration: full() ? 310 : 140, easing: 'cubic-bezier(.2,.8,.2,1)'}); } catch {}
    }
  }
  function banner(kind, text) {
    if (!motion()) return;
    const arena = doc.querySelector('.arena, .board, .battle'), r = rectOf(arena);
    temporary(`bk-battle-beat bk-beat-${kind}`, r ? r.x + r.width / 2 : viewport().width / 2, r ? r.y + r.height * .48 : viewport().height * .45, full() ? 1100 : 650, text);
  }
  function observeBattle(game, key = game) {
    const next = publicBattleSnapshot(game);
    if (!next) { snapshot = null; battleKey = null; for (const id of battleTimers) { win.clearTimeout(id); timers.delete(id); } battleTimers.clear(); return; }
    if (!snapshot || battleKey !== key) { snapshot = next; battleKey = key; return; }
    const before = snapshot; snapshot = next;
    const beats = battlePresentation(before, next);
    if (!beats.length) return;
    for (const id of battleTimers) { win.clearTimeout(id); timers.delete(id); } battleTimers.clear();
    next.players.forEach((player, who) => {
      const prior = before.players[who]; if (!prior) return;
      const core = doc.querySelector(`[data-action="core"][data-player="${who}"], [data-act="core"][data-player="${who}"]`);
      const delta = player.core - prior.core;
      if (delta) { burst(delta > 0 ? 'heal' : 'damage', core, (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('ja-JP')); animateNode(core, delta > 0 ? 'heal' : 'damage'); }
      for (const unit of player.field) {
        const old = prior.field.find(value => value.uid === unit.uid), target = [...doc.querySelectorAll('[data-uid]')].find(node => node.dataset.uid === unit.uid && (node.matches('.field-unit, .unit, .card') || node.dataset.action === 'unit' || node.dataset.act === 'unit'));
        if (!old) { burst(unit.cardId?.startsWith('F') ? 'fusion' : 'summon', target); animateNode(target, 'summon'); }
        else if (unit.hp !== old.hp || unit.attack !== old.attack) animateNode(target, unit.hp < old.hp ? 'damage' : 'heal');
      }
    });
    beats.forEach((beat, i) => delay(() => {
      sound(beat.kind);
      const arena = doc.querySelector('.arena, .board, .battle');
      if (beat.kind === 'attack') animateNode(arena, 'attack');
      if (beat.kind === 'fusion') banner('fusion', '合成召喚');
      if (beat.kind === 'gimmick') banner('gimmick', 'ギミック発動');
      if (beat.kind === 'turn') banner('turn', beat.player === 0 ? 'YOUR TURN' : 'OPPONENT TURN');
      // The result modal / rebuild result strip owns the outcome text. Keep
      // feedback ornamental so it cannot cover that text when the modal opens.
      if (beat.kind === 'victory') burst('victory', doc.querySelector('.result-medal') || arena);
    }, i * (full() ? 135 : 75), true));
  }
  function revealCards(container, pulls = [], getCard = () => null) {
    const nodes = [...(container?.querySelectorAll('.pack-pull, .pack-result-card') || [])];
    nodes.forEach((node, i) => {
      const rarity = getCard(pulls[i]?.cardId || pulls[i]?.id)?.rarity || node.querySelector('[data-rarity]')?.dataset.rarity || 'N';
      node.dataset.revealRarity = rarity;
      const wait = motion() ? i * (full() ? 95 : 35) : 0;
      node.style.setProperty('--reveal-delay', `${wait}ms`);
      node.classList.add('bk-pack-reveal');
      delay(() => { if (!node.isConnected) return; if (i % 3 === 0 || RARITY_ORDER.indexOf(rarity) >= 3) sound('reveal', rarity); if (RARITY_ORDER.indexOf(rarity) >= 4) burst('pack', node); }, wait);
    });
  }
  function openPack({name = 'BEAST KING', rarity = 'N'} = {}) {
    if (opening) return opening.promise;
    if (!motion()) { sound('pack-open'); return Promise.resolve(); }
    previousFocus = doc.activeElement;
    const host = doc.createElement('div'); host.className = 'bk-pack-ceremony'; host.dataset.rarity = RARITY_ORDER.includes(rarity) ? rarity : 'N';
    host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', 'パック開封');
    const heading = doc.createElement('p'); heading.className = 'bk-pack-ceremony-name'; heading.textContent = name;
    const stage = doc.createElement('div'); stage.className = 'bk-pack-seal'; stage.setAttribute('aria-hidden', 'true'); stage.innerHTML = '<i class="bk-pack-orbit"></i><i class="bk-pack-orbit second"></i><div class="bk-pack-vessel"><span>BEAST<br>KING</span><b>✦</b><small>TWELVE NEW STORIES</small></div><i class="bk-pack-light"></i>';
    const caption = doc.createElement('p'); caption.className = 'bk-pack-ceremony-caption'; caption.textContent = '封印を解き放つ';
    const skip = doc.createElement('button'); skip.type = 'button'; skip.className = 'bk-pack-skip'; skip.textContent = '演出をスキップ';
    host.append(heading, stage, caption, skip); overlayHost().appendChild(host);
    let finish;
    const promise = new Promise(resolve => { finish = resolve; });
    let completed = false;
    const complete = () => {
      if (completed) return; completed = true;
      host.remove(); doc.removeEventListener('keydown', keys, true); opening = null;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
      finish();
    };
    const keys = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); complete(); } else if (event.key === 'Tab') { event.preventDefault(); skip.focus(); } };
    doc.addEventListener('keydown', keys, true); skip.addEventListener('click', complete, {once: true}); skip.focus({preventScroll: true});
    opening = {promise, complete}; sound('pack-charge');
    delay(() => { if (completed) return; host.classList.add('is-releasing'); caption.textContent = '12枚の新しい出会い'; sound('pack-open'); }, full() ? 680 : 180);
    delay(complete, full() ? 1550 : 520);
    return promise;
  }
  function settingsMarkup() {
    return `<div class="setting-volume experience-setting"><label for="experience-volume">システム・効果音の音量 <output data-experience-volume-output>${Math.round(preferences.volume * 100)}%</output></label><input id="experience-volume" data-experience-volume type="range" min="0" max="100" step="1" value="${Math.round(preferences.volume * 100)}" aria-label="効果音の音量" aria-valuetext="${Math.round(preferences.volume * 100)}%"><div class="experience-setting-bottom"><small>選択・移動・決定を電子音でお知らせ</small><button type="button" class="btn small" data-experience-demo aria-label="サイバー操作音を試聴">操作音を試聴</button></div></div><div class="setting-row experience-setting"><div>演出の強さ<small>控えめでも操作結果とカード効果を表示</small></div><select aria-label="演出の強さ" data-experience-intensity><option value="full"${preferences.intensity === 'full' ? ' selected' : ''}>華やか</option><option value="subtle"${preferences.intensity === 'subtle' ? ' selected' : ''}>控えめ</option></select></div>`;
  }
  on(doc, 'pointerdown', event => { if (event.isTrusted !== false) audio.unlock(); }, {capture: true, passive: true});
  on(doc, 'keydown', event => { if (!event.repeat && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key) && event.isTrusted !== false) audio.unlock(); }, {capture: true});
  on(doc, 'click', event => {
    if (event.isTrusted === false) return;
    const control = event.target?.closest?.(CONTROL_SELECTOR); if (!control || control.disabled || control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true' || control.closest('[inert], [aria-disabled="true"], .bk-pack-ceremony')) return;
    // Trusted clicks also cover keyboard/assistive activation with no pointerdown.
    audio.unlock(); cancelSample();
    if (control.matches('[data-experience-demo]')) {
      const sequence = sampleSequence;
      sound('click');
      for (const [kind, ms] of [['nav', 170], ['confirm', 370]]) delay(() => { if (sequence === sampleSequence && visible()) sound(kind); }, ms);
    } else if (!['checkbox', 'radio'].includes(control.type)) queueControlSound(controlKind(control));
    const r = rectOf(control); if (r) { const p = event.clientX > 0 || event.clientY > 0 ? localPoint({x: event.clientX, y: event.clientY}) : {x: r.x + r.width / 2, y: r.y + r.height / 2}; temporary('bk-touch-ring', p.x, p.y, 500); }
  }, {capture: true});
  on(doc, 'input', event => {
    if (!event.target.matches?.('[data-experience-volume]')) return;
    const volume = Number(event.target.value) / 100; sync({volume});
    event.target.setAttribute('aria-valuetext', `${Math.round(preferences.volume * 100)}%`);
    for (const output of doc.querySelectorAll('[data-experience-volume-output]')) output.textContent = `${Math.round(preferences.volume * 100)}%`;
  });
  on(doc, 'change', event => {
    if (event.isTrusted === false || event.target?.disabled || event.target?.matches?.(':disabled') || event.target?.closest?.('[inert], [aria-disabled="true"]')) return;
    audio.unlock(); cancelSample();
    if (event.target.matches?.('[data-experience-intensity]')) { sync({intensity: event.target.value}); sound('select'); }
    else if (event.target.matches?.('[data-experience-volume]')) sound('select');
    else if (event.target.matches?.('select, input[type="checkbox"], input[type="radio"]')) sound('select');
  });
  on(doc, 'visibilitychange', () => { applyPreferences(); if (!visible()) { cancelSample(); if (controlCue) controlCue.cancelled = true; opening?.complete(); for (const node of particles) node.remove(); particles.clear(); for (const id of battleTimers) { win.clearTimeout(id); timers.delete(id); } battleTimers.clear(); } });
  on(win, 'pagehide', () => { cancelSample(); if (controlCue) controlCue.cancelled = true; opening?.complete(); audio.setVisible(false); });
  on(win, 'pageshow', applyPreferences);
  on(reduced, 'change', applyPreferences);
  on(doc, 'bk-experience', event => { const detail = event.detail || {}; if (detail.kind) sound(detail.kind, detail.rarity); });
  applyPreferences();
  const controller = {sync, sound, screen, observeBattle, revealCards, openPack, settingsMarkup, unlock: audio.unlock,
    getPreferences: () => ({...preferences}),
    destroy() { if (destroyed) return; opening?.complete(); destroyed = true; for (const off of listeners) off(); for (const id of timers) win.clearTimeout(id); timers.clear(); battleTimers.clear(); audio.destroy(); layer.remove(); delete doc.documentElement.dataset.experienceMotion; delete doc.__beastKingExperience; },
  };
  doc.__beastKingExperience = controller;
  return controller;
}
