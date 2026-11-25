import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, getCard } from '../catalog.js';
import { isApexReliefCard, reliefArtworkForHost, syncCardRelief } from '../card-relief.js';

test('apex relief consistently identifies GGR champions and highest-rarity fusions', () => {
  const cards = CARDS.filter(isApexReliefCard);
  assert.equal(cards.length, 402);
  assert.equal(cards.filter(card => card.type === 'beast').length, 268);
  assert.equal(cards.filter(card => card.type === 'fusion').length, 134);
  for (const id of ['B0001', 'B0512', 'F0522']) assert.equal(isApexReliefCard(getCard(id)), true, id);
  for (const card of cards) {
    assert.equal(card.rarity, 'GGR');
    assert.ok(card.type === 'fusion' || card.type === 'beast' && card.cost >= 6);
  }
});

test('ordinary creatures, spells, traps and lower-rarity fusions keep their existing finish', () => {
  for (const card of [null, {}, {type: 'beast', rarity: 'GGR', cost: 5},
    {type: 'beast', rarity: 'GR', cost: 8}, {type: 'fusion', rarity: 'GR'},
    {type: 'miracle', rarity: 'GGR', cost: 8}, {type: 'gimmick', rarity: 'GGR', cost: 8}]) {
    assert.equal(isApexReliefCard(card), false);
  }
  const card = {type: 'beast', rarity: 'GGR', cost: 6};
  const before = JSON.stringify(card);
  assert.equal(isApexReliefCard(card), true);
  assert.equal(JSON.stringify(card), before, 'finish classification never alters game data');
});

function element(className = '') {
  return {
    className, children: [], dataset: {}, style: {},
    classList: {contains: name => className.split(' ').includes(name)},
    appendChild(child) { child.parent = this; this.children.push(child); },
    prepend(child) { child.parent = this; this.children.unshift(child); },
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const classes = selector.split(',').map(part => part.trim().slice(1));
      return this.children.flatMap(child => [...(classes.includes(child.className) ? [child] : []), ...child.querySelectorAll(selector)]);
    },
  };
}

function fixture() {
  const art = element('card-art');
  Object.assign(art.style, {backgroundImage: 'url("assets/atlas.webp")', backgroundPosition: '66.67% 33.33%', backgroundSize: '408% 408%', backgroundRepeat: 'no-repeat'});
  const doc = {body: {}, getElementById: () => ({}), createElement: () => element()};
  const host = {dataset: {cardRelief: 'apex'}, previousElementSibling: art, closest: () => null, ownerDocument: doc};
  return {art, doc, host, fx: element('bk-fx')};
}

test('relief preserves the exact live atlas crop and refuses unrelated or hidden artwork', () => {
  const {art, host} = fixture();
  assert.deepEqual(reliefArtworkForHost(host), art.style);
  host.closest = () => ({});
  assert.equal(reliefArtworkForHost(host), null, 'face-down zones have no image copy');
  host.closest = () => null;
  host.previousElementSibling = element('another-card-art');
  assert.equal(reliefArtworkForHost(host), null, 'cannot borrow another card illustration');
  host.previousElementSibling = art;
  art.style.backgroundImage = 'radial-gradient(ellipse, #283b5a, #100f24)';
  assert.equal(reliefArtworkForHost(host), null, 'a pending placeholder is not an illustration');
});

test('pending authorization removes every private relief copy and a public replacement is fresh', () => {
  const {art, host, fx, doc} = fixture();
  const privateSource = 'url("data:image/webp;base64,V0VCUA==")';
  art.dataset.regaliaStatus = 'special';
  art.style.backgroundImage = privateSource;
  assert.equal(syncCardRelief(host, fx, doc), true);
  const layers = fx.querySelectorAll('.bk-relief-contour, .bk-relief-polish');
  assert.equal(layers.length, 2);
  assert.ok(layers.every(layer => layer.style.backgroundImage === privateSource));
  assert.equal(host.dataset.reliefReady, 'true');
  art.dataset.regaliaStatus = 'pending';
  assert.equal(syncCardRelief(host, fx, doc), false);
  assert.equal(fx.querySelector('.bk-relief'), null, 'old art disappears even before its style changes');
  assert.equal(host.dataset.reliefReady, undefined);
  art.dataset.regaliaStatus = 'normal';
  art.style.backgroundImage = 'url("assets/design-v2/cards/individual/king.webp")';
  art.style.backgroundSize = 'cover';
  assert.equal(syncCardRelief(host, fx, doc), true);
  assert.ok(fx.querySelectorAll('.bk-relief-contour, .bk-relief-polish').every(layer => layer.style.backgroundImage === art.style.backgroundImage && layer.style.backgroundSize === 'cover'));
  delete host.dataset.cardRelief;
  assert.equal(syncCardRelief(host, fx, doc), false);
  assert.equal(fx.children.length, 0);
});
