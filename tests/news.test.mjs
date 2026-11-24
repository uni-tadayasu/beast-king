import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePublicStatus,publicNewsItems} from '../news.js';

test('public feed keeps published body text, drops drafts and avoids duplicate legacy titles',()=>{
 const text='一段目\n二段目 <script>文字として表示</script>';
 const status={notice:'公開告知',notices:[
  {id:'active',title:'公開告知',body:text,status:'published',phase:'active',startAt:1795474800000},
  {id:'secret',title:'下書き',body:'未公開',status:'draft',phase:'draft'},
  {id:'later',title:'予約',body:'まだ公開前',status:'published',phase:'scheduled'},
 ]};
 const normalized=normalizePublicStatus(status),items=publicNewsItems(status);
 assert.equal(normalized.notices.length,1);
 assert.equal(items.length,1);
 assert.equal(items[0].text,text);
 assert.equal(items[0].title,'公開告知');
 assert.doesNotMatch(JSON.stringify(items),/下書き|まだ公開前/);
});

test('maintenance feed explains actual pause and shows scheduled dates in Japan time',()=>{
 const start=Date.UTC(2026,10,24,7),end=start+3600000;
 const pending=publicNewsItems({maintenance:false,upcomingMaintenance:{startAt:start,endAt:end,message:'サーバー更新'}});
 assert.equal(pending.length,1);
 assert.match(pending[0].title,/2026\/11\/24 16:00/);
 assert.match(pending[0].text,/17:00/);
 const active=publicNewsItems({maintenance:true,maintenanceMessage:'サーバー更新',notice:'受付状況'});
 assert.match(active[0].text,/サーバー更新/);
 assert.match(active[0].text,/取り消しは利用できます/);
 assert.equal(active[1].text,'受付状況');
});
