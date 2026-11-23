/** Build the portable owner material kit outside the public game. © 2026 Beast King.
 * Usage: node scripts/build-materials.mjs /absolute/output/Beast-King-Original-Materials [/absolute/png-masters]
 * Requires Python/Pillow to extract native-resolution artwork cells.
 */
import {readFile,writeFile,mkdir,cp,readdir,access,realpath} from 'node:fs/promises';
import {dirname,resolve,join,isAbsolute,relative,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import * as catalog from '../catalog.js';
import {BRAND_ICONS} from '../brand-icons.js';
import {validateCardArtManifest} from './validate-card-art.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const web=await access(join(root,'catalog.js')).then(()=>root,()=>join(root,'dist'));
const requested=process.argv[2];
if(!requested||!isAbsolute(requested))throw Error('Owner material kit needs an absolute output directory outside the public frontend.');
const beneath=(base,path)=>{const rel=relative(base,path);return rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel));};
async function canonicalPath(path){try{return await realpath(path);}catch(error){if(error.code!=='ENOENT')throw error;return join(await canonicalPath(dirname(path)),basename(path));}}
const out=await canonicalPath(resolve(requested)),publicRoot=await realpath(web);
if(beneath(publicRoot,out)||beneath(out,publicRoot))throw Error('Owner material kit must be outside, and not above, the public frontend.');
if(process.argv.length>4)throw Error('Usage: node scripts/build-materials.mjs /absolute/output [/absolute/png-masters]');
const masterInput=process.argv[3];
if(masterInput&&!isAbsolute(masterInput))throw Error('The optional PNG masters directory must be an absolute path.');
const masters=masterInput?await realpath(masterInput):null;
const mapping=validateCardArtManifest(JSON.parse(await readFile(join(web,'assets/design-v2/cards/individual/manifest.json'),'utf8')),catalog.CARDS);
const missing=[];
for(const src of new Set(mapping.cards.map(c=>c.src)))if(!await access(join(web,src)).then(()=>true,()=>false))missing.push(src);
if(missing.length)throw Error('Card art is incomplete: '+missing.join(', '));
if(masters){
 const missingMasters=[];
 for(const src of new Set(mapping.cards.map(c=>c.src))){const png=basename(src,'.webp')+'.png';if(!await access(join(masters,png)).then(()=>true,()=>false))missingMasters.push(png);}
 if(missingMasters.length)throw Error('PNG masters are incomplete: '+missingMasters.join(', '));
}
await mkdir(out,{recursive:true});
await mkdir(join(out,'artwork'),{recursive:true});
for(const dir of ['brand','icons','ui','backgrounds'])await cp(join(web,'assets/design-v2',dir),join(out,'assets/design-v2',dir),{recursive:true});
await mkdir(join(out,'assets/design-v2/cards'),{recursive:true});
for(const name of await readdir(join(web,'assets/design-v2/cards')))if(name.endsWith('.svg'))await cp(join(web,'assets/design-v2/cards',name),join(out,'assets/design-v2/cards',name));
await cp(join(web,'assets/profiles'),join(out,'profiles'),{recursive:true});
for(const name of ['favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png','social-ogp.jpg'])await cp(join(web,'assets',name),join(out,name));

