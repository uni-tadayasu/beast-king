import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readPrivateOperatorArtwork,injectPrivateOperatorArtwork} from '../scripts/private-operator-art.mjs';
import {createAccountUi} from '../account-ui.js';
import {operatorDashboardView} from '../account-views.js';

// A two-pixel test fixture; never the production illustration.
const fixtureArt='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQ2v7Xo7SBiOh/AAA=';
const fixtureBytes=Buffer.from(fixtureArt.split(',')[1],'base64');

test('private build reads its default illustration without an environment setting or upload',async t=>{
 const root=await mkdtemp(join(tmpdir(),'beast-private-art-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal(await readPrivateOperatorArtwork(root,''),null);
 await mkdir(join(root,'server/private'),{recursive:true});
 await writeFile(join(root,'server/private/operator-regalia.webp'),fixtureBytes);
 assert.equal(await readPrivateOperatorArtwork(root,''),fixtureArt);
 await writeFile(join(root,'invalid.webp'),'not an image');
 await assert.rejects(readPrivateOperatorArtwork(root,join(root,'invalid.webp')),/static WebP/);
 await assert.rejects(readPrivateOperatorArtwork(root,join(root,'missing.webp')),/ENOENT/);
});

test('the private raster replaces only the Worker fallback and still requires an entitlement seed',async()=>{
 const source=await readFile(new URL('../server/operator-art.js',import.meta.url),'utf8');
 assert.equal(injectPrivateOperatorArtwork(source,null),source);
 assert(!source.includes(fixtureArt));
 const injected=injectPrivateOperatorArtwork(source,fixtureArt);
 const module=await import('data:text/javascript;base64,'+Buffer.from(injected).toString('base64'));
 assert.equal(await module.operatorRegaliaArtwork('authenticated-entitlement'),fixtureArt);
 assert.equal(await module.operatorRegaliaArtwork(null),null);
 assert.equal(await module.operatorRegaliaArtwork(''),null);
 await assert.rejects(async()=>injectPrivateOperatorArtwork(source,'data:image/svg+xml;base64,PHN2Zy8+'),/invalid private/);
 await assert.rejects(async()=>injectPrivateOperatorArtwork('wrong module',fixtureArt),/insertion point/);
});

test('the authenticated client automatically uses the server art and ignores obsolete local artwork',async t=>{
 const previousStorage=globalThis.localStorage;
 globalThis.localStorage={getItem(){throw Error('Manual artwork storage must not be consulted');}};
 t.after(()=>{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;});
 let identity='operator-fixture',invalidated=false,changed=null,requests=0;
 const grant={id:'operator-kirahara-v1',ids:Array(32).fill('B0512'),specialIds:Array(4).fill('F0128'),artwork:fixtureArt};
 const client={get profile(){return {id:identity};},getStatus:()=>({authInvalidated:invalidated}),async getOperatorDeck(){requests++;return {deck:grant};}};
 const ui=createAccountUi({client,ensureReady:async()=>{},getModal:()=>null,onOperatorDeckChange:value=>{changed=value;}});
 await ui.refreshOperatorDeck();
 assert.equal(requests,1);assert.equal(ui.getOperatorDeck().artwork,fixtureArt);assert.equal(changed.artwork,fixtureArt);
 assert.equal(ui.handleAction('operator-artwork-open'),false,'No upload/setup flow is required or exposed');
 identity='ordinary-fixture';assert.equal(ui.getOperatorDeck(),null);
 identity='operator-fixture';invalidated=true;assert.equal(ui.getOperatorDeck(),null);
});

test('operator dashboard states automatic illustration and has no manual artwork control',()=>{
 const view=operatorDashboardView({snapshot:{deck:{id:'operator-kirahara-v1',unlockedAt:1},stats:{},settings:{},regalia:{}},esc:value=>String(value),icon:()=>''});
 assert.match(view,/専用レガリアのイラストは、運営認証後に自動で適用/);
 assert(!view.includes('operator-artwork-open'));
});
