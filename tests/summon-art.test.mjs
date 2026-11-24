import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {CARDS, getCard} from '../catalog.js';
import {resolveSummonArt, computeSummonArtCrop, summonArtSourceFromBackground} from '../summon-art.js';

test('every summonable creature uses an existing published painting with an in-bounds reviewed crop', () => {
  const creatures = CARDS.filter(card => ['beast', 'fusion'].includes(card.type));
  assert.equal(creatures.length, 2625);
  for (const card of creatures) {
    const before = JSON.stringify(card), art = resolveSummonArt(card);
    assert.ok(art, card.id);
    assert.equal(art.cardId, card.id);
    const path = new URL('../' + art.src.split('?')[0], import.meta.url);
    assert.ok(existsSync(path), card.id + ' painting exists');
    assert.equal(art.src.includes('private'), false, card.id + ' default source is public');
    if (art.kind === 'atlas') {
      const crop = computeSummonArtCrop(art, art.sourceWidth, art.sourceHeight);
      assert.ok(crop, card.id + ' valid crop');
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0);
      assert.ok(crop.x + crop.width <= art.sourceWidth && crop.y + crop.height <= art.sourceHeight);
      assert.equal(crop.width, crop.height, card.id + ' reviewed square cell');
    }
    assert.equal(JSON.stringify(card), before, card.id + ' is never mutated');
  }
  assert.equal(resolveSummonArt(getCard('M0001')), null);
  assert.equal(resolveSummonArt({id: 'B9999', type: 'beast'}), null);
});

test('source selection preserves the exact replacement priority and standalone aspect ratio', () => {
  const samples = [
    ['B0001', 'illustration-update-02.webp', 'atlas'],
    ['B0017', 'beast-02.webp', 'atlas'],
    ['B0263', 'selva-20261124.png', 'image'],
    ['B0512', 'king.webp', 'image'],
    ['B1025', 'bk03-atlas-01.webp', 'atlas'],
    ['B2049', 'B2049.png', 'image'],
    ['B2056', 'bk05-origami.webp', 'atlas'],
  ];
  for (const [id, expected, kind] of samples) {
    const art = resolveSummonArt(getCard(id));
    assert.ok(art.src.includes(expected), id);
    assert.equal(art.kind, kind, id);
  }
  const selva = resolveSummonArt(getCard('B0263'));
  assert.deepEqual(computeSummonArtCrop(selva, 1086, 1448), {x: 0, y: 0, width: 1086, height: 1448});
  const atlas = resolveSummonArt(getCard('B2056'));
  assert.deepEqual(computeSummonArtCrop(atlas, 768, 512), {x: 5, y: 5, width: 117.5, height: 117.5});
  assert.equal(computeSummonArtCrop(atlas, 0, 1024), null);
  assert.equal(computeSummonArtCrop({...atlas, crop: {...atlas.crop, x: -1}}, 1536, 1024), null);
});

test('the live card is the only authority for a private replacement and pending art has no fallback', () => {
  const card = getCard('B0512'), approved = 'data:image/webp;base64,V0VCUA==';
  const publicBefore = resolveSummonArt(card);
  assert.equal(resolveSummonArt(card, {sourceOverride: null}), null);
  assert.equal(resolveSummonArt(card, {sourceOverride: ''}), null);
  const privateArt = resolveSummonArt(card, {sourceOverride: approved});
  assert.equal(privateArt.src, approved);
  assert.equal(privateArt.crop, null);
  assert.deepEqual(computeSummonArtCrop(privateArt, 1254, 1254), {x: 0, y: 0, width: 1254, height: 1254});
  assert.deepEqual(resolveSummonArt(card), publicBefore, 'an approved override never changes public resolution');
  const fifth = resolveSummonArt(getCard('B2056'));
  const url = new URL(fifth.src, 'https://www.beast-king.com/').href;
  assert.deepEqual(resolveSummonArt(getCard('B2056'), {sourceOverride: url, baseUrl: 'https://www.beast-king.com/'}), {...fifth, src: url});
});

test('a pending gradient cannot be mistaken for an approved artwork URL', () => {
  assert.equal(summonArtSourceFromBackground('none'), null);
  assert.equal(summonArtSourceFromBackground('radial-gradient(ellipse, #283b5a, #100f24 70%)'), null);
  for (const value of ['url("assets/king.webp")', "url('assets/king.webp')", 'url(assets/king.webp)']) {
    assert.equal(summonArtSourceFromBackground(value), 'assets/king.webp');
  }
  const approved = 'data:image/webp;base64,V0VCUA==';
  assert.equal(summonArtSourceFromBackground(`url("${approved}")`), approved);
});
