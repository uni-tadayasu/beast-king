import { getCard, STARTER_DECKS, validateDeck, validateSpecialDeck, DECK_MIN, DECK_SIZE, SPECIAL_DECK_SIZE, POINT_SCALE, FUSION_MATERIAL_BONUS, MODEL_LABELS } from './catalog.js?v=20261125-33';

export const MAX_HEART_POINTS = 5000;
// Internal .core and MAX_CORE remain compatible with saved games and callers.
export const MAX_CORE = MAX_HEART_POINTS;
export const MAX_LOG_ENTRIES = 1000;
const battleUnits = value => value / POINT_SCALE;
export const RULES = Object.freeze({deck:DECK_SIZE, deckMin:DECK_MIN, specialDeck:SPECIAL_DECK_SIZE, copies:3, hand:4, field:4, traps:2, maxEnergy:10, startingHand:4, heartPoints:MAX_HEART_POINTS, core:MAX_CORE});
const TARGETED = new Set(['damage_enemy', 'buff']);
const LEVELS = new Set(['easy','normal','hard']);
const label = p => p.name || 'プレイヤー';
const ok = events => ({ok:true, events});
const fail = error => ({ok:false, error, events:[]});
const isAttackOnlyBeast = card => card?.type==='beast' && card.model==='attack';

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
  const event = {text, type, turn:state.turn};
  events.push(event);
  state.log.push(event);
  if (state.log.length > MAX_LOG_ENTRIES) state.log.splice(0, state.log.length-MAX_LOG_ENTRIES);
}
function checkWinner(state, events) {
  if (state.winner !== null) return true;
  const p0 = state.players[0].core <= 0;
  const p1 = state.players[1].core <= 0;
  if (p0 || p1) {
    state.winner = p0 && p1 ? 'draw' : p0 ? 1 : 0;
    emit(state, events, state.winner === 'draw' ? '両者のハートポイントが0になり、引き分けになりました。' : `${label(state.players[state.winner])}の勝利！`, 'result');
    return true;
  }
  return false;
}
function cleanup(state, events, source='') {
  for (const player of state.players) {
    const dead = player.field.filter(unit => unit.hp <= 0);
    if (!dead.length) continue;
    player.field = player.field.filter(unit => unit.hp > 0);
    for (const unit of dead) {
      player.grave.push(unit.cardId);
      emit(state, events, `${source ? '「'+source+'」：' : ''}${label(player)}の「${getCard(unit.cardId)?.name || '魔獣'}」が消滅し、お墓ゾーンへ移動。`, 'destroy');
    }
  }
}
function healCore(state, who, value, events, source='') {
  const player = state.players[who];
  const before = player.core;
  const healed = Math.min(Math.max(0, value), MAX_CORE-player.core);
  player.core += healed;
  if (healed > 0 || source) emit(state, events, `${source ? '「'+source+'」：' : ''}${label(player)}のハートポイントを${healed}回復（${before}→${player.core}）。${healed<value?'回復上限は'+MAX_CORE+'。':''}`, 'heal');
  return healed;
}
function damageCore(state, who, value, events, source='', {bypassShield=false}={}) {
  const player = state.players[who];
  const before = player.core, shieldBefore = player.shield, prefix = source ? '「'+source+'」：' : '';
  let damage = Math.max(0, value);
  const blocked = bypassShield ? 0 : Math.min(damage, player.shield);
  player.shield -= blocked;
  damage -= blocked;
  if (blocked) emit(state, events, `${prefix}${label(player)}の結界が${blocked}ダメージを防いだ（結界${shieldBefore}→${player.shield}）。`, 'shield');
  if (bypassShield && damage>0 && player.shield>0) emit(state, events, `${prefix}魔獣との戦闘によるハートポイントへのダメージは、結界を消費せずに通る。`, 'info');
  const actual = Math.min(Math.max(0, player.core), damage);
  player.core = Math.max(0, player.core-damage);
  if (value>0 || source) emit(state, events, `${prefix}${label(player)}のハートポイントに${actual}ダメージ（${before}→${player.core}）。`, 'damage');
  return actual;
}
function damageUnit(state, unit, value, events, source='') {
  const before = unit.hp;
  const damage = Math.max(0, value);
  const actual = Math.min(Math.max(0, unit.hp), damage);
  unit.hp = Math.max(0, unit.hp-damage);
  if (damage || source) emit(state, events, `${source ? '「'+source+'」：' : ''}「${getCard(unit.cardId)?.name || '魔獣'}」の守備力に${actual}ダメージ（${before}→${unit.hp}）。`, 'damage');
  return actual;
}
function draw(state, who, count, events, opening=false, source='') {
  const player = state.players[who];
  for (let i=0; i<count; i++) {
    if (state.winner !== null) break;
    if (player.hand.length >= RULES.hand) {
      if(source) emit(state,events,`「${source}」：${label(player)}の手札が${RULES.hand}枚のため、残りのドローは行わなかった。`,'info');
      break;
    }
    if (!player.deck.length) {
      player.fatigue++;
      emit(state, events, `${source ? '「'+source+'」：' : ''}${label(player)}は山札切れ。疲弊${player.fatigue}。`, 'fatigue');
      damageCore(state, who, player.fatigue*POINT_SCALE, events, '疲弊');
      if (checkWinner(state, events)) break;
      continue;
    }
    const id = player.deck.shift();
    player.hand.push(id);
    if (!opening) emit(state, events, `${source ? '「'+source+'」：' : ''}${label(player)}がカードを1枚引いた（手札${player.hand.length}/${RULES.hand}枚）。`, 'draw');
  }
}
function restoreDefense(state, who, value, events, source) {
  const player=state.players[who];let total=0;
  for(const unit of player.field){
    const before=unit.hp,amount=Math.min(value,Math.max(0,unit.maxHp-unit.hp));unit.hp+=amount;total+=amount;
    if(amount>0)emit(state,events,`「${source}」：${label(player)}の「${getCard(unit.cardId).name}」の守備力を${amount}回復（${before}→${unit.hp}）。`,'heal');
  }
  if(total===0)emit(state,events,`「${source}」：守備力の回復は0。${player.field.length?'場の魔獣はすでに最大守備力。':'場に回復対象の魔獣がいない。'}`,'heal');
  return total;
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
      for (const unit of player.field) {unit.attack+=card.effect.value;unit.hp+=card.effect.value;unit.maxHp+=card.effect.value;}
      emit(state, events, `「${card.name}」：${player.field.length?`${label(player)}の場の魔獣${player.field.length}体すべての攻撃力・現在守備力・最大守備力が${card.effect.value}上昇。`:'場に対象の魔獣がいないため、能力の変化は0。'}`, 'buff');
    } else {
      restoreDefense(state,who,card.effect.value,events,card.name);
    }
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

