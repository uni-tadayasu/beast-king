import test from 'node:test';
import assert from 'node:assert/strict';
import {splitMeasuredText,splitMeasuredItems,operatorRewardPageSize} from '../operator-paging.js';
import {operatorDashboardView,playerInboxView} from '../account-views.js';
import {CARDS,getCard} from '../catalog.js';

const unescape=value=>value.replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]));
const readers=html=>[...html.matchAll(/data-op-text="([^"]*)"/g)].map(match=>unescape(match[1]));

test('measured text paging preserves long Japanese titles, emoji and every explicit line break',()=>{
 const value=('𠮷良原への案内です🐉。\n\n一行ごとのお知らせ。\n').repeat(35);
 const fits=text=>text.split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(Array.from(line).length/14)),0)<=3;
 const pages=splitMeasuredText(value,fits);
 assert.ok(pages.length>10);assert.equal(pages.join(''),value);assert.ok(pages.every(fits));
 assert.deepEqual(splitMeasuredText('',fits),['']);
});

test('reward paging keeps all twelve cards exactly once even when their measured row heights differ',()=>{
 const cards=Array.from({length:12},(_,index)=>({id:index,height:index%3===0?2:1}));
 const fits=items=>items.reduce((height,item)=>height+item.height,0)<=3;
 const pages=splitMeasuredItems(cards,fits);
 assert.deepEqual(pages.flat(),cards);assert.ok(pages.every(fits));assert.ok(pages.length>4);
});

test('reward editing limits depend on logical landscape height, including a rotated upright phone',()=>{
 assert.equal(operatorRewardPageSize({width:568,height:320}),1);
 assert.equal(operatorRewardPageSize({width:844,height:390}),1);
 assert.equal(operatorRewardPageSize({width:900,height:500}),2);
 assert.equal(operatorRewardPageSize({width:1024,height:600}),4);
});

test('final review and received gift expose complete titles, bodies, schedules and all reward types through bounded panels',()=>{
 const now=Date.parse('2026-11-24T10:00:00Z'),title='𠮷良原の王庭から届く大切なお知らせ。'.repeat(6).slice(0,80),body='一行ずつの案内です。\n'.repeat(100).slice(0,1000),cards=CARDS.slice(-12).map(card=>({cardId:card.id,count:3}));
 const gift={id:'gift-paging-fixture',kind:'gift',title,body,cards,target:'player-paging-fixture',status:'published',phase:'active',treasure:100000,publishAt:now,expiresAt:now+86400000,claimable:true};
 const review=operatorDashboardView({tab:'gift',draft:gift,step:3,getCard});
 assert.equal(readers(review)[0],title+'\n\n'+body);assert.ok(readers(review)[1].includes(gift.target));
 assert.equal((review.match(/data-op-panel-content=/g)||[]).length,3);
 for(const card of cards)assert.ok(review.includes(getCard(card.cardId).name));
 const inbox=playerInboxView({gifts:[gift],selected:gift.id,tab:'gift',getCard});
 assert.equal(readers(inbox)[0],title+'\n\n'+body);assert.match(inbox,/data-action="inbox-claim"/);
 for(const card of cards)assert.ok(inbox.includes(getCard(card.cardId).name));
});

test('a receipt list opens a full individual record instead of hiding twelve cards inside a short list row',()=>{
 const row={id:'player-receipt-fixture',nickname:'受取の王',claimedAt:Date.now(),saveRevision:9,claim:{treasure:10,cards:CARDS.slice(-12).map(card=>({cardId:card.id,count:3})),convertedTreasure:5}};
 const options={tab:'gift',receiptItem:{kind:'gift',title:'配信の記録'},receipts:{items:[row],total:1,page:0,pageSize:4},getCard};
 const list=operatorDashboardView(options);assert.match(list,/data-action="operator-receipt-open"/);assert(!list.includes('class="op-reward-reader"'));
 const detail=operatorDashboardView({...options,receiptDetailId:row.id});assert.match(detail,/data-action="operator-receipt-close"/);
 assert.ok(readers(detail)[0].includes(row.id));assert.ok(readers(detail)[0].includes('第9版'));
 for(const card of row.claim.cards)assert.ok(detail.includes(getCard(card.cardId).name));
});
