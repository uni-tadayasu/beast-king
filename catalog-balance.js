/**
 * Balance revision 4. Values here are in 100-point units, before catalog text is
 * generated. Models, keywords, effects, identities and battle rules stay intact.
 * Rarity controls collection frequency, not an unconditional combat multiplier.
 */
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const signatureBeast=card=>card.type==='beast'&&Number(card.id.slice(1))<=449&&(Number(card.id.slice(1))-1)%64===0;

export function balanceCreature(card) {
  if(card.type==='beast') {
    const {kind}=card.effect, originalCost=card.cost;
    const guard=card.keywords.includes('guard'),rush=card.keywords.includes('rush');
    let cost=originalCost,attack=card.attack,hp=card.hp;
    // Replacing the card in hand or improving an entire board needs a real
    // tempo investment. The printed low-tier body does not grow with this cost.
    if(kind==='draw')cost=Math.max(cost,2);
    if(kind==='buff_all')cost=Math.max(cost,guard&&rush?4:3);
    if(card.keywords.length>1)cost=Math.max(cost,2);
    if(card.model==='attack') {
      // These units die to ANY normal attack; reward an opportunity to attack.
      attack+=(rush?1:2)+Math.floor(originalCost/3);
    } else if(!signatureBeast(card)) {
      // Cheap defense should not lock an equal-cost opponent out of combat.
      hp=Math.max(1,Math.min(hp,originalCost+2)-(guard?1:0));
      if(originalCost>=5 || (!guard&&originalCost>=2))attack++;
    }
    if(card.model==='defense'&&signatureBeast(card)&&!guard)attack++;
    // Absorption only pays out after actual heart damage; the old extra
    // attack penalty made several families unable to break even small guards.
    if(card.keywords.includes('drain'))attack++;
    return {...card,cost,attack,hp};
  }
  if(card.type==='fusion') {
    const {kind,value}=card.effect;
    const effectTax=kind==='none'?0:kind==='buff_all'?2:kind==='draw'?value:kind==='damage_core'?value:Math.ceil(value/3);
    const keywordTax=card.keywords.includes('guard')||card.keywords.includes('rush')?1:card.keywords.includes('drain')?1:0;
    const budget=clamp(12-effectTax-keywordTax,8,12);
    const variant=(Number(card.id.slice(1))-1)%4;
    const tilt=[0,-1,1,0][variant];
    const attack=clamp(Math.floor(budget/2)+tilt,4,7),hp=clamp(budget-attack,4,7);
    return {...card,attack,hp};
  }
  return card;
}

export function balancedMiracleStats(kind,rank,element) {
  const extra=(element==='ember'&&kind==='damage_enemy')||(element==='grove'&&(kind==='heal'||kind==='renew'))||(element==='stone'&&kind==='shield')?1:0;
  switch(kind) {
    case 'damage_enemy':return {cost:rank+2,value:2+rank*2+extra};
    case 'heal':return {cost:rank+1,value:4+rank*2+extra};
    case 'draw':return {cost:rank+1,value:rank+1};
    case 'buff':return {cost:rank+1,value:rank+1};
    case 'sweep':return {cost:rank+2,value:rank+1};
    case 'shield':return {cost:rank+2,value:3+rank+extra};
    case 'drain':return {cost:rank+2,value:rank+2};
    case 'renew':return {cost:rank+1,value:2+rank+extra};
    default:throw new Error(`Unsupported miracle family: ${kind}`);
  }
}

export function balancedGimmickStats(kind,rank,element) {
  const bonus=(kind==='ambush'&&element==='dusk')||(kind==='barrier'&&element==='dawn')?1:0;
  if(kind==='ambush')return {cost:rank+1,value:2+rank*2+bonus};
  if(kind==='barrier')return {cost:rank+1,value:3+rank*2+bonus};
  // Equal effects have equal prices, including variants printed at another
  // rarity. Delay is retained and these effects still never heal the player.
  if(kind==='spring'){const value=1+Math.floor(rank/3);return {cost:value*2,value};}
  if(kind==='fountain'){const cost=1+Math.floor(rank/2);return {cost,value:2+cost*2};}
  throw new Error(`Unsupported gimmick family: ${kind}`);
}

/** Expansion bodies pay for conditional engines before any combat points are
 * printed. No rarity multiplier and no change to the original two sets. */
export function balancedExpansionCreature({type,model,tier,role,kind,keywords,value}){
 if(!['beast','fusion'].includes(type))return {attack:0,hp:0};
 const rally=kind.endsWith('_rally')||kind==='echo_chorus',recall=kind.endsWith('_recall');
 const tax=kind==='none'?0:rally?2:recall?2:1;
 const tilt=[0,-1,1,0][role%4];
 if(type==='fusion'){
  const budget=clamp(12-tax-(keywords.length?1:0)-Math.floor(value/400),8,12);
  const attack=clamp(Math.floor(budget/2)+tilt,4,7);
  return {attack:attack*100,hp:clamp(budget-attack,4,7)*100};
 }
 const cost=Math.max(tier+1,rally||recall?3:kind==='none'?1:2);
 const guard=keywords.includes('guard'),rush=keywords.includes('rush');
 const attack=model==='attack'?clamp(cost+2+Math.floor(cost/3)+tilt-tax-(rush?1:0),1,12):clamp(cost+tilt-tax,1,9);
 const hp=model==='attack'?clamp(cost+1-tilt-(rush?1:0),1,9):clamp(cost+2-tilt-(guard?1:0),2,10);
 return {cost,attack:attack*100,hp:hp*100};
}
