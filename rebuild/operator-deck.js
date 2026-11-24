// Server-side integration blueprint only. Not imported by the public UI.
// Never use a local storage flag or client-supplied password to grant this recipe.
import {CARDS,getCard,validateDeck,validateSpecialDeck,SECOND_REGALIA_ID} from './catalog.js?v=20261124-31';
const pick=(pack,type,predicate,n,score)=>CARDS.filter(c=>c.pack===pack&&c.type===type&&predicate(c))
 .sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)).slice(0,n).map(c=>c.id);
const two=id=>[id,id];
const lowBeastScore=c=>(c.keywords.includes('guard')?30:0)+(c.effect.kind==='draw'?20:0)+c.hp/100+c.attack/100-c.cost*3;
const lowBeast=c=>c.cost<=4;
const miracleScore=c=>c.effect.value/100-c.cost;
const trapScore=c=>c.effect.value/100-c.cost*1.5;
const fusionScore=c=>c.attack/100+c.hp/100+(c.keywords.includes('guard')?2:0);
const firstBeasts=pick('BK01','beast',lowBeast,5,lowBeastScore).flatMap(two);
const secondBeasts=[SECOND_REGALIA_ID,SECOND_REGALIA_ID,...pick('BK02','beast',lowBeast,2,lowBeastScore).flatMap(two)];
const firstMiracles=['M0256',...pick('BK01','miracle',c=>c.effect.kind==='damage_enemy'&&c.cost<=4,1,miracleScore),...pick('BK01','miracle',c=>c.effect.kind==='heal'&&c.cost<=4,1,miracleScore),...pick('BK01','miracle',c=>c.effect.kind==='draw',1,miracleScore)];
const secondMiracles=['M0512',...pick('BK02','miracle',c=>c.effect.kind==='damage_enemy'&&c.cost<=4,1,miracleScore),...pick('BK02','miracle',c=>c.effect.kind==='shield_heal'&&c.cost<=4,1,miracleScore),...pick('BK02','miracle',c=>c.effect.kind==='renew',1,miracleScore)];
const traps=pack=>['ambush','barrier','spring','fountain'].flatMap(kind=>pick(pack,'gimmick',c=>c.effect.kind===kind&&c.cost<=4,1,trapScore));
const main=[...firstBeasts,...secondBeasts,...firstMiracles,...secondMiracles,...traps('BK01'),...traps('BK02')];
const special=[...pick('BK01','fusion',()=>true,2,fusionScore),...pick('BK02','fusion',()=>true,2,fusionScore)];
if(!validateDeck(main).valid||!validateSpecialDeck(special).valid)throw Error('Invalid Kirahara blueprint');
export const KIRAHARA_RECIPE=Object.freeze({id:'kirahara',name:'𠮷良原デッキ',main:Object.freeze(main),special:Object.freeze(special)});
// For a later authenticated server action, return required inventory counts only.
// This module never grants cards or modifies a player account.
export function requiredCards(){const out={};for(const id of [...main,...special])out[id]=(out[id]||0)+1;return out;}
