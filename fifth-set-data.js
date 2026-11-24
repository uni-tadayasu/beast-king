/** BK05: four authored dreamcraft families. Existing cards and saved IDs stay fixed. */
export const FIFTH_CARD_SET=Object.freeze({id:'BK05',edition:5,editionLabel:'第五弾',name:'幻彩の夢界',reading:'げんさいのむかい',coverId:'F0515',cardCount:96,theme:'折紙・玻璃・影絵・彩墨。夢を形にする、96枚の新しい戦略。'});
export const FIFTH_FAMILIES=Object.freeze([
 {id:'origami',name:'折紙',color:'#ffd5aa',setId:'BK05',editionLabel:'第五弾',description:'カードを使った後の手札が1枚以下なら、折紙の効果が強まる。'},
 {id:'glass',name:'玻璃',color:'#8ce9ee',setId:'BK05',editionLabel:'第五弾',description:'結界が200以上あれば200を使い、玻璃の効果を磨き上げる。'},
 {id:'shadow',name:'影絵',color:'#c7abff',setId:'BK05',editionLabel:'第五弾',description:'自分の場の魔獣が相手より少ない時、影絵の効果が強まる。'},
 {id:'pigment',name:'彩墨',color:'#ff91bd',setId:'BK05',editionLabel:'第五弾',description:'カードを使った後の手札に通常魔獣・ミラクル・ギミックが揃うと、彩墨の効果が強まる。'},
].map(Object.freeze));
export const FIFTH_EFFECT_KINDS=Object.freeze(FIFTH_FAMILIES.flatMap(f=>['bolt','aegis','rally','focus'].map(role=>f.id+'_'+role)));