const python=[
 'import json,sys','from pathlib import Path','from PIL import Image',
 "web=Path(sys.argv[1]);out=Path(sys.argv[2]);masters=Path(sys.argv[3]) if sys.argv[3] else None",
 "m=json.loads((web/'assets/design-v2/cards/individual/manifest.json').read_text())",
 'loaded={}',"for c in m['cards']:",
 "    public=web/c['src'];path=(masters/(public.stem+'.png')) if masters else public",
 '    if path not in loaded:',
 "        with Image.open(path) as source:",
 "            if masters:assert source.format=='PNG', 'Master must be a PNG: '+str(path)",
 "            with Image.open(public) as published:assert source.size==published.size, 'PNG/public dimensions differ: '+str(path)",
 "            loaded[path]=source.convert('RGB')",
 "    im=loaded[path];columns=c.get('columns',4);rows=c.get('rows',4)",
 "    if c.get('pixelCrop'):","        assert tuple(c['sourceSize'])==im.size, 'Stale source dimensions: '+c['id']",
 "        x,y,w,h=c['pixelCrop'];assert x>=0 and y>=0 and w>0 and h>0 and x+w<=im.width and y+h<=im.height, 'Invalid source crop: '+c['id']",
 "        tile=im.crop((x,y,x+w,y+h))",
 '    elif columns==1 and rows==1:tile=im','    else:',
 "        cellw=im.width/columns;cellh=im.height/rows;inset=m.get('atlasSafetyInset',0.01)",
 "        box=(round((c['column']+inset)*cellw),round((c['row']+inset)*cellh),round((c['column']+1-inset)*cellw),round((c['row']+1-inset)*cellh))",
 '        tile=im.crop(box)',
 "    tile.save(out/'artwork'/(c['id']+'.webp'),'WEBP',quality=94,method=6)",
 "print(json.dumps({'exported':len(m['cards'])}))"
].join('\n');
const result=spawnSync('python',['-c',python,web,out,masters??''],{encoding:'utf8',maxBuffer:1024*1024});
if(result.status!==0)throw Error(result.stderr||result.stdout);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=await readFile(join(web,'app.js'),'utf8');
const art=app.slice(app.indexOf('function art(c)'),app.indexOf('\nfunction counts('));
const markup=app.slice(app.indexOf('function cardMarkup('),app.indexOf('\nconst navItems='));
const ctx=vm.createContext({...catalog,esc,elementMap:Object.fromEntries(catalog.ELEMENTS.map(e=>[e.id,e])),typeColors:{beast:'#b3c6dc',miracle:'#b6c2f4',gimmick:'#e1c68f',fusion:'#d2afe7'},icon:name=>'<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">'+(BRAND_ICONS[name]||BRAND_ICONS.spark)+'</svg>'});
vm.runInContext('function artStyle(c){return "background-image:url(artwork/"+c.id+".webp);background-position:center;background-size:cover"}\n'+art+'\n'+markup+'\nglobalThis.render=cardMarkup;',ctx);
const cards=catalog.CARDS.map(c=>({id:c.id,name:c.name,type:c.type,origin:c.origin,rarity:c.rarity,cost:c.cost,attack:c.attack,hp:c.hp,text:c.text,html:ctx.render(c)}));
const options=entries=>entries.map(([value,label])=>'<option value="'+value+'">'+esc(label)+'</option>').join('');
const profiles=catalog.ORIGINS.map(o=>'<figure><img src="profiles/'+o.id+'.svg" alt="'+o.name+'"><figcaption>'+o.name+'</figcaption></figure>').join('');
const backgrounds=['entry','menu','workshop','solo','multi','rank'].map((key,i)=>'<figure><img loading="lazy" src="assets/design-v2/backgrounds/'+key+'.webp" alt="'+['トップメニュー','通常メニュー','デッキ・ショップ','ソロ','マルチ','ランク'][i]+'"><figcaption>'+['トップメニュー','通常メニュー','デッキ・ショップ','ソロ','マルチ','ランク'][i]+'</figcaption></figure>').join('');
const vectors=[['brand/wordmark.svg','ワードマーク'],['brand/crest.svg','紋章'],['cards/frame-beast.svg','通常魔獣枠'],['cards/frame-fusion.svg','合成魔獣枠'],['cards/frame-miracle.svg','ミラクル枠'],['cards/frame-gimmick.svg','ギミック枠'],['cards/back.svg','カード裏']].map(([src,label])=>'<a href="assets/design-v2/'+src+'">'+label+' SVG</a>').join('');
const baseStyle=await readFile(join(web,'style.css'),'utf8'),designStyle=await readFile(join(web,'design-v2.css'),'utf8');
const kitCss='body{padding:0 0 60px;background:#111429;color:#eee8f5;line-height:1.8}header,main,footer{width:min(1320px,calc(100% - 48px));margin:auto}header{display:flex;align-items:center;gap:24px;padding:36px 0;border-bottom:1px solid #a48dc54d}header img{width:85px;height:85px}h1{font:36px/1.3 Georgia,serif;letter-spacing:.1em}header p{color:#b7aacb;margin-top:6px;font-size:14px}main>section{padding-top:36px}h2{font-size:25px;margin-bottom:15px}.kit-lead{color:#c8bed4;font-size:15px;max-width:880px}.kit-controls{display:flex;flex-wrap:wrap;gap:12px;padding:22px 0}input,select{padding:11px 13px;border:1px solid #9c83b463;background:#1c1d37;color:#ede7f6;font-size:16px;border-radius:4px}input{flex:1;min-width:200px}#results{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:25px}.kit-card .game-card{display:block}.kit-label{font-size:12px;line-height:1.5;color:#b9abc9;margin-top:8px}.kit-label a{color:#e5c899}.kit-pages{display:flex;justify-content:center;align-items:center;gap:24px;margin:26px 0}.kit-button{padding:10px 21px;border:1px solid #a58abd;background:#2a2141;border-radius:5px;color:#f1e7fa;font-size:14px}.kit-icons{display:grid;grid-template-columns:repeat(7,1fr);gap:16px;max-width:760px}.kit-icons figure{text-align:center;background:#1c1d35;padding:17px;border:1px solid #a887bf30}.kit-icons img{width:65px;height:65px;max-width:100%}figcaption{font-size:14px;margin-top:10px}.kit-backgrounds{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.kit-backgrounds img{width:100%;display:block;border-radius:7px}.kit-finish{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px}.kit-finish .kit-card{flex:1 1 150px;max-width:210px}.kit-note{font-size:13px;color:#b0a4c1}footer{margin-top:38px;border-top:1px solid #a48dc54d;padding-top:25px;font-size:13px;color:#a799b9}dialog{border:1px solid #ac8fb9;background:#211c38;border-radius:7px;color:#f0e7f7;padding:30px;width:min(850px,90vw)}dialog::backdrop{background:#07091bdc}dialog .detail-layout{grid-template-columns:280px 1fr}dialog h2{font-size:24px}dialog p{font-size:15px;line-height:1.9;margin:16px 0}dialog>.kit-button{float:right;margin-bottom:16px}.kit-owner-label{color:#e1c69d;font-size:12px;letter-spacing:.08em}.kit-svg-links{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.kit-svg-links a{border:1px solid #a48dc55c;padding:8px 15px;color:#d7c5e7;font-size:14px;text-decoration:none}#count{color:#c6b5d6;font-size:13px;margin-bottom:16px}.kit-card .card-name{font-size:12px}.kit-card .card-effect{font-size:10px}.kit-card .card-kind{font-size:9px}.kit-card .card-stats{font-size:15px}.kit-card .card-imprint{font-size:6px}@media(max-width:800px){.kit-icons{grid-template-columns:repeat(4,1fr)}.kit-backgrounds{grid-template-columns:repeat(2,1fr)}dialog .detail-layout{grid-template-columns:1fr}dialog .game-card{max-width:270px;margin:auto}.kit-finish{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}';
function galleryClient(CARDS,labels){
 const $=id=>document.getElementById(id);let page=1,filtered=CARDS;const size=24;
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function entry(c){return '<div class="kit-card">'+c.html+'<div class="kit-label">'+esc(c.id)+' · '+esc(c.name)+'<br><a download="'+c.id+'.webp" href="artwork/'+c.id+'.webp">イラストを保存</a></div></div>'}
 function render(){filtered=CARDS.filter(c=>($('type').value==='all'||c.type===$('type').value)&&($('origin').value==='all'||c.origin===$('origin').value)&&($('rarity').value==='all'||c.rarity===$('rarity').value)&&(c.id+' '+c.name).toLowerCase().includes($('search').value.trim().toLowerCase()));const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages);$('results').innerHTML=filtered.slice((page-1)*size,page*size).map(entry).join('');$('count').textContent=filtered.length+'枚 / 全1,152枚';$('pages').textContent=page+' / '+pages;$('prev').disabled=page===1;$('next').disabled=page===pages}
 for(const id of ['search','type','origin','rarity'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render()});
 $('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};
 $('finishes').innerHTML=['N','R','KR','KKR','GR','GGR'].map(r=>entry(r==='GGR'?CARDS.find(c=>c.id==='B0512'):CARDS.find(c=>c.rarity===r))).join('');
 $('motion').onclick=()=>{const reduced=document.body.classList.toggle('reduce-motion');$('motion').textContent=reduced?'アニメーションを再生':'アニメーションを停止'};
 document.addEventListener('click',e=>{const b=e.target.closest('.game-card');if(!b)return;const c=CARDS.find(c=>c.id===b.dataset.id);$('detail-body').innerHTML='<div class="detail-layout">'+c.html+'<section><h2>'+esc(c.name)+'</h2><p>'+esc(labels[c.rarity])+' · '+c.id+'</p><p>'+esc(c.text)+'</p><a href="artwork/'+c.id+'.webp" download="'+c.id+'.webp">このイラストを保存</a></section></div>';if(!$('detail').open)$('detail').showModal()});
 $('close').onclick=()=>$('detail').close();render();
}
const html=[
 '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beast King — オリジナル素材集</title><style>',baseStyle,'\n',designStyle,'\n',kitCss,'</style></head><body>',
 '<header><img src="assets/design-v2/brand/crest.svg" alt=""><div><span class="kit-owner-label">OWNER MATERIAL COLLECTION</span><h1>BEAST KING</h1><p>オリジナル素材集 · © 2026 Beast King</p></div></header><main>',
 '<section><h2>1,152枚、それぞれの一枚。</h2><p class="kit-lead">全カードの個別イラスト。線画とガッシュ調の色面、青紫の環境色を共通の描画方針とし、輪郭・ポーズ・構図・生息場所を変えています。文字と数値、動く箔は別のレイヤーで組み立てます。</p><p class="kit-note">この素材集はオーナー向けです。公開ゲームにはダウンロード用ページを設置していません。</p>',
 '<div class="kit-controls"><input id="search" type="search" placeholder="カード名・IDで検索" aria-label="カード名・IDで検索"><select id="type" aria-label="種類"><option value="all">すべての種類</option>',options(Object.entries(catalog.TYPE_LABELS)),'</select><select id="origin" aria-label="オリジン"><option value="all">すべてのオリジン</option>',options(catalog.ORIGINS.map(o=>[o.id,o.name])),'</select><select id="rarity" aria-label="レアリティ"><option value="all">すべてのレアリティ</option>',options(Object.entries(catalog.RARITY_LABELS)),'</select></div>',
 '<p id="count"></p><div id="results"></div><div class="kit-pages"><button class="kit-button" id="prev">前へ</button><span id="pages"></span><button class="kit-button" id="next">次へ</button></div></section>',
 '<section><h2>6段階のアニメーション</h2><p class="kit-note">ノーマルは静かな枠。レア以上は光沢・きらめき・流れる箔・虹色の反射を段階的に重ねます。動きを減らす設定では静止します。</p><button class="kit-button" id="motion">アニメーションを停止</button><div class="kit-finish" id="finishes"></div></section>',
 '<section><h2>7つのオリジン</h2><div class="kit-icons">',profiles,'</div></section><section><h2>6つの風景</h2><div class="kit-backgrounds">',backgrounds,'</div></section>',
 '<section><h2>ブランド・UI・カード枠</h2><div class="kit-svg-links">',vectors,'<a href="social-ogp.jpg">OGP 1200×630</a></div><p class="kit-note">共通アイコンは assets/design-v2/icons、パネル・ボタンは assets/design-v2/ui に収録。ファビコンとアプリアイコンも同梱しています。</p></section>',
 '<section><h2>素材について</h2><p class="kit-lead">イラストは画像生成を用いて制作・検品し、カード枠・アイコン・文字・アニメーションはコードで個別に設計しています。「王冠竜 レガリア」（B0512）は提供画像を編集したものです。通常魔獣、最大コスト8、ギラギラレア。原寸を超える拡大処理はしていません。</p></section></main>',
 '<footer>© 2026 Beast King · 第一弾「六源の覚醒」 · 王オリジン対応版</footer><dialog id="detail"><button class="kit-button" id="close">閉じる</button><div id="detail-body"></div></dialog>',
 '<script>(',galleryClient.toString(),')(',JSON.stringify(cards).replaceAll('<','\\u003c'),',',JSON.stringify(catalog.RARITY_LABELS),');</script></body></html>'
].join('');
await writeFile(join(out,'index.html'),html);
const exported=[];
for(const c of cards){const bytes=await readFile(join(out,'artwork',c.id+'.webp'));exported.push({...c,html:undefined,artwork:'artwork/'+c.id+'.webp',sha256:createHash('sha256').update(bytes).digest('hex')});}
const hashes=new Set(exported.map(c=>c.sha256));
if(hashes.size!==1152)throw Error('Individual artwork files must be distinct.');
await writeFile(join(out,'manifest.json'),JSON.stringify({copyright:'© 2026 Beast King',artworkSource:masters?'PNG masters':'Published WebP assets',cards:exported,origins:catalog.ORIGINS,rarities:catalog.RARITY_LABELS},null,2));
await writeFile(join(out,'README.txt'),'Beast King オリジナル素材集\n\nindex.html をブラウザで開くと、カード検索・6段階の動くレア演出・背景・プロフィールを確認できます。\nartwork/: 1,152枚の個別イラスト WebP\nassets/design-v2/: SVGのブランド・UI・カード枠と背景\nprofiles/: 山、川、種、草、花、木、王のプロフィール\nmanifest.json: カードID・名称・種類・オリジン・レアリティ・ハッシュ\n\nカードの効果・数値を画像に焼き込まず、画面で正確に組み立てています。原版の個別セルをそのまま切り出しており、解像度を増やすための拡大処理はしていません。王冠竜レガリアはユーザー提供画像の編集版です。イラストは画像生成を使用し、枠・アイコン・UIはコードで設計しています。\n\n© 2026 Beast King\n');
console.log(JSON.stringify({output:out,cards:cards.length,distinctArtworkHashes:hashes.size,artworkSource:masters?'PNG masters':'Published WebP assets',ownerOnlyKit:true},null,2));

