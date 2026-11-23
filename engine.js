import { getCard, STARTER_DECKS, validateDeck, DECK_MIN } from './catalog.js';

export const MAX_CORE = 30;
export const RULES = Object.freeze({deck:DECK_MIN, deckMin:DECK_MIN, copies:3, hand:4, field:4, traps:2, maxEnergy:10, startingHand:4, core:MAX_CORE});
const TARGETED = new Set(['damage_enemy', 'buff']);
const LEVELS = new Set(['easy','normal','hard']);
const label = p => p.name || 'プレイヤー';
const ok = events => ({ok:true, events});
const fail = error => ({ok:false, error, events:[]});

function seedNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return (value >>> 0) || 0x6d2b79f5;
  let n = 2166136261;
  for (const ch of String(value ?? Date.now())) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return (n >>> 0) || 0x6d2b79f5;
}
function random(state) {
  let x = state.seed >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}
function shuffle(state, ids) {
  const result = [...ids];
  for (let i=result.length-1; i>0; i--) {
    const j = Math.floor(random(state) * (i+1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function emit(state, events, text, type='info') {
  const event = {text, type};
  events.push(event);
  state.log.push(event);
  if (state.log.length > 100) state.log.splice(0, state.log.length-100);
}
function checkWinner(state, events) {
  if (state.winner !== null) return true;
  const p0 = state.players[0].core <= 0;
  const p1 = state.players[1].core <= 0;
  if (p0 || p1) {
    state.winner = p0 && p1 ? 'draw' : p0 ? 1 : 0;
    emit(state, events, state.winner === 'draw' ? '両者のコアが砕け、引き分けになりました。' : `${label(state.players[state.winner])}の勝利！`, 'result');
    return true;
  }
  return false;
}
function cleanup(state, events) {
  for (const player of state.players) {
    const dead = player.field.filter(unit => unit.hp <= 0);
    if (!dead.length) continue;
    player.field = player.field.filter(unit => unit.hp > 0);
    for (const unit of dead) {
      player.grave.push(unit.cardId);
      emit(state, events, `${getCard(unit.cardId)?.name || '魔獣'}が退場。`, 'destroy');
    }
  }
}
function healCore(state, who, value, events) {
  const player = state.players[who];
  const healed = Math.min(Math.max(0, value), MAX_CORE-player.core);
  player.core += healed;
  if (healed > 0) emit(state, events, `${label(player)}のコアが${healed}回復。`, 'heal');
  return healed;
}
function damageCore(state, who, value, events, source='') {
  const player = state.players[who];
  let damage = Math.max(0, value);
  const blocked = Math.min(damage, player.shield);
  player.shield -= blocked;
  damage -= blocked;
  if (blocked) emit(state, events, `${label(player)}の結界が${blocked}ダメージを防いだ。`, 'shield');
  const actual = Math.min(Math.max(0, player.core), damage);
  player.core = Math.max(0, player.core-damage);
  if (damage) emit(state, events, `${source ? source+'：' : ''}${label(player)}のコアに${damage}ダメージ。`, 'damage');
  return actual;
}
function damageUnit(state, unit, value, events, source='') {
  const damage = Math.max(0, value);
  const actual = Math.min(Math.max(0, unit.hp), damage);
  unit.hp = Math.max(0, unit.hp-damage);
  if (damage) emit(state, events, `${source ? source+'：' : ''}${getCard(unit.cardId)?.name || '魔獣'}に${damage}ダメージ。`, 'damage');
  return actual;
}
function draw(state, who, count, events, opening=false) {
  const player = state.players[who];
  for (let i=0; i<count; i++) {
    if (state.winner !== null || player.hand.length >= RULES.hand) break;
    if (!player.deck.length) {
      player.fatigue++;
      emit(state, events, `${label(player)}は山札切れ。疲弊${player.fatigue}。`, 'fatigue');
      damageCore(state, who, player.fatigue, events, '疲弊');
      if (checkWinner(state, events)) break;
      continue;
    }
    const id = player.deck.shift();
    player.hand.push(id);
    if (!opening) emit(state, events, `${label(player)}がカードを1枚引いた。`, 'draw');
  }
}
function activateStartTraps(state, who, events) {
  const player = state.players[who];
  for (const trap of [...player.traps]) {
    if (state.winner !== null) break;
    const card = getCard(trap.cardId);
    if (!card || !['spring','fountain'].includes(card.effect.kind)) continue;
    player.traps = player.traps.filter(t=>t.uid!==trap.uid);
    player.grave.push(trap.cardId);
    emit(state, events, `${label(player)}のギミック「${card.name}」が発動！`, 'gimmick');
    if (card.effect.kind === 'spring') {
      player.shield += card.effect.value;
      emit(state, events, `${label(player)}のコアに結界${card.effect.value}を付与。`, 'shield');
    }
    else healCore(state, who, card.effect.value, events);
  }
}
function beginTurn(state, events) {
  const who = state.active;
  const player = state.players[who];
  player.maxEnergy = Math.min(RULES.maxEnergy, player.maxEnergy+1);
  player.energy = player.maxEnergy;
  player.field.forEach(unit => {unit.ready = true;});
  emit(state, events, `${label(player)}のターン。エーテル ${player.energy}。`, 'turn');
  // Delayed gimmicks resolve before refilling the hand to four cards.
  activateStartTraps(state, who, events);
  if (state.winner === null) draw(state, who, Math.max(0, RULES.hand-player.hand.length), events);
  checkWinner(state, events);
}

export function newGame({playerDeck, cpuDeck, seed, difficulty='normal'}={}) {
  const first = playerDeck ?? STARTER_DECKS[0]?.ids;
  const second = cpuDeck ?? STARTER_DECKS[2]?.ids ?? STARTER_DECKS[0]?.ids;
  for (const [name, ids] of [['あなた',first],['CPU',second]]) {
    if (!Array.isArray(ids)) throw new Error(`${name}のデッキがありません。`);
    const validation = validateDeck(ids);
    if (!validation.valid) throw new Error(`${name}のデッキを確認してください：${validation.errors.join('／')}`);
  }
  const state = {turn:1, active:0, winner:null, players:[], log:[], nextUid:1, seed:seedNumber(seed), difficulty:LEVELS.has(difficulty)?difficulty:'normal'};
  state.players = [first, second].map((ids,i)=>({name:i?'CPU':'あなた', core:MAX_CORE, shield:0, energy:0, maxEnergy:0, deckSize:ids.length, deck:shuffle(state,ids), hand:[], field:[], traps:[], grave:[], fatigue:0}));
  const events=[];
  emit(state,events,'契約成立。30のコアを賭けた対戦が始まります。','start');
  draw(state,0,RULES.startingHand,events,true);
  draw(state,1,RULES.startingHand,events,true);
  beginTurn(state,events);
  return state;
}

function validState(state) {return state && Array.isArray(state.players) && state.players.length === 2 && [0,1].includes(state.active);}
function validHandCard(state, handIndex) {
  if (!validState(state) || state.winner !== null || !Number.isInteger(handIndex)) return null;
  return getCard(state.players[state.active].hand[handIndex]) || null;
}
export function getLegalTargets(state, handIndex) {
  const card = validHandCard(state, handIndex);
  if (!card) return [];
  const own=state.active, enemy=1-own;
  if (card.type==='miracle' && card.effect.kind==='damage_enemy') return [{player:enemy,core:true},...state.players[enemy].field.map(u=>({player:enemy,uid:u.uid}))];
  if (card.type==='miracle' && card.effect.kind==='buff') return state.players[own].field.map(u=>({player:own,uid:u.uid}));
  return [];
}
function targetMatches(a,b) {
  return !!a && !!b && a.player === b.player && (a.core === true ? b.core === true && !b.uid : a.uid === b.uid && b.core !== true);
}
function needsTarget(card) {return card.type==='miracle' && TARGETED.has(card.effect.kind);}
export function getPlayableCards(state) {
  if (!validState(state) || state.winner !== null) return [];
  const player=state.players[state.active];
  return player.hand.flatMap((id,i)=>{
    const card=getCard(id);
    if (!card || card.cost>player.energy || (card.type==='beast' && player.field.length>=RULES.field) || (card.type==='gimmick' && player.traps.length>=RULES.traps) || (needsTarget(card) && !getLegalTargets(state,i).length)) return [];
    return [i];
  });
}
function summonEffect(state, card, events) {
  const own=state.active, enemy=1-own, player=state.players[own];
  const {kind,value=0}=card.effect;
  if (kind==='draw') draw(state,own,value,events);
  else if (kind==='heal') healCore(state,own,value,events);
  else if (kind==='damage_core') damageCore(state,enemy,value,events,card.name);
  else if (kind==='buff_all') {
    for (const unit of player.field) unit.attack += value;
    emit(state,events,`味方の魔獣すべての攻撃力が${value}上昇。`,'buff');
  } else if (kind==='shield') {
    player.shield+=value;
    emit(state,events,`${label(player)}のコアに結界${value}を付与。`,'shield');
  }
}
function miracleEffect(state, card, target, events) {
  const own=state.active, enemy=1-own, player=state.players[own];
  const {kind,value=0}=card.effect;
  if (kind==='damage_enemy') {
    if (target.core) damageCore(state,enemy,value,events,card.name);
    else damageUnit(state,state.players[enemy].field.find(u=>u.uid===target.uid),value,events,card.name);
  } else if (kind==='heal') healCore(state,own,value,events);
  else if (kind==='draw') draw(state,own,value,events);
  else if (kind==='buff') {
    const unit=player.field.find(u=>u.uid===target.uid);
    unit.attack+=value; unit.hp+=value; unit.maxHp+=value;
    emit(state,events,`${getCard(unit.cardId).name}の攻撃力と体力が${value}上昇。`,'buff');
  } else if (kind==='sweep') {
    for (const unit of state.players[enemy].field) damageUnit(state,unit,value,events,card.name);
  } else if (kind==='shield') {
    player.shield+=value;
    emit(state,events,`${label(player)}のコアに結界${value}を付与。`,'shield');
  } else if (kind==='drain') {
    const dealt=damageCore(state,enemy,value,events,card.name);
    healCore(state,own,dealt,events);
  } else if (kind==='renew') {
    let healed=0;
    for (const unit of player.field) {const n=Math.min(value,unit.maxHp-unit.hp);unit.hp+=n;healed+=n;}
    emit(state,events,`味方の魔獣の体力を合計${healed}回復。`,'heal');
  }
}
export function playCard(state, handIndex, target) {
  if (!validState(state)) return fail('対戦データを確認できません。');
  if (state.winner !== null) return fail('対戦は終了しています。');
  const card=validHandCard(state,handIndex), player=state.players[state.active];
  if (!card) return fail('手札のカードを選んでください。');
  if (player.energy<card.cost) return fail(`エーテルが足りません。必要：${card.cost}。`);
  if (card.type==='beast' && player.field.length>=RULES.field) return fail('魔獣の場は4体までです。');
  if (card.type==='gimmick' && player.traps.length>=RULES.traps) return fail('ギミックは2枚まで設置できます。');
  if (needsTarget(card) && !getLegalTargets(state,handIndex).some(t=>targetMatches(t,target))) return fail(card.effect.kind==='buff'?'強化する味方の魔獣を選んでください。':'ダメージを与える相手の魔獣かコアを選んでください。');
  const events=[];
  player.energy-=card.cost;
  player.hand.splice(handIndex,1);
  if (card.type==='beast') {
    player.field.push({uid:`u${state.nextUid++}`,cardId:card.id,attack:card.attack,hp:card.hp,maxHp:card.hp,ready:card.keywords.includes('rush'),keywords:[...card.keywords],owner:state.active});
    emit(state,events,`${label(player)}が「${card.name}」を召喚！`,'summon');
    summonEffect(state,card,events);
  } else if (card.type==='miracle') {
    player.grave.push(card.id);
    emit(state,events,`${label(player)}がミラクル「${card.name}」を発動！`,'miracle');
    miracleEffect(state,card,target,events);
  } else if (card.type==='gimmick') {
    player.traps.push({uid:`g${state.nextUid++}`,cardId:card.id});
    // The identity remains hidden in public history until activation.
    emit(state,events,`${label(player)}がギミックを1枚設置。`,'set');
  }
  cleanup(state,events);
  checkWinner(state,events);
  return ok(events);
}

export function canAttack(state, uid) {
  if (!validState(state) || state.winner !== null) return false;
  const unit=state.players[state.active].field.find(u=>u.uid===uid);
  return !!unit && unit.ready === true && unit.hp>0 && unit.attack>0;
}
export function getAttackTargets(state, uid) {
  if (!canAttack(state,uid)) return [];
  const enemy=1-state.active, field=state.players[enemy].field;
  const guards=field.filter(u=>u.keywords.includes('guard') && u.hp>0);
  if (guards.length) return guards.map(u=>({player:enemy,uid:u.uid}));
  return [{player:enemy,core:true},...field.map(u=>({player:enemy,uid:u.uid}))];
}
export function attack(state, attackerUid, target) {
  if (!validState(state)) return fail('対戦データを確認できません。');
  if (state.winner !== null) return fail('対戦は終了しています。');
  if (!canAttack(state,attackerUid)) return fail('この魔獣はまだ攻撃できないか、このターンに攻撃済みです。');
  const own=state.active, enemy=1-own, player=state.players[own], defender=state.players[enemy];
  const chosen=target ?? {player:enemy,core:true};
  if (!getAttackTargets(state,attackerUid).some(t=>targetMatches(t,chosen))) return fail(defender.field.some(u=>u.keywords.includes('guard'))?'守護を持つ魔獣を先に攻撃してください。':'相手の魔獣かコアを選んでください。');
  const unit=player.field.find(u=>u.uid===attackerUid), events=[];
  unit.ready=false;
  emit(state,events,`${getCard(unit.cardId).name}が攻撃！`,'attack');
  let attackPower=unit.attack;
  for (const trap of [...defender.traps]) {
    const card=getCard(trap.cardId);
    if (card.effect.kind==='ambush' || (card.effect.kind==='barrier' && chosen.core && attackPower>0)) {
      defender.traps=defender.traps.filter(t=>t.uid!==trap.uid);
      defender.grave.push(trap.cardId);
      emit(state,events,`${label(defender)}のギミック「${card.name}」が発動！`,'gimmick');
      if (card.effect.kind==='ambush') {
        damageUnit(state,unit,card.effect.value,events,card.name);
        if (unit.hp<=0) {cleanup(state,events);emit(state,events,'攻撃した魔獣が退場し、攻撃は止められた。','cancel');return ok(events);}
      } else {
        const blocked=Math.min(attackPower,card.effect.value);
        attackPower-=blocked;
        emit(state,events,`ギミックが${blocked}ダメージを防いだ。`,'shield');
      }
    }
  }
  if (chosen.core) {
    const dealt=damageCore(state,enemy,attackPower,events,getCard(unit.cardId).name);
    if (unit.keywords.includes('drain')) healCore(state,own,dealt,events);
  } else {
    const targetUnit=defender.field.find(u=>u.uid===chosen.uid);
    // Both attacks resolve simultaneously even when one unit takes lethal damage.
    const returnPower=targetUnit.attack;
    const dealt=damageUnit(state,targetUnit,attackPower,events,getCard(unit.cardId).name);
    const received=damageUnit(state,unit,returnPower,events,getCard(targetUnit.cardId).name);
    if (unit.keywords.includes('drain')) healCore(state,own,dealt,events);
    if (targetUnit.keywords.includes('drain')) healCore(state,enemy,received,events);
  }
  cleanup(state,events);
  checkWinner(state,events);
  return ok(events);
}

export function endTurn(state) {
  if (!validState(state)) return fail('対戦データを確認できません。');
  if (state.winner !== null) return fail('対戦は終了しています。');
  const events=[];
  state.active=1-state.active;
  state.turn++;
  beginTurn(state,events);
  return ok(events);
}

function cardScore(state, index, difficulty) {
  const player=state.players[state.active], enemy=state.players[1-state.active];
  const card=getCard(player.hand[index]);
  const {kind,value=0}=card.effect;
  let score=card.cost*0.16;
  if (card.type==='beast') {
    score+=3+card.attack*0.75+card.hp*0.45;
    if (card.keywords.includes('guard')) score+=enemy.field.length*0.65+(player.core<12?3:0);
    if (card.keywords.includes('rush')) score+=2;
    if (kind==='buff_all') score+=player.field.length*value;
    if (kind==='draw') score+=value*(player.hand.length<5?1.5:0.4);
    if (kind==='damage_core' && enemy.core+enemy.shield<=value) score+=1000;
  } else if (card.type==='miracle') {
    if (kind==='damage_enemy') score=1+value*0.6+Math.max(0,...enemy.field.map(u=>u.hp<=value?u.attack+u.maxHp*0.3:0));
    if ((kind==='damage_enemy' || kind==='drain') && enemy.core+enemy.shield<=value) score+=1000;
    if (kind==='sweep') score+=enemy.field.reduce((s,u)=>s+Math.min(u.hp,value)*0.75+(u.hp<=value?2:0),0);
    if (kind==='draw') score+=Math.min(value,Math.max(0,RULES.hand-player.hand.length+1))*1.8-(player.deck.length<value?8:0);
    if (kind==='heal') score+=Math.min(MAX_CORE-player.core,value)*(player.core<12?1.6:0.7);
    if (kind==='shield') score+=value*(player.core<15?1:0.5);
    if (kind==='drain') score+=value*0.7+Math.min(MAX_CORE-player.core,value)*0.7;
    if (kind==='renew') score+=player.field.reduce((s,u)=>s+Math.min(value,u.maxHp-u.hp),0);
    if (kind==='buff') score+=value*1.2+Math.max(0,...player.field.map(u=>u.ready?2:0));
    if ((kind==='heal' && player.core===MAX_CORE) || (kind==='renew' && player.field.every(u=>u.hp===u.maxHp)) || (kind==='sweep' && !enemy.field.length)) score=-2;
  } else {
    score+=kind==='ambush'?2+value*0.65:kind==='barrier'?1+value*0.45:kind==='spring'?1+value*0.55:1+Math.min(MAX_CORE-player.core,value)*0.7;
    if (kind==='fountain' && player.core===MAX_CORE) score=-1;
  }
  if (difficulty==='easy') score+=random(state)*8;
  if (difficulty==='normal') score+=random(state)*1.2;
  return score;
}
function chooseCardTarget(state,index,difficulty) {
  const targets=getLegalTargets(state,index);
  if (!targets.length) return undefined;
  if (difficulty==='easy') return targets[Math.floor(random(state)*targets.length)];
  const card=getCard(state.players[state.active].hand[index]);
  if (card.effect.kind==='buff') return [...targets].sort((a,b)=>{
    const af=state.players[a.player].field.find(u=>u.uid===a.uid), bf=state.players[b.player].field.find(u=>u.uid===b.uid);
    return (bf.ready?4:0)+bf.hp*0.2+(bf.keywords.includes('drain')?2:0)-((af.ready?4:0)+af.hp*0.2+(af.keywords.includes('drain')?2:0));
  })[0];
  const enemy=state.players[1-state.active], value=card.effect.value;
  if (enemy.core+enemy.shield<=value) return targets.find(t=>t.core);
  const units=targets.filter(t=>t.uid).map(t=>({target:t,unit:enemy.field.find(u=>u.uid===t.uid)}));
  units.sort((a,b)=>((b.unit.hp<=value?8:0)+b.unit.attack+b.unit.maxHp*0.2)-((a.unit.hp<=value?8:0)+a.unit.attack+a.unit.maxHp*0.2));
  return units.length && (units[0].unit.hp<=value || enemy.core>10) ? units[0].target : targets.find(t=>t.core);
}
function chooseAttackTarget(state,uid,difficulty) {
  const targets=getAttackTargets(state,uid);
  if (!targets.length) return null;
  if (difficulty==='easy') return targets[Math.floor(random(state)*targets.length)];
  const player=state.players[state.active], enemy=state.players[1-state.active], unit=player.field.find(u=>u.uid===uid);
  const core=targets.find(t=>t.core);
  const totalReady=player.field.filter(u=>u.ready).reduce((s,u)=>s+u.attack,0);
  if (core && totalReady>=enemy.core+enemy.shield) return core;
  const scored=targets.filter(t=>t.uid).map(t=>{
    const foe=enemy.field.find(u=>u.uid===t.uid);
    let score=(foe.hp<=unit.attack?foe.attack+2:0)+(unit.hp>foe.attack?2:-unit.attack*0.7);
    if (foe.keywords.includes('guard')) score+=2;
    if (player.core<12) score+=foe.attack*0.35;
    return {target:t,score};
  }).sort((a,b)=>b.score-a.score);
  return scored.length && (scored[0].score>2 || !core) ? scored[0].target : core || scored[0]?.target;
}
function cpuPlayCards(state,difficulty,events) {
  // Every successful play consumes a hand card and positive energy. The ceiling
  // also protects callers from malformed externally restored state.
  for (let step=0;step<20 && state.winner===null;step++) {
    const playable=getPlayableCards(state);
    if (!playable.length) break;
    const scored=playable.map(i=>({i,score:cardScore(state,i,difficulty)})).sort((a,b)=>b.score-a.score);
    if (difficulty!=='easy' && scored[0].score<0) break;
    const selected=scored[0].i;
    const result=playCard(state,selected,chooseCardTarget(state,selected,difficulty));
    if (!result.ok) break;
    events.push(...result.events);
  }
}
export function runCpuTurn(state,difficulty=state?.difficulty || 'normal') {
  if (!validState(state)) return fail('対戦データを確認できません。');
  if (state.winner !== null) return fail('対戦は終了しています。');
  if (state.active!==1) return fail('CPUのターンではありません。');
  const level=LEVELS.has(difficulty)?difficulty:'normal', events=[];
  cpuPlayCards(state,level,events);
  for (let step=0;step<RULES.field && state.winner===null;step++) {
    const units=state.players[1].field.filter(u=>canAttack(state,u.uid)).sort((a,b)=>level==='hard'?a.attack-b.attack:b.attack-a.attack);
    if (!units.length) break;
    const unit=units[0], target=chooseAttackTarget(state,unit.uid,level);
    if (!target) break;
    const result=attack(state,unit.uid,target);
    if (!result.ok) break;
    events.push(...result.events);
  }
  // Combat may free a full board; a second main window makes remaining cards useful.
  if (state.winner===null) cpuPlayCards(state,level,events);
  // New rush units in that second window may still attack once.
  for (let step=0;step<RULES.field && state.winner===null;step++) {
    const unit=state.players[1].field.find(u=>canAttack(state,u.uid));
    if (!unit) break;
    const target=chooseAttackTarget(state,unit.uid,level);
    if (!target) break;
    const result=attack(state,unit.uid,target);
    if (!result.ok) break;
    events.push(...result.events);
  }
  if (state.winner===null) events.push(...endTurn(state).events);
  return ok(events);
}
