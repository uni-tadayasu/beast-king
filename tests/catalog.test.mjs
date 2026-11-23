import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS, CARD_MAP, ELEMENTS, ORIGINS, STARTER_DECKS, DECK_SIZE, DECK_MIN, DECK_MAX,
  SPECIAL_DECK_SIZE, DECK_COPY_LIMIT, FUSION_CARD_ID, POINT_SCALE, FUSION_MATERIAL_BONUS, RARITY_ORDER, RARITY_LABELS, MODEL_LABELS, MODEL_DESCRIPTIONS, SUBTYPE_LABELS,
  getCard, validateDeck, validateSpecialDeck,
} from '../catalog.js';

test('expanded catalog contains 1152 unique cards with the original core intact', () => {
  assert.equal(CARDS.length, 1152);
  assert.equal(new Set(CARDS.map(c => c.id)).size, 1152);
  assert.equal(new Set(CARDS.map(c => c.name)).size, 1152);
  assert.equal(CARD_MAP.size, 1152);
  assert.equal(CARDS.filter(c=>c.category==='beast').length,640);
  assert.deepEqual(MODEL_LABELS,{attack:'アタック型',defense:'ディフェンス型',hybrid:'アタック・ディフェンス型'});
  for(const model of ['attack','defense']) assert.equal(CARDS.filter(c=>c.type==='beast'&&c.model===model).length,256);
  assert.equal(CARDS.filter(c=>c.type==='fusion'&&c.model==='hybrid').length,128);
  assert.equal(CARDS.filter(c=>c.type==='beast'&&c.model==='hybrid').length,0);
  for(const [type,subtypes] of [['miracle',['power','regeneration']],['gimmick',['reflection','support']]]) {
    for(const subtype of subtypes) assert.equal(CARDS.filter(c=>c.type===type&&c.subtype===subtype).length,128);
  }
  assert.deepEqual(Object.keys(SUBTYPE_LABELS),['power','regeneration','reflection','support']);
  for (const [type, expected] of [['beast',512],['miracle',256],['gimmick',256],['fusion',128]]) assert.equal(CARDS.filter(c => c.type === type).length, expected);
  assert.deepEqual(CARDS.map(c => c.index), Array.from({length:1152}, (_,i) => i+1));
  assert.deepEqual(CARDS.filter(c=>c.type==='fusion').map(c=>c.id),Array.from({length:128},(_,i)=>`F${String(i+1).padStart(4,'0')}`));
});

test('all cards have supported effects, costs, art keys and usable rules text', () => {
  const summonEffects = ['none','draw','heal','damage_core','buff_all','shield'];
  const supported = {
    beast: summonEffects,
    miracle: ['damage_enemy','heal','draw','buff','sweep','shield_heal','drain','renew','fusion'],
    gimmick: ['ambush','barrier','spring','fountain'],
    fusion: summonEffects,
  };
  for (const c of CARDS) {
    assert.ok(ELEMENTS.some(e => e.id === c.element), c.id);
    assert.ok(supported[c.type].includes(c.effect.kind), c.id);
    if (c.type==='fusion') assert.equal(c.cost,0,c.id);
    else assert.ok(Number.isInteger(c.cost) && c.cost >=1 && c.cost <=8, c.id);
    assert.ok(Number.isInteger(c.effect.value) && c.effect.value >=0, c.id);
    assert.ok(RARITY_ORDER.includes(c.rarity), c.id);
    assert.ok(c.text.length>8 && !c.text.includes('undefined'), c.id);
    assert.ok(c.flavor.length>5, c.id);
    assert.ok(c.art>=0 && c.art<40, c.id);
    assert.ok(c.keywords.every(k => ['guard','rush','drain'].includes(k)), c.id);
    if (c.category === 'beast') assert.ok((c.type==='fusion'?['hybrid']:['attack','defense']).includes(c.model),c.id);
    if(c.type === 'beast') { assert.ok(c.attack>0 && c.hp>0 && c.art<16,c.id); assert.equal(c.category,'beast',c.id); }
    if(c.type === 'miracle') {
      assert.ok(c.art>=16 && c.art<20,c.id);
      if(c.subtype==='regeneration') assert.ok(['heal','shield_heal','drain','renew','fusion'].includes(c.effect.kind),c.id);
      else assert.ok(c.subtype==='power'&&['damage_enemy','draw','buff','sweep'].includes(c.effect.kind),c.id);
    }
    if(c.type === 'gimmick') {
      assert.ok(c.art>=20 && c.art<24,c.id);
      assert.equal(c.subtype,['ambush','barrier'].includes(c.effect.kind)?'reflection':'support',c.id);
    }
    if(c.type === 'fusion') {
      assert.equal(c.category,'beast',c.id);
      assert.equal(c.model,'hybrid',c.id);
      assert.ok(c.text.includes(MODEL_DESCRIPTIONS.hybrid),c.id);
      assert.ok(!c.text.includes('守備力にかかわらず消滅'),c.id);
      assert.ok(c.art>=24 && c.art<40,c.id);
      assert.ok(c.attack>=400 && c.attack<=700 && c.hp>=400 && c.hp<=700,c.id);
      assert.ok(c.text.startsWith('特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+100。'),c.id);
    }
  }
});

