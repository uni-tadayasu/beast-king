import test from 'node:test';
import assert from 'node:assert/strict';
import { handInspectorView } from '../hand-inspector.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const ownCards = {
  OWN_A: { id: 'OWN_A', name: '自分の守護魔獣', type: 'beast', model: 'defense', element: 'mountain', cost: 3, attack: 200, hp: 500, text: '守護。召喚時、ハートポイントに結界200を加える。' },
  OWN_B: { id: 'OWN_B', name: '自分の合成ミラクル', type: 'miracle', element: 'flower', cost: 3, text: '自分の手持ち・出場ゾーン・お墓ゾーンから魔獣を1枚以上選び、異世界ゾーンへ送る。\n特殊ゾーンから合成魔獣を1枚召喚する。素材は一つのゾーンからだけでも、複数のゾーンからでも選べる。素材の2枚目以降、攻撃力と守備力に各100を加える。' },
};
const render = props => handInspectorView({ icon: () => '<svg aria-hidden="true"></svg>', getCard: id => ownCards[id], elementMap: { mountain: { name: '山', color: '#bca789' }, flower: { name: '花', color: '#e6a4be' } }, TYPE_LABELS: { beast: '魔獣カード', miracle: 'ミラクルカード' }, MODEL_LABELS: { defense: 'ディフェンス型' }, ...props });
const gameWith = opponentHand => ({ turn: 4, currentPlayer: 1, players: [{ hand: ['OWN_A', 'OWN_B'], core: 4500 }, { hand: opponentHand, core: 4200 }] });

test('only player 0 hand IDs are resolved; private opponent cards and their names never enter the panel', () => {
  const lookedUp = [];
  const html = render({ game: gameWith(['PRIVATE_CARD']), getCard(id) {
    lookedUp.push(id);
    if (id === 'PRIVATE_CARD') return { id, name: '非公開の相手専用カード名', text: '非公開の相手専用効果' };
    return ownCards[id];
  } });
  assert.deepEqual(lookedUp, ['OWN_A', 'OWN_B']);
  assert.match(html, /自分の守護魔獣/);
  assert.doesNotMatch(html, /PRIVATE_CARD|非公開の相手専用カード名|非公開の相手専用効果/);
  assert.equal((html.match(/data-hand-inspection="true"/g) || []).length, 2);
  const players = [{ hand: ['OWN_A'] }];
  Object.defineProperty(players, 1, { get() { throw new Error('Opponent state must not be read'); } });
  assert.doesNotThrow(() => render({ game: { players } }));
});

test('masked online opponent hands and an empty local hand render without inspecting hidden values', () => {
  const html = render({ game: gameWith([null, null, null, null]), open: true });
  assert.match(html, /data-open="true"/);
  assert.match(html, /自分の守護魔獣/);
  const empty = render({ game: { players: [{ hand: [] }, { hand: [null, null, null, null] }] } });
  assert.match(empty, /手札がありません/);
  assert.doesNotMatch(empty, /data-hand-inspection="true"/);
});

test('the selected play index shows that card’s complete effect; invalid selections safely fall back to the first card', () => {
  const game = gameWith([null, null]);
  const html = render({ game, selected: { kind: 'play', index: 1 } });
  assert.match(html, /data-inspected-card="OWN_B"/);
  assert.match(html, /自分の合成ミラクル/);
  assert.ok(html.includes(`<p>${escape(ownCards.OWN_B.text)}</p>`), 'every sentence of the selected effect is present');
  assert.ok(!html.includes(`<p>${escape(ownCards.OWN_A.text)}</p>`));
  assert.doesNotMatch(html, /<dt>[^<]*攻撃力|攻撃力<\/dt>|守備力<\/dt>/);
  for (const selected of [{ kind: 'play', index: 99 }, { kind: 'play', index: -1 }, { kind: 'play', index: 0.5 }, { kind: 'attack', index: 1 }, undefined]) {
    assert.match(render({ game, selected }), /data-inspected-card="OWN_A"/);
  }
});

