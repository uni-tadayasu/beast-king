"""Build raster favicons and original vector profile/OGP assets. © 2026 Beast King.
Requires Pillow and the Inkscape command-line renderer. Run: python scripts/prepare-brand-assets.py
"""
from pathlib import Path
import re, json, hashlib, shutil
from io import BytesIO
from PIL import Image
import subprocess, tempfile

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT if (ROOT / "catalog.js").exists() else ROOT / "dist"
ASSETS = WEB / "assets"
VECTORS = ASSETS / "design-v2"
COPYRIGHT = "© 2026 Beast King"
origins = [
 ("mountain","山","#cbb49a"),("river","川","#82c9ee"),("seed","種","#dfc581"),
 ("grass","草","#92cba1"),("flower","花","#e7a8cc"),("tree","木","#b3c58a"),("king","王","#edbd65")
]
def inner_svg(path):
    text=Path(path).read_text()
    return re.sub(r"</svg>\s*$","",re.sub(r"^<svg[^>]*>","",text))
def raster(svg_path, destination, size):
    subprocess.run(['inkscape',str(svg_path),'--export-type=png','--export-filename='+str(destination),'--export-width='+str(size),'--export-height='+str(size)],check=True,capture_output=True,timeout=30)
crest=VECTORS/"brand/crest.svg"
shutil.copyfile(crest,ASSETS/"icon.svg")
raster(ASSETS/"icon.svg",ASSETS/"favicon-32.png",32)
mask_svg='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#17172f"/><circle cx="256" cy="256" r="192" fill="#27203c" stroke="#bea1cd" stroke-opacity=".25"/><g transform="translate(76 76) scale(2.8125)">'+inner_svg(crest)+'</g></svg>'
(VECTORS/"brand/app-icon.svg").write_text(mask_svg)
for size,name in [(180,"apple-touch-icon.png"),(192,"icon-192.png"),(512,"icon-512.png")]:
    raster(VECTORS/"brand/app-icon.svg",ASSETS/name,size)
for key,name,color in origins:
    content=inner_svg(VECTORS/f"icons/origin-{key}.svg")
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" color="{color}" role="img" aria-label="{name}のプロフィール"><metadata>{COPYRIGHT}</metadata><defs><linearGradient id="profile-{key}" x2="1" y2="1"><stop stop-color="#3b2b50"/><stop offset="1" stop-color="#151c32"/></linearGradient></defs><path d="M48 3 85 24v48L48 93 11 72V24Z" fill="url(#profile-{key})" stroke="{color}" stroke-width="1.4"/><path d="M48 9 80 27v42L48 87 16 69V27Z" fill="none" stroke="{color}" stroke-opacity=".28"/><g transform="translate(22 22) scale(2.16667)">{content}</g><path d="m45 80 3-3 3 3-3 3Z" fill="{color}"/></svg>'
    (ASSETS/f"profiles/{key}.svg").write_text(svg)

origin_marks=[]
for i,(key,name,color) in enumerate(origins):
    x=77+i*93
    origin_marks.append(f'<g transform="translate({x} 467)" color="{color}"><rect width="80" height="68" rx="3" fill="#191a33" stroke="#b7a1d1" stroke-opacity=".26"/><g transform="translate(15 10) scale(1.35)">{inner_svg(VECTORS/f"icons/origin-{key}.svg")}</g><text x="56" y="37" fill="{color}" font-family="Noto Serif CJK JP,serif" font-size="20">{name}</text></g>')
ogp=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="ビーストキング 七つのオリジン">
<metadata>{COPYRIGHT}</metadata><defs><linearGradient id="poster-bg" x2="1" y2=".8"><stop stop-color="#11172c"/><stop offset=".55" stop-color="#2d2144"/><stop offset="1" stop-color="#141a32"/></linearGradient><linearGradient id="poster-line"><stop stop-color="#e4ce9b"/><stop offset="1" stop-color="#ad8dd3"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#poster-bg)"/>
<path d="M30 76V30h1068l72 72v452l-46 46H76l-46-46V76Z" fill="none" stroke="url(#poster-line)" stroke-opacity=".6"/>
<path d="M44 82V44h1048l64 64v440l-40 38H82l-38-38Z" fill="none" stroke="#baa1da" stroke-opacity=".18"/>
<path d="M800 100 1100 520M765 140l300 420M806 500 1100 92" stroke="#c5a9da" stroke-opacity=".08"/>
<circle cx="965" cy="288" r="181" fill="#9a78b9" fill-opacity=".04" stroke="#ccafd9" stroke-opacity=".25"/>
<circle cx="965" cy="288" r="163" fill="none" stroke="#e0c99b" stroke-opacity=".18"/>
<g transform="translate(821 140) scale(2.25)">{inner_svg(crest)}</g>
<text x="78" y="108" fill="#c8b7db" font-size="15" font-family="Georgia,serif" letter-spacing="3">THE FIRST CHRONICLE</text>
<text x="74" y="217" fill="#f1dfb9" font-size="77" font-family="Georgia,serif" letter-spacing="5">BEAST KING</text>
<text x="80" y="283" fill="#f0e8f6" font-size="38" font-family="Noto Serif CJK JP,serif" letter-spacing="4">ビーストキング</text>
<path d="M80 314h580" stroke="url(#poster-line)" stroke-opacity=".45"/>
<text x="80" y="360" fill="#ded3e8" font-size="24" font-family="Noto Serif CJK JP,serif">七つの源。君だけの王道。</text>
<text x="80" y="407" fill="#bcb2ce" font-size="18" font-family="Noto Sans CJK JP,sans-serif">全1,152枚 ｜ 通常32枚 ＋ 特殊4枚</text>
{''.join(origin_marks)}
<text x="965" y="505" fill="#dcc89f" text-anchor="middle" font-size="21" font-family="Noto Serif CJK JP,serif">第一弾「六源の覚醒」</text>
<text x="80" y="575" fill="#9c92ae" font-size="13" font-family="Noto Sans CJK JP,sans-serif">© 2026 Beast King</text>
<text x="1118" y="575" fill="#c2b2d3" text-anchor="end" font-size="15" font-family="Georgia,serif">www.beast-king.com</text>
</svg>'''
(VECTORS/"brand/social-ogp.svg").write_text(ogp)
with tempfile.TemporaryDirectory() as work:
    preview=Path(work)/'ogp.png'
    subprocess.run(['inkscape',str(VECTORS/'brand/social-ogp.svg'),'--export-type=png','--export-filename='+str(preview),'--export-width=1200','--export-height=630'],check=True,capture_output=True,timeout=30)
    Image.open(preview).convert('RGB').save(ASSETS/'social-ogp.jpg',quality=94,optimize=True)
files=[ASSETS/name for name in ["icon.svg","favicon-32.png","apple-touch-icon.png","icon-192.png","icon-512.png","social-ogp.jpg"]]+[ASSETS/f"profiles/{key}.svg" for key,_,_ in origins]+[VECTORS/"brand/app-icon.svg",VECTORS/"brand/social-ogp.svg"]
manifest={"copyright":COPYRIGHT,"origins":[x[0] for x in origins],"files":[{"path":str(p.relative_to(WEB)),"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(VECTORS/"brand-manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({"brandFiles":len(files),"profiles":len(origins),"ogp":[1200,630]},ensure_ascii=False))