test('seven origins preserve the card counts with one maximum-cost King beast', () => {
  assert.equal(ORIGINS.length,7);
  assert.equal(ELEMENTS,ORIGINS);
  assert.deepEqual(ORIGINS.map(o=>o.id),['mountain','river','seed','grass','flower','tree','king']);
  assert.deepEqual(ORIGINS.map(o=>o.name),['山','川','種','草','花','木','王']);
  const mapping={dawn:'flower',tide:'river',ember:'seed',gale:'grass',grove:'tree',stone:'mountain',dusk:'seed',aether:'grass'};
  assert.equal(new Set(CARDS.map(c=>c.series)).size,8);
  for (const [series,origin] of Object.entries(mapping)) {
    for (const [type,n] of [['beast',64],['miracle',32],['gimmick',32],['fusion',16]]) {
      const cards=CARDS.filter(c=>c.series===series&&c.type===type);
      assert.equal(cards.length,n,`${series}/${type}`);
      assert.ok(cards.every(c=>c.origin===(c.id==='B0512'?'king':origin)&&c.element===c.origin));
    }
  }
  for (const origin of ORIGINS.filter(o=>o.id!=='king')) {
    const multiplier=['seed','grass'].includes(origin.id)?2:1;
    for (const [type,n] of [['beast',64],['miracle',32],['gimmick',32],['fusion',16]]) assert.equal(CARDS.filter(c=>c.origin===origin.id&&c.type===type).length,n*multiplier-(origin.id==='grass'&&type==='beast'?1:0));
  }
});

test('King representative remains a normal beast at the maximum cost', () => {
  const king=getCard('B0512');
  assert.equal(king.name,'王冠竜 レガリア');assert.equal(king.type,'beast');assert.equal(king.origin,'king');
  assert.equal(king.cost,Math.max(...CARDS.filter(c=>c.type==='beast').map(c=>c.cost)));
  assert.equal(king.cost,8);assert.equal(king.rarity,'GGR');assert.equal(CARDS.filter(c=>c.origin==='king').length,1);
});

test('eight starters each provide exactly 32 main plus 4 special cards', () => {
  assert.equal(STARTER_DECKS.length,8);
  for(const deck of STARTER_DECKS) {
    assert.deepEqual(validateDeck(deck.ids),{valid:true,errors:[]});
    assert.deepEqual(validateSpecialDeck(deck.specialIds),{valid:true,errors:[]});
    assert.equal(deck.ids.length,DECK_SIZE);
    assert.equal(deck.specialIds.length,SPECIAL_DECK_SIZE);
    assert.equal(deck.ids.length+deck.specialIds.length,36);
    assert.equal(deck.ids.filter(id=>getCard(id).type==='beast').length,16);
    assert.equal(deck.ids.filter(id=>getCard(id).type==='miracle').length,8);
    assert.equal(deck.ids.filter(id=>getCard(id).type==='gimmick').length,8);
    assert.equal(deck.ids.filter(id=>id===FUSION_CARD_ID).length,2);
    for(const ids of [deck.ids,deck.specialIds])assert.ok(ids.every(id=>ids.filter(other=>other===id).length<=DECK_COPY_LIMIT));
    assert.ok(deck.ids.every(id=>id===FUSION_CARD_ID||getCard(id).element===deck.element));
    assert.ok(deck.ids.filter(id=>getCard(id).cost<=2).length>=12);
    assert.ok(deck.ids.some(id=>getCard(id).rarity==='GGR'));
    assert.equal(new Set(deck.specialIds).size,4);
    assert.ok(deck.specialIds.every(id=>getCard(id).type==='fusion'&&getCard(id).element===deck.element));
  }
});