test('card text, names, labels, IDs and origin metadata are escaped and cannot inject active markup', () => {
  const card = { ...ownCards.OWN_A, id: 'own"><svg onload="alert(1)">', name: '<img src=x onerror="alert(1)"> & 王', text: '<script>alert("effect")</script>\n最後の一文も表示する。', element: '../private"><img src=x onerror="alert(1)">' };
  const originName = '<iframe src="javascript:alert(1)">';
  const html = render({ game: { players: [{ hand: ['malicious'] }] }, getCard: () => card, elementMap: { [card.element]: { name: originName, color: '#fff;background:url(javascript:alert(1))' } }, TYPE_LABELS: { beast: '<script>type</script>' }, MODEL_LABELS: { defense: '<svg onload="alert(1)">' } });
  for (const value of [card.id, card.name, card.text, originName, '<script>type</script>', '<svg onload="alert(1)">']) assert.ok(html.includes(escape(value)));
  assert.doesNotMatch(html, /<(?:script|iframe)\b|<(?:img|svg)\b[^>]*\bon(?:error|load)=/i);
  assert.doesNotMatch(html, /background:url\(javascript:|src="assets\/profiles\/\.\./);
  assert.match(html, /style="--hand-origin:#c6b1ef"/);
  assert.ok(render({ game: { players: [{ hand: ['OWN_A'] }] }, esc: escape }).includes(ownCards.OWN_A.name));
});

test('rendering leaves the game, hand order, selection and card definitions unchanged', () => {
  const game = gameWith([null, null, null, null]);
  const selected = { kind: 'play', index: 1 };
  const cards = structuredClone(ownCards);
  const before = structuredClone({ game, selected, cards });
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(game); freeze(selected); freeze(cards);
  assert.doesNotThrow(() => render({ game, selected, getCard: id => cards[id] }));
  assert.deepEqual({ game, selected, cards }, before);
});


test('field, set gimmicks, used gimmicks and miracle history are inspectable without leaking hidden cards',()=>{
 const cards={...ownCards,ENEMY_FIELD:{...ownCards.OWN_A,id:'ENEMY_FIELD',name:'相手の公開魔獣'},OWN_TRAP:{id:'OWN_TRAP',type:'gimmick',name:'自分の設置罠',text:'攻撃を反射する'},USED_TRAP:{id:'USED_TRAP',type:'gimmick',name:'相手の使用済み罠',text:'発動時に回復'},USED_SPELL:{...ownCards.OWN_B,id:'USED_SPELL',name:'以前に使ったミラクル'}};
 const game={players:[{hand:['OWN_A'],field:[{uid:'own',cardId:'OWN_A',attack:777,hp:333}],traps:[{uid:'trap',cardId:'OWN_TRAP'}],lastMiracle:'OWN_B',grave:['USED_SPELL','OWN_B']},{hand:['SECRET_HAND'],special:['SECRET_SPECIAL'],deck:['SECRET_DECK'],traps:[{uid:'hidden',cardId:'SECRET_TRAP'}],field:[{uid:'enemy',cardId:'ENEMY_FIELD',attack:999,hp:111}],grave:['USED_TRAP']}]};
 const lookedUp=[],getCard=id=>{lookedUp.push(id);return cards[id]};
 const field=render({game,selected:{kind:'reference',zone:'field',key:'1:enemy'},getCard});
 assert.match(field,/data-inspected-card="ENEMY_FIELD"/);assert.match(field,/>999<\/dd>/);assert.match(field,/>111<\/dd>/);
 const trap=render({game,selected:{kind:'reference',zone:'gimmick',key:'0:trap:trap'},getCard});
 assert.match(trap,/data-inspected-card="OWN_TRAP"/);assert.match(trap,/相手の使用済み罠/);
 const miracle=render({game,selected:{kind:'reference',zone:'miracle',key:'0:grave:0:USED_SPELL'},getCard});
 assert.match(miracle,/data-inspected-card="USED_SPELL"/);assert.match(miracle,/自分・直前の発動/);
 assert.ok(lookedUp.every(id=>!id.startsWith('SECRET_')));
 assert.doesNotMatch(field+trap+miracle,/SECRET_/);
});
