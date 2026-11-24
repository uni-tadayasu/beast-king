/** Shared release checks for the complete card-to-artwork mapping. */
import assert from 'node:assert/strict';

export function validateCardArtManifest(manifest,cards){
 // The original two-set release stays immutable when new sets are appended.
 cards=cards.filter(c=>['BK01','BK02'].includes(c.setId));
 assert(cards.length===2304,'The source catalog must contain exactly 2,304 cards.');
 assert(manifest.total===cards.length&&Array.isArray(manifest.cards)&&manifest.cards.length===cards.length,'The artwork manifest must contain all 2,304 cards.');
 assert(Number.isFinite(manifest.atlasSafetyInset)&&manifest.atlasSafetyInset>=0&&manifest.atlasSafetyInset<.5,'Invalid artwork safety inset.');
 const catalog=new Map(cards.map(c=>[c.id,c])),seen=new Set();
 assert(catalog.size===cards.length,'Duplicate card ID in the source catalog.');
 for(const entry of manifest.cards){
  const card=catalog.get(entry.id);
  assert(card&&!seen.has(entry.id),'Unknown or duplicate artwork card ID: '+entry.id);seen.add(entry.id);
  assert(entry.name===card.name,'Artwork name differs from the catalog: '+entry.id);
  const index=Number(card.id.slice(1))-1,king=card.id==='B0512',batch=String(Math.floor(index/16)+1).padStart(2,'0');
  const src='assets/design-v2/cards/individual/'+(king?'king.webp':card.type+'-'+batch+'.webp');
  assert(entry.src===src,'Unexpected artwork source: '+entry.id);
  assert(entry.column===(king?0:index%4)&&entry.row===(king?0:Math.floor(index%16/4)),'Incorrect artwork cell: '+entry.id);
  assert((entry.columns??4)===(king?1:4)&&(entry.rows??4)===(king?1:4),'Incorrect atlas grid: '+entry.id);
  if(entry.pixelCrop!==undefined){
   const crop=entry.pixelCrop,size=entry.sourceSize;
   assert(Array.isArray(crop)&&crop.length===4&&crop.every(Number.isInteger)&&Array.isArray(size)&&size.length===2&&size.every(v=>Number.isInteger(v)&&v>0),'Invalid pixel crop metadata: '+entry.id);
   const [x,y,w,h]=crop;
   assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=size[0]&&y+h<=size[1],'Artwork crop leaves the source image: '+entry.id);
  }
 }
 return manifest;
}