test('main-deck validation enforces exact 32 cards, card types and at most two copies', () => {
  assert.equal(DECK_SIZE,32);
  assert.equal(DECK_MIN,32);
  assert.equal(DECK_MAX,32);
  assert.equal(DECK_COPY_LIMIT,2);
  assert.equal(validateDeck(null).valid,false);
  assert.equal(validateDeck([]).valid,false);
  const base=STARTER_DECKS[0].ids.slice();
  const more=CARDS.filter(c=>c.type==='beast'&&!base.includes(c.id)).slice(0,13).map(c=>c.id);
  assert.equal(validateDeck(base.slice(0,31)).valid,false);
  assert.equal(validateDeck(base).valid,true);
  const third=[...base],duplicated=base[0];
  assert.equal(base.filter(id=>id===duplicated).length,2);
  third[third.findIndex(id=>id!==duplicated)]=duplicated;
  assert.equal(validateDeck(third).valid,false);
  assert.ok(validateDeck(third).errors.some(error=>error.includes('2枚まで')));
  assert.deepEqual(base,STARTER_DECKS[0].ids);
  assert.equal(validateDeck([...base,more[0]]).valid,false);
  assert.equal(validateDeck([...base,...more]).valid,false);
  assert.equal(validateDeck(['F0001',...base.slice(1)]).valid,false);
  assert.equal(validateDeck(['UNKNOWN',...base.slice(1)]).valid,false);
  const dup=Array(DECK_SIZE).fill('B0001');
  assert.equal(validateDeck(dup).valid,false);
  assert.deepEqual(dup,Array(DECK_SIZE).fill('B0001'));
  // Main-deck type proportions are customizable; the 16/8/8 split is the starter preset.
  assert.equal(validateDeck(CARDS.filter(c=>c.type==='miracle').slice(0,32).map(c=>c.id)).valid,true);
});

test('special-deck validation requires exactly four fusion cards and enforces copy limits', () => {
  assert.equal(SPECIAL_DECK_SIZE,4);
  assert.equal(validateSpecialDeck(null).valid,false);
  assert.equal(validateSpecialDeck([]).valid,false);
  const special=STARTER_DECKS[0].specialIds.slice();
  assert.equal(validateSpecialDeck(special).valid,true);
  assert.equal(validateSpecialDeck(special.slice(0,3)).valid,false);
  assert.equal(validateSpecialDeck([...special,'F0002']).valid,false);
  assert.equal(validateSpecialDeck(['B0001',...special.slice(1)]).valid,false);
  assert.equal(validateSpecialDeck(['UNKNOWN',...special.slice(1)]).valid,false);
  assert.equal(validateSpecialDeck(['F0001','F0001','F0002','F0002']).valid,true);
  assert.equal(validateSpecialDeck(['F0001','F0001','F0001','F0002']).valid,false);
  assert.equal(validateSpecialDeck(['F0001','F0001','F0001','F0001']).valid,false);
  assert.deepEqual(special,STARTER_DECKS[0].specialIds);
});