// Each entry is a named subject, a short story, and its individual art direction.
// This order is also the immutable row-major order of each 24-scene art atlas.
const SUBJECTS={
 origami:{
  beast:[
   ['折紙の灯兎 トモリ','一折りの耳が、夜道に小さな灯をともす。','a tiny amber paper rabbit carrying a glowing folded lantern across a moonlit desk'],
   ['折紙の風燕 ハヤテ','白紙の空へ、最初の折り目を描く。','an ivory origami swallow slicing through blue wind ribbons above a paper canyon'],
   ['折紙の結び亀 ムスビ','ほどけない約束を、甲羅の裏にしまっている。','a jade folded-paper tortoise with a knotted ceremonial cord shell beside a quiet pond'],
   ['折紙の刃狐 キリカ','切れ端ひとつで、進むべき道を切り開く。','a vermilion origami fox with razor-sharp pleated tails leaping between hanging paper screens'],
   ['折紙の綴じ狼 ツヅリ','散らばった頁を、群れの足跡で綴じ直す。','a cobalt paper wolf with stitched book-spine armor guarding a bridge of floating pages'],
   ['折紙の舞鶴 オリハ','羽ばたきは、まだ書かれていない旅のしるし。','a long-necked white and coral origami crane dancing over a golden fan-shaped stage'],
   ['折紙の鎧犀 カサネ','薄い紙も、重ねた想いなら盾になる。','a broad indigo paper rhinoceros plated in layered folded armor pushing through confetti mist'],
   ['折紙の回し鹿 マワリ','曲がり角ごとに、夢の続きを折り足す。','a mint paper stag with rotating pinwheel antlers standing among spiral paper trees'],
   ['折紙の便箋梟 フミノ','届け先のない手紙にも、帰る場所を教える。','a parchment origami owl with sealed-envelope wings perched on an inkless fountain pen'],
   ['折紙の夜行虎 ヨイリ','折り目の影を踏み、夜そのものを越えてゆく。','a black and saffron folded-paper tiger stalking through a red lantern alley'],
   ['折紙の扇尾鳳 センカ','尾の一枚一枚が、違う朝焼けを覚えている。','a magnificent origami phoenix with a wide rainbow folding-fan tail emerging from paper flames'],
   ['折紙の白頁麒麟 ハクヨウ','余白から生まれた王は、終わりのない物語を歩く。','a luminous white-paper qilin with elegant folded horns and gold-edged mane in a vast blank-paper palace'],
  ],
  miracle:[
   ['折紙・一閃の折り目','迷いをたたみ、ひとすじの光へ。','a single blazing diagonal crease splitting a dark sheet of paper into luminous wings'],
   ['折紙・千羽の帳','小さな願いが、いくつもの羽になった。','a protective dome made of hundreds of tiny white folded cranes above a sleeping village'],
   ['折紙・連ねる翼','残した一枚が、次の飛翔を決める。','a flock of connected red and gold folded wings spiraling into a rising helix'],
   ['折紙・一葉の誓い','最後の頁にこそ、いちばん強い名を書く。','one ivory folded leaf unfolding into a radiant crest over a fox silhouette'],
   ['折紙・白紙の朝','書き直すことは、歩みを捨てることではない。','soft dawn light washing ink wounds from a folded paper heart beside a clear spring'],
   ['折紙・夢綴じの合成','別々の物語が、ひとつの背表紙を得る。','two intricate origami animal silhouettes joining inside a luminous bookbinding circle'],
  ],
  gimmick:[
   ['折紙・切返しの屏風','その一歩で、裏面の牙が目を覚ます。','a crimson folding screen snapping shut with a concealed paper-blade animal shadow'],
   ['折紙・折返しの鏡庭','飛び込んだ勢いは、折り返されて戻る。','an angular mirrored paper garden bending an incoming beam back through nested folds'],
   ['折紙・眠れる白城','夜を越えるたび、城壁に新しい折り目が増える。','a sleeping miniature white origami castle surrounded by nested translucent paper shields'],
   ['折紙・旅立ちの工房','次の朝には、皆の翼ができあがる。','a warm lantern-lit workshop where unfinished paper beasts grow wide new wings'],
  ],
  fusion:[
   ['夢綴獣 オリガミ・アーク','最後の頁が閉じる時、すべての翼が開く。','an enormous origami chimera with crane wings, fox tails and a lion body unfolding from an ancient ivory storybook'],
   ['千折王 キリガミ・アマツ','千の折り目は、一つの空へ続いている。','a regal many-folded paper dragon-deer with a vast fan crown towering above a floating pagoda of pages'],
  ],
 },
 glass:{
  beast:[
   ['玻璃の雫魚 シズク','割れそうな光を、水のゆりかごで育てる。','a tiny clear-glass fish with a single turquoise droplet heart swimming over dark velvet'],
   ['玻璃の跳兎 プリム','跳ねるたび、光は知らない色になる。','a lively pink prismatic glass rabbit jumping between rainbows on a tiled floor'],
   ['玻璃の瓶亀 フラスコ','背中の海には、ひと粒の夜が沈んでいる。','a round blown-glass tortoise with a bottle-shell containing a miniature midnight ocean'],
   ['玻璃の針蜂 ニードル','一筋の光さえ、狙いを違えない。','a slender amber crystal bee with a needle-shaped abdomen diving through fractured sunlight'],
   ['玻璃の彩角鹿 リフラ','守った光を、仲間の角へ分け与える。','a stained-glass stag with branching cyan and gold antlers projecting protective colored windows'],
   ['玻璃の裂翼鷹 スペクト','砕けた空に、獲物の影だけが残る。','a sharp-winged sapphire glass hawk scattering triangular reflections during a steep dive'],
   ['玻璃の窓殻蟹 ステラ','その城壁は、向こうの景色まで守っている。','a wide stained-glass crab with a cathedral-window shell guarding a luminous tide pool'],
   ['玻璃の流尾豹 フルーラ','流れる硝子に、触れられる隙はない。','a sleek molten-glass leopard with flowing violet tail racing across a polished black floor'],
   ['玻璃の灯籠梟 ランテル','灯を消さない限り、帰り道は透き通っている。','a translucent teal owl with a glowing lantern torso perched beneath crystal chandeliers'],
   ['玻璃の破虹虎 クラック','傷さえも、七色の牙に変えてゆく。','a powerful cracked-glass tiger whose fractures glow with fiery rainbow light'],
   ['玻璃の万華孔雀 カレイド','数えきれない世界が、一つの尾に映る。','a grand kaleidoscope peacock displaying an intricate circular tail of emerald and magenta glass eyes'],
   ['玻璃の澄界白鯨 クリアラ','透き通る海で、壊れなかった願いを運ぶ。','a majestic transparent glass whale with a luminous inner reef floating through a deep indigo hall'],
  ],
  miracle:[
   ['玻璃・虹を割る光','失った欠片から、鋭い答えが生まれる。','a concentrated rainbow beam bursting through a broken crystal lens toward darkness'],
   ['玻璃・重なる光壁','光を一枚重ねるたび、世界は静かになる。','layered cyan and gold translucent glass shields forming a luminous nested fortress'],
   ['玻璃・磨き上げる誓い','分け合った輝きは、曇ることを知らない。','several glass animal silhouettes reflecting a shared brilliant polishing light from a central prism'],
   ['玻璃・一晶の覚醒','一つの欠片にも、世界を映す力がある。','a small faceted crystal opening into a powerful luminous beast-shaped spectral aura'],
   ['玻璃・傷を満たす雫','ひびの向こうで、光はまた繋がる。','liquid rainbow droplets gently filling the cracks of a heart-shaped glass vessel'],
   ['玻璃・万華の合成','別々の色が、ひとつの輪郭を選ぶ。','two glass animal forms merging through a rotating kaleidoscope portal of vivid jewels'],
  ],
  gimmick:[
   ['玻璃・砕光の迎撃窓','割った窓の向こうには、鋭い光が待っている。','a stained-glass window shattering outward into precisely aimed luminous shards'],
   ['玻璃・返照の回廊','急ぐほど、同じ光に追い越される。','an endless emerald mirror corridor redirecting a red attack beam back to its source'],
   ['玻璃・夜明けの温室','暗い夜にも、次の光を育てている。','a crystal greenhouse at dawn nurturing small floating shield prisms among glass flowers'],
   ['玻璃・響き合う天蓋','全ての欠片が、同じ朝を歌い出す。','a radiant cathedral glass canopy sending colored light into waiting beast-shaped sculptures'],
  ],
  fusion:[
   ['万華獣 プリズマ・ノヴァ','砕けた景色を、ひとつの虹へ束ねる。','a magnificent stained-glass chimera with peacock wings, stag horns and a lion body above a kaleidoscope sea'],
   ['澄界王 ヴィトラ・ルクス','守り抜いた光だけが、その王冠を形づくる。','a monumental transparent crystal leviathan crowned by a circular cathedral window within an ocean of refracted light'],
  ],
 },
 shadow:{
  beast:[
   ['影絵の足音鼠 コソリ','見つからない歩幅で、物語の端を進む。','a small cut-paper shadow mouse creeping between oversized lantern-lit silhouettes'],
   ['影絵の跳灯兎 ハネル','灯の届かない場所にも、跳び石はある。','a long-eared shadow-puppet rabbit leaping across pools of warm stage light'],
   ['影絵の幕殻亀 トバリ','幕が下りても、守る役目は終わらない。','a shadow-theatre tortoise with a heavy curtain shell bracing beneath a single amber spotlight'],
   ['影絵の刺月鴉 サシハ','空いた隙間に、月の切れ端を差し込む。','a razor-beaked silhouette raven diving across a huge white paper moon'],
   ['影絵の綱狐 クグリ','細い綱ほど、仲間の道を遠くへ伸ばす。','a shadow fox balancing on luminous marionette threads above a miniature stage city'],
   ['影絵の抜駆狼 スリト','多くの足音の中に、たった一つの勝機を聞く。','a sleek violet-edged shadow wolf slipping between much larger enemy silhouettes'],
   ['影絵の黒幕熊 クロコ','見えないところで、舞台の全部を支えている。','a broad black bear silhouette holding up enormous theatre curtains with gold-edged paws'],
   ['影絵の灯渡豹 ヒワタリ','逆光の向こうから、一瞬だけ姿を見せる。','a lithe shadow leopard springing between suspended lanterns in a deep violet theatre'],
   ['影絵の糸見梟 イトミ','絡んだ筋書きも、夜の目には見えている。','an owl shadow-puppet with luminous thread eyes watching a web of golden strings'],
   ['影絵の逆境虎 ヒトエ','最後に残った影ほど、大きく伸びる。','a lone black tiger silhouette confronting a wall of towering monsters beneath a low sunset'],
   ['影絵の百幕鶴 カゲツル','羽の内側に、百の舞台を隠している。','a graceful tall shadow crane whose sweeping wings reveal many nested miniature theatres'],
   ['影絵の終幕獅子 ダンマク','拍手が止んだ後、王の影が立ち上がる。','a majestic lion made of layered cut-paper shadows rising before a crimson final curtain'],
  ],
  miracle:[
   ['影絵・逆光の一矢','眩しさの向こうから、細い影が届く。','a thin black arrow slicing across a blinding gold stage spotlight'],
   ['影絵・孤影の帳','独りで立つ影を、夜のすべてが包む。','one small beast silhouette enclosed by a broad protective canopy of violet shadow'],
   ['影絵・少数の喝采','声が少ないほど、決意はよく響く。','a handful of heroic animal silhouettes growing tall as golden applause sparks illuminate them'],
   ['影絵・主役の交代','隅にいた者が、光の真ん中へ歩き出す。','a humble fox shadow stepping into a brilliant spotlight and becoming a towering stage guardian'],
   ['影絵・幕間の休息','灯が落ちる一瞬に、次の勇気を繕う。','a quiet shadow-puppet resting on a red velvet cushion under gentle healing lantern light'],
   ['影絵・重幕の合成','二つの影が重なれば、新しい輪郭が始まる。','two distinct animal shadows overlapping on a glowing paper screen to form one great chimera'],
  ],
  gimmick:[
   ['影絵・隠れ牙の袖幕','舞台の外にも、物語は続いている。','dark theatre side curtains revealing sudden long silver-edged shadow fangs'],
   ['影絵・返幕の見立て','振り下ろした刃は、もう一つの影を打つ。','a revolving shadow screen catching an incoming spear silhouette and sending it back'],
   ['影絵・灯守りの舞台','次の幕が開くまで、この灯だけは絶やさない。','an empty midnight puppet stage protected by a circle of unwavering violet lanterns'],
   ['影絵・逆転の脚本','追い詰められた頁から、結末を書き換える。','a black script scroll rewriting itself in gold while small beast shadows rise above large foes'],
  ],
  fusion:[
   ['重幕獣 シャドウ・リベル','小さな影を重ね、巨大な筋書きに抗う。','a grand shadow chimera with wolf head, crane wings and many elegant fox tails confronting a gigantic spotlight'],
   ['終幕王 シルエット・ノクス','全ての灯が消えた時、最後の王だけが見える。','a colossal crowned black lion silhouette with layered violet paper mane ruling an empty starless theatre'],
  ],
 },
 pigment:{
  beast:[
   ['彩墨の点蛙 テンテン','たった一滴にも、飛び出す勇気がある。','a tiny round ink frog formed from bright coral paint droplets on white rice paper'],
   ['彩墨の筆尾鼬 フデリ','通った道は、いつでも描きたてだ。','a playful turquoise ink weasel with a paintbrush tail drawing a fresh blue river'],
   ['彩墨の墨甲亀 スミガメ','渇いた線の内側で、色を静かに守る。','a stout black-ink tortoise with a glossy lacquer shell holding pools of jewel-toned paint'],
   ['彩墨の飛沫蜂 ハジキ','ひと刺しが、景色の色を塗り替える。','a vivid yellow and magenta paint-splash bee streaking across a dramatic brushstroke'],
   ['彩墨の結色鹿 ユイロ','異なる色を、同じ森の枝へ結ぶ。','a graceful ink-wash stag whose antlers carry ribbons of red blue and golden pigment'],
   ['彩墨の刷羽鷹 スリハ','空へ一刷け、風へもう一刷け。','a dynamic cobalt ink hawk with broad paintbrush wings sweeping over vermilion clouds'],
   ['彩墨の岩彩熊 イワネ','落ち着いた色ほど、深く強い土台になる。','a large earthy mineral-pigment bear with rugged ochre paws beside an emerald painted mountain'],
   ['彩墨の流彩豹 ナガレ','止まらない色は、檻にも収まらない。','a swift leopard made of flowing magenta and teal ink streams racing across wet paper'],
   ['彩墨の混色梟 マゼラ','夜の静けさから、新しい色を見つけ出す。','a thoughtful ink owl mixing three luminous pools of pigment with feather brushes'],
   ['彩墨の朱奔虎 アカハシ','赤い一筆が、ためらう世界を駆け抜ける。','a fierce vermilion brush-painted tiger lunging from a huge calligraphic red stroke'],
   ['彩墨の彩雨鳳 ニジサメ','乾いた夢にも、もう一度色の雨を降らせる。','a glorious phoenix shedding a rain of distinct rainbow ink droplets from long painted feathers'],
   ['彩墨の無辺墨龍 ムゲン','まだ名前のない色で、世界の続きを描く。','an immense black-ink dragon with luminous multicolor veins swirling through an endless scroll painting'],
  ],
  miracle:[
   ['彩墨・三彩の一閃','三つの色が揃う時、光は迷わない。','three red blue and gold paint streams joining into a sharp luminous projectile'],
   ['彩墨・彩雲の結界','重なった色が、雨にも消えない壁になる。','a protective dome painted from interlaced pink cyan and gold cloud-shaped brushstrokes'],
   ['彩墨・合奏する筆先','違う筆先でも、同じ明日を描ける。','several animated paintbrushes painting glowing strength into a group of ink beasts'],
   ['彩墨・一筆の真景','一体の輪郭に、すべての色を託す。','one small ink beast receiving a grand triple-colored brushstroke aura on luminous paper'],
   ['彩墨・潤いの余白','描かなかった場所が、傷を休ませてくれる。','clear water restoring color to a faded ink heart surrounded by peaceful white paper'],
   ['彩墨・夢描きの合成','違う色だからこそ、生まれる姿がある。','two vividly painted animal spirits merging inside a rotating circular ink-wash brushstroke'],
  ],
  gimmick:[
   ['彩墨・跳ね墨の罠','踏み込んだ足元から、鮮やかな牙が跳ねる。','a puddle of black and crimson ink suddenly erupting into animal-shaped fangs'],
   ['彩墨・返彩の水鏡','投げ込んだ色は、波紋になって帰ってくる。','a perfectly round liquid-pigment mirror reflecting a red attack as a blue curling wave'],
   ['彩墨・三色の硯','次の朝のために、三つの色を満たしておく。','three ceremonial inkstones filled with glowing cyan magenta and gold beneath a soft moon'],
   ['彩墨・色めく画房','朝になれば、描いた仲間が歩き出す。','a magical art studio where colorful beast paintings step out of hanging scrolls at dawn'],
  ],
  fusion:[
   ['夢描獣 クロマ・ミラージュ','交わらなかった色が、同じ夢の獣になる。','a majestic ink chimera combining tiger body, phoenix wings and stag antlers in vivid cyan magenta and gold'],
   ['無彩王 インク・エタニア','すべての色を抱く黒が、最後に夢を守る。','a monumental black-ink dragon-whale with a radiant prismatic halo emerging from an endless floating scroll'],
  ],
 },
};
const ORIGINS=['mountain','river','seed','grass','flower','tree'];
const TYPES=[['beast','B',2056,12],['miracle','M',1031,6],['gimmick','G',1027,4],['fusion','F',515,2]];
export const FIFTH_ART_DIRECTION=Object.freeze(FIFTH_FAMILIES.flatMap((family,familyIndex)=>TYPES.flatMap(([type,prefix,start,count])=>SUBJECTS[family.id][type].map(([name,flavor,subject],local)=>Object.freeze({id:prefix+String(start+familyIndex*count+local).padStart(4,'0'),name,flavor,subject,type,family:family.id,origin:ORIGINS[(familyIndex*count+local+(type==='fusion'?4:0))%6]})))));

