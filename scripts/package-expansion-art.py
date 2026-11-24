#!/usr/bin/env python3
"""Package native imagegen atlases and their exact browser crops.

No resizing, image synthesis or retouching is performed. Each atlas is packaged
independently; a complete browser map is finalized only after every native source
and explicit visual-review record is present. The original PNGs remain untouched.
"""
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--jobs',type=Path,required=True)
parser.add_argument('--id')
parser.add_argument('--master',type=Path)
parser.add_argument('--reviewed',action='store_true')
parser.add_argument('--finalize',action='store_true')
args=parser.parse_args()
plan=json.loads(args.jobs.read_text());jobs=plan['jobs']
directory=ROOT/'assets/design-v3/cards';records=directory/'generation-records'
records.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()

if args.id:
 job=next(j for j in jobs if j['id']==args.id)
 record_path=records/(job['id']+'.json')
 if args.master:
  source=Image.open(args.master)
  assert source.format=='PNG','The imagegen native master must be a PNG.'
  width,height=source.size;columns=job.get('columns',job['grid']);rows=job.get('rows',job['grid'])
  assert abs(width/columns-height/rows)<=1,'The native atlas must have square cells.'
  assert min(width/columns,height/rows)>=256,'Native artwork cells must be at least 256 pixels; do not upscale.'
  # Crop four percent of each cell on all sides; this removes any seam while
  # retaining the subject safe area explicitly requested in every prompt.
  xb=[round(i*width/columns) for i in range(columns+1)]
  yb=[round(i*height/rows) for i in range(rows+1)]
  target=ROOT/job['src'];target.parent.mkdir(parents=True,exist_ok=True)
  source.convert('RGB').save(target,'WEBP',quality=94,method=6)
  filehash=sha(target.read_bytes());packaged=Image.open(target).convert('RGB')
  cards=[]
  for index,card in enumerate(job['cards']):
   column=index%columns;row=index//columns;left=xb[column];top=yb[row]
   cw=xb[column+1]-left;ch=yb[row+1]-top;size=math.floor(min(cw,ch)*.92)
   x=round(left+(cw-size)/2);y=round(top+(ch-size)/2)
   crop=packaged.crop((x,y,x+size,y+size))
   cards.append({**card,'src':job['src'],'column':column,'row':row,'columns':columns,'rows':rows,'sourceSize':[width,height],'pixelCrop':[x,y,size,size],'sha256':filehash,'cellSha256':sha(crop.tobytes()),'status':'illustrated-original','method':'built-in-imagegen'})
  record={'id':job['id'],'src':job['src'],'sha256':filehash,'sourceSha256':sha(args.master.read_bytes()),'nativeMaster':args.master.name,'width':width,'height':height,'columns':columns,'rows':rows,'x':xb,'y':yb,'nativeDimensionsPreserved':True,'promptSha256':sha(job['prompt'].encode()),'visualReview':'reviewed' if args.reviewed else 'pending','cardIds':job['cardIds'],'cards':cards}
  record_path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 elif args.reviewed:
  record=json.loads(record_path.read_text());record['visualReview']='reviewed'
  record_path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 else:parser.error('--id requires --master or --reviewed')
 print(json.dumps({'atlas':job['id'],'cards':len(record['cards']),'nativeSize':[record['width'],record['height']],'visualReview':record['visualReview']}))

if args.finalize:
 assert plan['cardCount']==2304
 assert len(jobs)==2304/(plan['columns']*plan['rows'])
 atlases=[];cards=[];browser={};cells=set();images=set()
 for job in jobs:
  record=json.loads((records/(job['id']+'.json')).read_text())
  assert record['visualReview']=='reviewed','An actual visual review is required: '+job['id']
  assert record['promptSha256']==sha(job['prompt'].encode()),'Prompt changed after generation: '+job['id']
  assert record['sha256']==sha((ROOT/record['src']).read_bytes()),'Packaged bytes changed: '+job['id']
  assert record['cardIds']==job['cardIds'],'Card order changed: '+job['id']
  atlases.append({k:v for k,v in record.items() if k!='cards'})
  for card in record['cards']:
   assert card['id'] not in browser,'Duplicate card mapping: '+card['id']
   assert card['cellSha256'] not in images,'Exact duplicate image crop: '+card['id'];images.add(card['cellSha256'])
   x,y,size,_=card['pixelCrop'];width,height=card['sourceSize']
   key=(card['src'],x,y,size);assert key not in cells,'Reused atlas cell: '+card['id'];cells.add(key)
   browser[card['id']]={k:card[k] for k in ['src','sha256']}
   browser[card['id']].update(x=x,y=y,size=size,width=width,height=height)
   cards.append(card)
 assert len(cards)==2304 and len(cells)==2304
 manifest={'version':1,'method':'built-in-imagegen','total':2304,'atlasCount':len(atlases),'columns':plan['columns'],'rows':plan['rows'],'nativeCellPixelsMinimum':min(min(a['width']/a['columns'],a['height']/a['rows']) for a in atlases),'atlasSafetyInset':.04,'complete':True,'uniqueCropHashes':len(images),'cards':cards,'atlases':atlases}
 (directory/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
 (ROOT/'card-art-expansion.js').write_text('/** BK03/BK04: individually directed, visually reviewed imagegen paintings. Native source pixels; no shared or upscaled cells. */\nexport const CARD_ART_EXPANSIONS = Object.freeze('+json.dumps(browser,separators=(',',':'))+');\n')
 print(json.dumps({'cards':len(cards),'atlases':len(atlases),'uniqueCropHashes':len(images),'complete':True}))