function defaultSpecialDeck(ids) {
  const signature=[...ids].sort().join('|');
  const preset=STARTER_DECKS.find(d=>[...d.ids].sort().join('|')===signature) || STARTER_DECKS[0];
  return preset.specialIds;
}

export function newGame({playerDeck, cpuDeck, playerSpecialDeck, cpuSpecialDeck, seed, difficulty='normal'}={}) {
  const first = playerDeck ?? STARTER_DECKS[0]?.ids;
  const second = cpuDeck ?? STARTER_DECKS[2]?.ids ?? STARTER_DECKS[0]?.ids;
  for (const [name, ids] of [['あなた',first],['CPU',second]]) {
    if (!Array.isArray(ids)) throw new Error(`${name}のデッキがありません。`);
    const validation = validateDeck(ids);
    if (!validation.valid) throw new Error(`${name}のデッキを確認してください：${validation.errors.join('／')}`);
  }
  const specials=[playerSpecialDeck ?? defaultSpecialDeck(first), cpuSpecialDeck ?? defaultSpecialDeck(second)];
  specials.forEach((ids,i)=>{
    const validation=validateSpecialDeck(ids);
    if (!validation.valid) throw new Error(`${i?'CPU':'あなた'}の特殊デッキを確認してください：${validation.errors.join('／')}`);
  });
  const state = {rulesVersion:2, turn:1, active:0, winner:null, players:[], log:[], nextUid:1, seed:seedNumber(seed), difficulty:LEVELS.has(difficulty)?difficulty:'normal'};
  state.players = [first, second].map((ids,i)=>({name:i?'CPU':'あなた', core:MAX_CORE, shield:0, energy:0, maxEnergy:0, deckSize:ids.length, specialSize:specials[i].length, special:[...specials[i]], banished:[], deck:shuffle(state,ids), hand:[], field:[], traps:[], grave:[], fatigue:0, lastMiracle:null}));
  const events=[];
  emit(state,events,`契約成立。${MAX_HEART_POINTS}のハートポイントで対戦を始めます。`,'start');
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
export function getFusionMaterials(state, who=state?.active) {
  if (!validState(state) || ![0,1].includes(who)) return [];
  const player=state.players[who], materials=[];
  for (const zone of ['hand','field','grave']) {
    if (!Array.isArray(player[zone])) continue;
    player[zone].forEach((entry,index)=>{
      const cardId=zone==='field'?entry?.cardId:entry;
      if (!['beast','fusion'].includes(getCard(cardId)?.type)) return;
      if (zone==='field' && (entry.hp<=0 || entry.owner!==who)) return;
      materials.push(zone==='field'?{zone,index,uid:entry.uid,cardId}:{zone,index,cardId});
    });
  }
  return materials;
}

export function validateFusionSelection(state, handIndex, selection) {
  const errors=[];
  if (!validState(state)) return {valid:false,errors:['対戦データを確認できません。']};
  if (state.winner!==null) return {valid:false,errors:['対戦は終了しています。']};
  const player=state.players[state.active], spell=validHandCard(state,handIndex);
  if (!spell || spell.type!=='miracle' || spell.effect.kind!=='fusion') return {valid:false,errors:['手札の「合成」を選んでください。']};
  if (player.energy<spell.cost) errors.push(`エーテルが足りません。必要：${spell.cost}。`);
  if (!selection || typeof selection!=='object' || Array.isArray(selection)) return {valid:false,errors:[...errors,'特殊ゾーンの合成魔獣と素材を選んでください。']};
  if (selection.player!==undefined && selection.player!==state.active) errors.push('相手のカードは合成に使用できません。');
  if (!Number.isInteger(selection.specialIndex) || selection.specialIndex<0 || getCard(player.special?.[selection.specialIndex])?.type!=='fusion') errors.push('特殊ゾーンから召喚する合成魔獣を選んでください。');
  if (!Array.isArray(selection.materials) || !selection.materials.length) return {valid:false,errors:[...errors,'合成素材の魔獣を1枚以上選んでください。']};
  const available=getFusionMaterials(state), unique=new Set(), fieldUids=new Set();
  let fieldMaterials=0;
  for (const material of selection.materials) {
    if (!material || typeof material!=='object' || !['hand','field','grave'].includes(material.zone) || !Number.isInteger(material.index) || material.index<0) {
      errors.push('素材の場所と番号を確認してください。'); continue;
    }
    if ((material.player!==undefined && material.player!==state.active) || (material.owner!==undefined && material.owner!==state.active)) errors.push('相手のカードは合成素材にできません。');
    const key=`${material.zone}:${material.index}`;
    if (unique.has(key)) {errors.push('同じ1枚のカードを重ねて素材にはできません。');continue;}
    unique.add(key);
    const source=available.find(m=>m.zone===material.zone && m.index===material.index);
    if (!source || (material.cardId!==undefined && material.cardId!==source.cardId) || (material.uid!==undefined && material.uid!==source.uid)) {
      errors.push('選んだ素材は使用できません。自分の手持ち・出場ゾーン・お墓ゾーンの魔獣（合成魔獣も可）を選んでください。');continue;
    }
    if (material.zone==='field') {
      if (fieldUids.has(source.uid)) errors.push('同じ1体の魔獣を重ねて素材にはできません。');
      fieldUids.add(source.uid);fieldMaterials++;
    }
  }
  if (player.field.length-fieldMaterials+1>RULES.field) errors.push('出場ゾーンがいっぱいです。場の魔獣を素材に含めて、召喚枠を1つ空けてください。');
  return {valid:errors.length===0,errors:[...new Set(errors)]};
}

function hasLegalFusion(state, handIndex) {
  const player=state.players[state.active];
  if (!(player.special||[]).some(id=>getCard(id)?.type==='fusion')) return false;
  const materials=getFusionMaterials(state);
  return materials.length>0 && (player.field.length<RULES.field || materials.some(m=>m.zone==='field'));
}

function resolveFusion(state, handIndex, selection) {
  const validation=validateFusionSelection(state,handIndex,selection);
  if (!validation.valid) return fail(validation.errors[0]);
  const player=state.players[state.active], spell=getCard(player.hand[handIndex]);
  const card=getCard(player.special[selection.specialIndex]);
  const available=getFusionMaterials(state);
  const materials=selection.materials.map(m=>available.find(a=>a.zone===m.zone && a.index===m.index));
  const handIndices=new Set([handIndex,...materials.filter(m=>m.zone==='hand').map(m=>m.index)]);
  const fieldIndices=new Set(materials.filter(m=>m.zone==='field').map(m=>m.index));
  const graveIndices=new Set(materials.filter(m=>m.zone==='grave').map(m=>m.index));
  // Validate against original physical references first, then remove every zone
  // simultaneously. Removing the spell never shifts a selected hand material.
  player.energy-=spell.cost;
  player.hand=player.hand.filter((_,i)=>!handIndices.has(i));
  player.field=player.field.filter((_,i)=>!fieldIndices.has(i));
  player.grave=player.grave.filter((_,i)=>!graveIndices.has(i));
  player.banished??=[];
  player.banished.push(...materials.map(m=>m.cardId));
  player.grave.push(spell.id);
  player.lastMiracle=spell.id;
  player.special.splice(selection.specialIndex,1);
  const bonus=(materials.length-1)*FUSION_MATERIAL_BONUS, events=[];
  player.field.push({uid:`u${state.nextUid++}`,cardId:card.id,attack:card.attack+bonus,hp:card.hp+bonus,maxHp:card.hp+bonus,ready:card.keywords.includes('rush'),keywords:[...card.keywords],owner:state.active,fusionMaterialCount:materials.length});
  emit(state,events,`${label(player)}が「合成」を発動。素材の魔獣${materials.length}枚を異世界ゾーンへ送った。`,'miracle');
  emit(state,events,`${label(player)}が特殊ゾーンから「${card.name}」を合成召喚！ 素材${materials.length}枚、攻撃力${card.attack+bonus}・守備力${card.hp+bonus}（素材効果 +${bonus}）。`,'fusion');
  summonEffect(state,card,events);
  cleanup(state,events,spell.name);checkWinner(state,events);
  return ok(events);
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
    if (!card || card.type==='fusion' || card.cost>player.energy || (card.effect.kind==='fusion' && !hasLegalFusion(state,i)) || (card.type==='beast' && player.field.length>=RULES.field) || (card.type==='gimmick' && player.traps.length>=RULES.traps) || (needsTarget(card) && !getLegalTargets(state,i).length)) return [];
    return [i];
  });
}
function summonEffect(state, card, events) {
  const own=state.active, enemy=1-own, player=state.players[own];
  const {kind,value=0}=card.effect;
  if (kind!=='none') emit(state,events,`${label(player)}の「${card.name}」の召喚時効果が発動。`,'info');
  if (kind==='draw') draw(state,own,value,events,false,card.name);
  else if (kind==='heal') healCore(state,own,value,events,card.name);
  else if (kind==='damage_core') damageCore(state,enemy,value,events,card.name);
  else if (kind==='buff_all') {
    for (const unit of player.field) unit.attack += value;
    emit(state,events,`「${card.name}」：${label(player)}の場の魔獣${player.field.length}体すべての攻撃力が${value}上昇。`,'buff');
  } else if (kind==='shield') {
    player.shield+=value;
    emit(state,events,`「${card.name}」：${label(player)}のハートポイントに結界${value}を付与（合計${player.shield}）。`,'shield');
  }
}
function miracleEffect(state, card, target, events) {
  const own=state.active, enemy=1-own, player=state.players[own];
  const {kind,value=0}=card.effect;
  if (kind==='damage_enemy') {
    if (target.core) damageCore(state,enemy,value,events,card.name);
    else damageUnit(state,state.players[enemy].field.find(u=>u.uid===target.uid),value,events,card.name);
  } else if (kind==='heal') healCore(state,own,value,events,card.name);
  else if (kind==='draw') draw(state,own,value,events,false,card.name);
  else if (kind==='buff') {
    const unit=player.field.find(u=>u.uid===target.uid);
    unit.attack+=value; unit.hp+=value; unit.maxHp+=value;
    emit(state,events,`「${card.name}」：「${getCard(unit.cardId).name}」の攻撃力・現在守備力・最大守備力が${value}上昇。`,'buff');
  } else if (kind==='sweep') {
    for (const unit of state.players[enemy].field) damageUnit(state,unit,value,events,card.name);
    if(!state.players[enemy].field.length)emit(state,events,`「${card.name}」：相手の場に対象の魔獣がいないため、守備力へのダメージは0。`,'info');
  } else if (kind==='shield' || kind==='shield_heal') {
    if (kind==='shield_heal') healCore(state,own,value,events,card.name);
    player.shield+=value;
    emit(state,events,`「${card.name}」：${label(player)}のハートポイントに結界${value}を付与（合計${player.shield}）。`,'shield');
  } else if (kind==='drain') {
    const dealt=damageCore(state,enemy,value,events,card.name);
    healCore(state,own,dealt,events,card.name);
  } else if (kind==='renew') {
    restoreDefense(state,own,value,events,card.name);
  }
}
export function playCard(state, handIndex, target) {
  if (!validState(state)) return fail('対戦データを確認できません。');
  if (state.winner !== null) return fail('対戦は終了しています。');
  const card=validHandCard(state,handIndex), player=state.players[state.active];
  if (!card) return fail('手札のカードを選んでください。');
  if (card.type==='fusion') return fail('合成魔獣は特殊ゾーンから「合成」で召喚してください。');
  if (card.type==='miracle' && card.effect.kind==='fusion') return resolveFusion(state,handIndex,target);
  if (player.energy<card.cost) return fail(`エーテルが足りません。必要：${card.cost}。`);
  if (card.type==='beast' && player.field.length>=RULES.field) return fail('魔獣の場は4体までです。');
  if (card.type==='gimmick' && player.traps.length>=RULES.traps) return fail('ギミックは2枚まで設置できます。');
  if (needsTarget(card) && !getLegalTargets(state,handIndex).some(t=>targetMatches(t,target))) return fail(card.effect.kind==='buff'?'強化する味方の魔獣を選んでください。':'ダメージを与える相手の魔獣かハートポイントを選んでください。');
  const events=[];
  player.energy-=card.cost;
  player.hand.splice(handIndex,1);
  if (card.type==='beast') {
    player.field.push({uid:`u${state.nextUid++}`,cardId:card.id,attack:card.attack,hp:card.hp,maxHp:card.hp,ready:card.keywords.includes('rush'),keywords:[...card.keywords],owner:state.active});
    emit(state,events,`${label(player)}が「${card.name}」を召喚！`,'summon');
    summonEffect(state,card,events);
  } else if (card.type==='miracle') {
    player.grave.push(card.id);
    player.lastMiracle=card.id;
    emit(state,events,`${label(player)}がミラクル「${card.name}」を発動！`,'miracle');
    miracleEffect(state,card,target,events);
  } else if (card.type==='gimmick') {
    player.traps.push({uid:`g${state.nextUid++}`,cardId:card.id});
    // The identity remains hidden in public history until activation.
    emit(state,events,`${label(player)}がギミックを1枚設置。`,'set');
  }
  cleanup(state,events,card.name);
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
  if (!getAttackTargets(state,attackerUid).some(t=>targetMatches(t,chosen))) return fail(defender.field.some(u=>u.keywords.includes('guard'))?'守護を持つ魔獣を先に攻撃してください。':'相手の魔獣かハートポイントを選んでください。');
  const unit=player.field.find(u=>u.uid===attackerUid), events=[],source=getCard(unit.cardId).name;
  unit.ready=false;
  const targetLabel=chosen.core?`${label(defender)}のハートポイント`:`${label(defender)}の「${getCard(defender.field.find(u=>u.uid===chosen.uid).cardId).name}」`;
  emit(state,events,`${label(player)}の「${source}」が${targetLabel}へ攻撃（攻撃力${unit.attack}）。`,'attack');
  let attackPower=unit.attack;
  for (const trap of [...defender.traps]) {
    const card=getCard(trap.cardId);
    if (card.effect.kind==='ambush' || (card.effect.kind==='barrier' && chosen.core && attackPower>0)) {
      defender.traps=defender.traps.filter(t=>t.uid!==trap.uid);
      defender.grave.push(trap.cardId);
      emit(state,events,`${label(defender)}のギミック「${card.name}」が発動！`,'gimmick');
      if (card.effect.kind==='ambush') {
        damageUnit(state,unit,card.effect.value,events,card.name);
        if (unit.hp<=0) {cleanup(state,events,card.name);emit(state,events,`「${card.name}」：攻撃した魔獣が消滅し、攻撃は止められた。`,'cancel');return ok(events);}
      } else {
        const blocked=Math.min(attackPower,card.effect.value);
        attackPower-=blocked;
        emit(state,events,`「${card.name}」：${blocked}ダメージを防ぎ、攻撃した魔獣へ反射。`,'shield');
        damageUnit(state,unit,blocked,events,card.name);
        if (unit.hp<=0) {cleanup(state,events,card.name);emit(state,events,`「${card.name}」：反射で攻撃した魔獣が消滅し、攻撃は止められた。`,'cancel');return ok(events);}
      }
    }
  }
  if (chosen.core) {
    const dealt=damageCore(state,enemy,attackPower,events,source);
    if (unit.keywords.includes('drain')) healCore(state,own,dealt,events,source+'の吸収');
  } else {
    const targetUnit=defender.field.find(u=>u.uid===chosen.uid);
    const targetCard=getCard(targetUnit.cardId);
    if (isAttackOnlyBeast(targetCard)) {
      // Only a normal attack-model beast vanishes regardless of its statistics.
      // Its owner takes the attacker's full attack directly; no counterattack or
      // shield consumption occurs. Ambush cancellation already resolved above.
      targetUnit.hp=0;
      emit(state,events,`「${source}」：アタック型「${targetCard.name}」は攻撃を受け、強制的に消滅した。`,'destroy');
      const dealt=damageCore(state,enemy,unit.attack,events,source+'のアタック型への攻撃',{bypassShield:true});
      if (unit.keywords.includes('drain')) healCore(state,own,dealt,events,source+'の吸収');
    } else {
      // Defense-model normal beasts and all hybrid fusion beasts use current
      // hp as their defense value. Equal or lower attacks do not erode
      // it; a strictly higher attack makes the defender vanish and deals only
      // the excess to its owner's heart points. There is no counterattack.
      const defense=Math.max(0,targetUnit.hp);
      const modelLabel=MODEL_LABELS[targetCard.model] || MODEL_LABELS.defense;
      if (unit.attack<=defense) {
        emit(state,events,`「${source}」：${modelLabel}「${targetCard.name}」は守備力${defense}で攻撃力${unit.attack}を防いだ。場に残り、ハートポイントへのダメージは0。`,'defend');
      } else {
        const excess=unit.attack-defense;
        targetUnit.hp=0;
        emit(state,events,`「${source}」：${modelLabel}「${targetCard.name}」は攻撃力${unit.attack}が守備力${defense}を上回り、消滅した。`,'destroy');
        const dealt=damageCore(state,enemy,excess,events,`${source}の${modelLabel}への超過ダメージ`,{bypassShield:true});
        if (unit.keywords.includes('drain')) healCore(state,own,dealt,events,source+'の吸収');
      }
    }
  }
  cleanup(state,events,source);
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

function chooseFusionSelection(state,handIndex,difficulty) {
  const player=state.players[state.active], available=getFusionMaterials(state);
  const specials=(player.special||[]).map((id,i)=>({card:getCard(id),i})).filter(v=>v.card?.type==='fusion');
  if (!available.length || !specials.length) return undefined;
  const graves=available.filter(m=>m.zone==='grave');
  const hands=available.filter(m=>m.zone==='hand').sort((a,b)=>getCard(a.cardId).cost-getCard(b.cardId).cost);
  const fields=available.filter(m=>m.zone==='field').sort((a,b)=>{
    const ua=player.field[a.index],ub=player.field[b.index];
    return battleUnits(ua.attack+ua.hp)+(ua.ready?3:0)-(battleUnits(ub.attack+ub.hp)+(ub.ready?3:0));
  });
  const materials=[];
  if (player.field.length>=RULES.field && fields.length) materials.push(fields[0]);
  const wanted=difficulty==='easy'?1:difficulty==='hard'?5:3;
  for (const material of graves) {if(materials.length>=wanted)break;materials.push(material);}
  if (!materials.length && hands.length) materials.push(hands[0]);
  if (!materials.length && fields.length) materials.push(fields[0]);
  if (difficulty==='hard' && materials.length<2) {
    const cheap=hands.find(m=>getCard(m.cardId).cost<=2 && !materials.includes(m));
    if (cheap) materials.push(cheap);
  }
  if (difficulty!=='easy') specials.sort((a,b)=>{
    const score=c=>battleUnits(c.attack)*1.1+battleUnits(c.hp)*0.65+(c.keywords.includes('rush')?4:0)+(c.keywords.includes('guard') && player.core<MAX_HEART_POINTS*.5?4:0)+(c.effect.kind==='damage_core'?battleUnits(c.effect.value):0);
    return score(b.card)-score(a.card);
  });
  const selection={specialIndex:specials[0].i,materials};
  return validateFusionSelection(state,handIndex,selection).valid?selection:undefined;
}

function cardScore(state, index, difficulty) {
  const player=state.players[state.active], enemy=state.players[1-state.active];
  const card=getCard(player.hand[index]);
  const {kind,value=0}=card.effect;
  const points=battleUnits(value), critical=player.core<MAX_HEART_POINTS*.4;
  let score=card.cost*0.16;
  // Combat points are normalized to their 100-point units; ether and card
  // counts retain their original units so high numbers do not distort the AI.
  if (card.type==='beast') {
    score+=3+battleUnits(card.attack)*0.75+battleUnits(card.hp)*0.45;
    if (card.keywords.includes('guard')) score+=enemy.field.length*0.65+(critical?3:0);
    if (card.keywords.includes('rush')) score+=2;
    if (kind==='buff_all') score+=player.field.length*points;
    if (kind==='draw') score+=Math.min(value,RULES.hand-player.hand.length+1)*1.5;
    if (kind==='damage_core' && enemy.core+enemy.shield<=value) score+=1000;
  } else if (card.type==='miracle') {
    if (kind==='fusion') {
      const selection=chooseFusionSelection(state,index,difficulty);
      if (!selection) return -1000;
      const fused=getCard(player.special[selection.specialIndex]);
      const lost=selection.materials.filter(m=>m.zone==='field').reduce((sum,m)=>sum+battleUnits(player.field[m.index].attack)*0.6+battleUnits(player.field[m.index].hp)*0.25,0);
      score+=7+battleUnits(fused.attack)*0.75+battleUnits(fused.hp)*0.45+(selection.materials.length-1)*battleUnits(FUSION_MATERIAL_BONUS)*1.2-lost;
      if (fused.keywords.includes('rush')) score+=3;
    }
    if (kind==='damage_enemy') score=1+points*0.6+Math.max(0,...enemy.field.map(u=>u.hp<=value?battleUnits(u.attack)+battleUnits(u.maxHp)*0.3:0));
    if ((kind==='damage_enemy' || kind==='drain') && enemy.core+enemy.shield<=value) score+=1000;
    if (kind==='sweep') score+=enemy.field.reduce((s,u)=>s+battleUnits(Math.min(u.hp,value))*0.75+(u.hp<=value?2:0),0);
    if (kind==='draw') {
      const count=Math.min(value,Math.max(0,RULES.hand-player.hand.length+1));
      score+=count*1.8-(player.deck.length<count?8:0);
    }
    if (kind==='heal' || kind==='shield_heal') score+=battleUnits(Math.min(MAX_CORE-player.core,value))*(critical?1.6:0.7);
    if (kind==='shield' || kind==='shield_heal') score+=points*(player.core<MAX_HEART_POINTS*.5?1:0.5);
    if (kind==='drain') score+=points*0.7+battleUnits(Math.min(MAX_CORE-player.core,value))*0.7;
    if (kind==='renew') score+=battleUnits(player.field.reduce((s,u)=>s+Math.min(value,u.maxHp-u.hp),0));
    if (kind==='buff') score+=points*1.2+Math.max(0,...player.field.map(u=>u.ready?2:0));
    if ((kind==='heal' && player.core===MAX_CORE) || (kind==='renew' && player.field.every(u=>u.hp===u.maxHp)) || (kind==='sweep' && !enemy.field.length)) score=-2;
  } else {
    if (kind==='ambush') score+=2+points*0.65;
    else if (kind==='barrier') score+=2+points*0.6;
    else if (kind==='spring') score+=player.field.length?1+player.field.length*points*1.5:-2;
    else if (kind==='fountain') {
      const recovery=player.field.reduce((sum,u)=>sum+Math.min(value,Math.max(0,u.maxHp-u.hp)),0);
      score+=recovery?1+battleUnits(recovery):-2;
    }
  }
  if (difficulty==='easy') score+=random(state)*8;
  if (difficulty==='normal') score+=random(state)*1.2;
  return score;
}
function chooseCardTarget(state,index,difficulty) {
  if (getCard(state.players[state.active].hand[index])?.effect.kind==='fusion') return chooseFusionSelection(state,index,difficulty);
  const targets=getLegalTargets(state,index);
  if (!targets.length) return undefined;
  if (difficulty==='easy') return targets[Math.floor(random(state)*targets.length)];
  const card=getCard(state.players[state.active].hand[index]);
  if (card.effect.kind==='buff') return [...targets].sort((a,b)=>{
    const af=state.players[a.player].field.find(u=>u.uid===a.uid), bf=state.players[b.player].field.find(u=>u.uid===b.uid);
    return (bf.ready?4:0)+battleUnits(bf.hp)*0.2+(bf.keywords.includes('drain')?2:0)-((af.ready?4:0)+battleUnits(af.hp)*0.2+(af.keywords.includes('drain')?2:0));
  })[0];
  const enemy=state.players[1-state.active], value=card.effect.value;
  if (enemy.core+enemy.shield<=value) return targets.find(t=>t.core);
  const units=targets.filter(t=>t.uid).map(t=>({target:t,unit:enemy.field.find(u=>u.uid===t.uid)}));
  units.sort((a,b)=>((b.unit.hp<=value?8:0)+battleUnits(b.unit.attack)+battleUnits(b.unit.maxHp)*0.2)-((a.unit.hp<=value?8:0)+battleUnits(a.unit.attack)+battleUnits(a.unit.maxHp)*0.2));
  return units.length && (units[0].unit.hp<=value || enemy.core>MAX_HEART_POINTS/3) ? units[0].target : targets.find(t=>t.core);
}
function chooseAttackTarget(state,uid,difficulty) {
  const targets=getAttackTargets(state,uid);
  if (!targets.length) return null;
  if (difficulty==='easy') return targets[Math.floor(random(state)*targets.length)];
  const player=state.players[state.active], enemy=state.players[1-state.active], unit=player.field.find(u=>u.uid===uid);
  const core=targets.find(t=>t.core);
  const scored=targets.filter(t=>t.uid).map(t=>{
    const foe=enemy.field.find(u=>u.uid===t.uid);
    const attackModel=isAttackOnlyBeast(getCard(foe.cardId));
    const excess=attackModel?unit.attack:Math.max(0,unit.attack-foe.hp);
    const vanishes=attackModel || unit.attack>foe.hp;
    // Defense and hybrid targets take only excess heart-point damage. A defense
    // value that cannot be exceeded must not appear to be chipped away.
    let score=vanishes?battleUnits(foe.attack)*0.8+battleUnits(foe.hp)*0.25+3+battleUnits(Math.min(excess,enemy.core))*0.7:-10;
    if (vanishes && foe.keywords.includes('guard')) score+=2;
    if (vanishes && player.core<MAX_HEART_POINTS*.4) score+=battleUnits(foe.attack)*0.35;
    return {target:t,score,damage:excess};
  }).sort((a,b)=>b.score-a.score);
  const lethal=scored.find(t=>t.damage>=enemy.core);
  if (lethal) return lethal.target;
  const totalReady=player.field.filter(u=>u.ready).reduce((s,u)=>s+u.attack,0);
  if (core && totalReady>=enemy.core+enemy.shield) return core;
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