test('the fusion miracle has a stable identity, cost and unrestricted own-beast material text', () => {
  assert.equal(FUSION_CARD_ID,'M0256');
  const c=getCard(FUSION_CARD_ID);
  assert.equal(c.name,'合成');
  assert.equal(c.type,'miracle');
  assert.equal(c.subtype,'regeneration');
  assert.equal(c.cost,3);
  assert.equal(c.rarity,'R');
  assert.equal(c.art,18);
  assert.deepEqual(c.effect,{kind:'fusion',value:0});
  for(const phrase of ['手持ち','出場ゾーン','お墓ゾーン','1枚以上','すべて異世界ゾーンへ送る','特殊ゾーン','追加エーテルは不要']) assert.ok(c.text.includes(phrase));
  assert.ok(c.text.includes('合成魔獣を含む'));
  assert.ok(c.text.includes('1つのゾーンだけでも、混合でもよい'));
});

test('signature beast retains its established identity and mechanics', () => {
  const c=getCard('B0001');
  assert.equal(c.name,'星冠竜 アストレイア');
  assert.equal(c.element,'flower');
  assert.equal(c.cost,6);
  assert.equal(c.attack,600);
  assert.equal(c.hp,700);
  assert.deepEqual(c.effect,{kind:'shield',value:200});
  assert.deepEqual(c.keywords,['guard']);
});

test('draw rules state the four-card cap and delayed support gimmicks match their effects', () => {
  for (const card of CARDS.filter(c=>c.effect.kind==='draw')) {
    assert.match(card.text,/手札が4枚/);
    assert.ok(!card.text.includes('墓地へ送る'));
  }
  const boosts=CARDS.filter(c=>c.type==='gimmick'&&c.effect.kind==='spring');
  assert.equal(boosts.length,64);
  for (const card of boosts) {
    assert.ok([100,200,300].includes(card.effect.value));
    assert.ok(card.text.includes('攻撃力・現在守備力・最大守備力'));
    assert.ok(card.text.includes(String(card.effect.value)));
    assert.ok(!card.text.includes('結界'));
  }
  const restores=CARDS.filter(c=>c.type==='gimmick'&&c.effect.kind==='fountain');
  assert.equal(restores.length,64);
  for(const card of restores) {
    assert.ok(card.text.includes(`守備力を${card.effect.value}回復`));
    assert.ok(card.text.includes('最大守備力を超えない'));
  }
});

test('all six requested rarity levels appear across every card type in exact order', () => {
  assert.deepEqual(RARITY_ORDER,['N','R','KR','KKR','GR','GGR']);
  assert.deepEqual(RARITY_ORDER.map(r=>RARITY_LABELS[r]),['ノーマル','レア','キラレア','キラキラレア','ギラレア','ギラギラレア']);
  for (const type of ['beast','miracle','gimmick','fusion']) {
    for (const rarity of RARITY_ORDER) assert.ok(CARDS.some(c=>c.type===type&&c.rarity===rarity),`${type}/${rarity}`);
  }
  for (const element of ELEMENTS) assert.ok(CARDS.some(c=>c.type==='beast'&&c.element===element.id&&c.rarity==='GGR'));
  assert.equal(getCard('B0001').rarity,'GGR');
});


test('battle points use hundreds without scaling counts, costs or energy', () => {
  assert.equal(POINT_SCALE,100);
  assert.equal(FUSION_MATERIAL_BONUS,100);
  for (const card of CARDS) {
    assert.equal(card.attack%POINT_SCALE,0,card.id);
    assert.equal(card.hp%POINT_SCALE,0,card.id);
    assert.ok(card.cost>=0&&card.cost<=8,card.id);
    if (card.effect.kind==='draw') assert.ok(card.effect.value>=1&&card.effect.value<=4,card.id);
    else if (['none','fusion'].includes(card.effect.kind)) assert.equal(card.effect.value,0,card.id);
    else {
      assert.equal(card.effect.value%POINT_SCALE,0,card.id);
      assert.ok(card.text.includes(String(card.effect.value)),card.id);
    }
    assert.ok(!card.text.includes('コア'),card.id);
  }
  assert.equal(getCard('M0002').effect.value,400);
  assert.ok(getCard('M0002').text.includes('上限は5000'));
  assert.ok(getCard(FUSION_CARD_ID).text.includes('守備力+100'));
  assert.equal(getCard(FUSION_CARD_ID).cost,3);
});
