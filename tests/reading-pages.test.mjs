import test from 'node:test';
import assert from 'node:assert/strict';
import {splitReadingText} from '../reading-pages.js';

function assertLossless(source,budget){
 const pages=splitReadingText(source,budget);
 assert.equal(pages.join(''),String(source));
 assert.ok(pages.length>=1);
 if(String(source)!=='')assert.ok(pages.every(page=>page.length>0),'Every nonempty input advances.');
 for(const page of pages)assert.ok(Array.from(page).length<=budget,'Each page honors its code-point budget.');
 return pages;
}

test('Japanese and Latin sentences use complete sentence boundaries when available',()=>{
 assert.deepEqual(assertLossless('攻撃する。守備する。回復する。',9),['攻撃する。','守備する。','回復する。']);
 assert.deepEqual(assertLossless('First move. Next move! Last move?',18),['First move. ','Next move! ','Last move?']);
 assert.deepEqual(assertLossless('「回復する。」次のターンに攻撃。',9),['「回復する。」','次のターンに攻撃。']);
});

test('emoji, supplementary kanji, blank lines, CRLF and surrounding spaces are preserved exactly',()=>{
 const source='  𠮷良原😀の魔獣。\r\n\nHPを1,500回復！\n次に🛡️を付与。  ';
 const pages=assertLossless(source,11);
 for(const page of pages){
  assert.ok(!/^[\uDC00-\uDFFF]/u.test(page),'No page starts with a detached low surrogate.');
  assert.ok(!/[\uD800-\uDBFF]$/u.test(page),'No page ends with a detached high surrogate.');
 }
 assert.deepEqual(assertLossless('A😀B𠮷。',1),['A','😀','B','𠮷','。']);
});

test('long unbroken rule text advances by the budget without loss or an endless boundary search',()=>{
 const source='連続する効果説明'.repeat(37);
 const pages=assertLossless(source,17);
 assert.equal(pages.length,Math.ceil(Array.from(source).length/17));
 assert.ok(pages.slice(0,-1).every(page=>Array.from(page).length===17));
});

test('empty text and non-string inputs have predictable lossless results',()=>{
 assert.deepEqual(splitReadingText('',2),['']);
 for(const source of [null,undefined,42,false])assertLossless(source,3);
});

test('invalid budgets fall back to 200, fractions are floored and huge budgets stay bounded',()=>{
 const source='あ'.repeat(501);
 for(const budget of [0,-1,NaN,Infinity,-Infinity,null,true,'5']){
  const pages=splitReadingText(source,budget);
  assert.equal(pages.join(''),source);
  assert.deepEqual(pages.map(page=>Array.from(page).length),[200,200,101]);
 }
 assert.deepEqual(splitReadingText('abcdefg',3.9),['abc','def','g']);
 assert.deepEqual(splitReadingText('x'.repeat(10001),1e9).map(page=>page.length),[10000,1]);
});