const BEAST_ROLES=[
 {cost:1,attack:100,hp:300,model:'defense',kind:'none',value:0,rarity:'N',keywords:['guard']},
 {cost:1,attack:300,hp:200,model:'attack',kind:'none',value:0,rarity:'N',keywords:[]},
 {cost:2,attack:200,hp:400,model:'defense',kind:'aegis',value:200,rarity:'N',keywords:[]},
 {cost:2,attack:400,hp:200,model:'attack',kind:'bolt',value:100,rarity:'R',keywords:[]},
 {cost:3,attack:300,hp:500,model:'defense',kind:'rally',value:100,rarity:'R',keywords:[]},
 {cost:3,attack:500,hp:300,model:'attack',kind:'none',value:0,rarity:'R',keywords:['rush']},
 {cost:4,attack:300,hp:600,model:'defense',kind:'aegis',value:300,rarity:'KR',keywords:['guard']},
 {cost:4,attack:600,hp:400,model:'attack',kind:'bolt',value:200,rarity:'KR',keywords:[]},
 {cost:5,attack:400,hp:700,model:'defense',kind:'rally',value:100,rarity:'KKR',keywords:['guard']},
 {cost:5,attack:700,hp:400,model:'attack',kind:'bolt',value:200,rarity:'KKR',keywords:['drain']},
 {cost:6,attack:800,hp:500,model:'attack',kind:'rally',value:200,rarity:'GR',keywords:[]},
 {cost:7,attack:600,hp:900,model:'defense',kind:'aegis',value:400,rarity:'GGR',keywords:['guard']},
];
const MIRACLE_ROLES=[
 {cost:2,kind:'bolt',value:200,rarity:'N',subtype:'power',targetType:'enemy'},
 {cost:2,kind:'aegis',value:300,rarity:'R',subtype:'regeneration'},
 {cost:3,kind:'rally',value:100,rarity:'KR',subtype:'power'},
 {cost:2,kind:'focus',value:200,rarity:'KKR',subtype:'power',targetType:'family'},
 {cost:2,kind:'heal',value:600,rarity:'GR',subtype:'regeneration'},
 {cost:3,kind:'fusion',value:0,rarity:'R',subtype:'regeneration'},
];
const GIMMICK_ROLES=[
 {cost:2,kind:'family_ambush',value:400,rarity:'N',subtype:'reflection',trigger:'attack'},
 {cost:2,kind:'family_barrier',value:400,rarity:'R',subtype:'reflection',trigger:'attack'},
 {cost:2,kind:'aegis',value:300,rarity:'KR',subtype:'support',trigger:'turn_start'},
 {cost:3,kind:'rally',value:100,rarity:'KKR',subtype:'support',trigger:'turn_start'},
];
const FUSION_ROLES=[
 {cost:0,attack:500,hp:400,model:'hybrid',kind:'bolt',value:200,rarity:'GR',keywords:['rush']},
 {cost:0,attack:400,hp:500,model:'hybrid',kind:'aegis',value:300,rarity:'GGR',keywords:['guard']},
];
const ROLES={beast:BEAST_ROLES,miracle:MIRACLE_ROLES,gimmick:GIMMICK_ROLES,fusion:FUSION_ROLES};
const KEYWORDS={guard:'守護：相手は守護を持つ魔獣を先に攻撃する。',rush:'速攻：召喚したターンから攻撃できる。',drain:'吸収：戦闘で相手のハートポイントを実際に減らした分、自分を回復する。'};
const FUSION_PREFIX='特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+100。';
function conditionText(family){
 if(family==='origami')return 'この効果を解決する時、自分の手札が1枚以下なら';
 if(family==='glass')return 'この効果を解決する時、自分の結界が200以上なら結界200を使い';
 if(family==='shadow')return 'この効果を解決する時、自分の場の魔獣（合成魔獣を含む）が相手より少なければ';
 return 'この効果を解決する時、自分の手札に通常魔獣・ミラクル・ギミックの3種類が揃っていれば';
}
function rulesText(family,type,spec,fusionText){
 const name=FIFTH_FAMILIES.find(f=>f.id===family).name,{kind,value}=spec;
 if(kind==='none')return '召喚時の効果はない。';
 if(kind==='fusion')return fusionText;
 if(kind==='heal')return `自分のハートポイントを${value}回復する。回復上限は5000。`;
 if(kind==='family_ambush')return `場に第五弾の${name}の味方魔獣がいる時、相手の魔獣の攻撃に反応し、その攻撃者の守備力に${value}ダメージ。消滅すれば攻撃を止める。`;
 if(kind==='family_barrier')return `場に第五弾の${name}の味方魔獣がいる時、自分への直接攻撃を最大${value}軽減し、軽減分を攻撃者の守備力へ反射する。`;
 const target=`第五弾の${name}の味方魔獣`,condition=conditionText(family);
 let text=kind==='bolt'?`${type==='miracle'?'相手の魔獣1体かハートポイントを選び、':'相手のハートポイントに'}${value}ダメージ。${condition}、追加で200ダメージ。`:
  kind==='aegis'?`結界${value}を得る。${condition}、さらに結界${family==='glass'?300:200}を得る。`:
  kind==='rally'?`場の${target}すべての攻撃力を${value}上げる。${condition}、追加で100上げる。`:
  `場の${target}1体を選び、攻撃力・現在守備力・最大守備力を${value}上げる。${condition}、追加で100上げる。`;
 if(family==='glass')text+=kind==='aegis'?' 結界200の支払いは、この効果で結界を増やす前に判定する。':kind==='bolt'?' 結界200の支払いは、ダメージを与える前に判定する。':' 強化する同じ系統の味方魔獣がいなければ、結界を使わない。';
 if(family==='origami'||family==='pigment')text+=' 使用したカードは手札に数えない。';
 return text;
}
export function makeFifthCards({modelDescriptions,fusionText}){
 const localCount=new Map();
 return FIFTH_ART_DIRECTION.map((direction,index)=>{
  const {id,name,flavor,type,family,origin}=direction,key=family+':'+type,local=localCount.get(key)||0;
  localCount.set(key,local+1);
  const spec=ROLES[type][local],kind=['bolt','aegis','rally','focus'].includes(spec.kind)?family+'_'+spec.kind:spec.kind;
  let text=rulesText(family,type,spec,fusionText);
  if(type==='beast'&&spec.kind!=='none')text='召喚時、'+text;
  if(type==='fusion')text=FUSION_PREFIX+'召喚時、'+text;
  if(spec.trigger==='turn_start')text='次の自分のターン開始時に発動し、お墓へ移る。'+text;
  const keywords=spec.keywords||[];
  if(keywords.length)text+=' '+keywords.map(k=>KEYWORDS[k]).join(' ');
  if(spec.model)text+=' '+modelDescriptions[spec.model];
  return Object.freeze({id,index:4626+index,setId:'BK05',name,type,category:spec.model?'beast':type,origin,element:origin,series:family,family,cost:spec.cost,rarity:spec.rarity,attack:spec.attack||0,hp:spec.hp||0,...(spec.model?{model:spec.model}:{}),...(spec.subtype?{subtype:spec.subtype}:{}),...(spec.targetType?{targetType:spec.targetType==='family'?family:spec.targetType}:{}),...(spec.trigger?{trigger:spec.trigger}:{}),effect:Object.freeze({kind,value:spec.value}),keywords:Object.freeze([...keywords]),text,flavor,art:type==='beast'?local%16:type==='miracle'?16+local%4:type==='gimmick'?20+local%4:24+local});
 });
}
