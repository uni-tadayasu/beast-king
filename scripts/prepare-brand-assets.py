"""Render Beast King vector branding and the public social preview.

Requires Pillow and Inkscape. Regenerate brand vectors without touching card frames:
    node scripts/generate-design-vectors.mjs --brand-only
    python scripts/prepare-brand-assets.py
Only the public entry illustration is used; operator art is never read.
"""
from pathlib import Path
from io import BytesIO
import base64
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT if (ROOT / "catalog.js").exists() else ROOT / "dist"
ASSETS = WEB / "assets"
VECTORS = ASSETS / "design-v2"
BRAND = VECTORS / "brand"
COPYRIGHT = "© 2026 Beast King"
ORIGINS = [
    ("mountain", "山", "#cbb49a"), ("river", "川", "#82c9ee"),
    ("seed", "種", "#dfc581"), ("grass", "草", "#92cba1"),
    ("flower", "花", "#e7a8cc"), ("tree", "木", "#b3c58a"),
    ("king", "王", "#edbd65"),
]


def inner_svg(path):
    source = Path(path).read_text()
    return re.sub(r"</svg>\s*$", "", re.sub(r"^<svg[^>]*>", "", source))


def raster(source, destination, width, height=None):
    subprocess.run([
        "inkscape", str(source), "--export-type=png",
        "--export-filename=" + str(destination),
        "--export-width=" + str(width), "--export-height=" + str(height or width),
    ], check=True, capture_output=True, timeout=30)


# Solid shapes on a 32-unit grid retain the crown and eyes at 16px. The six-leaf
# detailed crest remains available for larger brand placements and card backs.
compact_mark = '''<path d="m5 6 6 4 5-7 5 7 6-4-2 8H7Z" fill="#f6cd78"/>
<path d="m16 7 2 3-2 2-2-2Z" fill="#66e7e3"/>
<path d="m7 16 5 0 4 2 4-2h5l-1 7-8 6-8-6Z" fill="#f6cd78"/>
<path d="m9 17 4 1 3 2 3-2 4-1-1 5-6 5-6-5Z" fill="#0b2237"/>
<path d="m10 19 5 2-3 2-2-1Zm12 0-5 2 3 2 2-1Z" fill="#7cf5eb"/>
<path d="m14 24 2-1 2 1-2 2Z" fill="#f6cd78"/>'''
compact_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 32 32" role="img" aria-labelledby="beast-king-icon-title">
<title id="beast-king-icon-title">BEAST KING 王冠と獣の紋章</title>
<desc>濃紺の地に金の王冠とシアンの瞳。16pxでも識別できるサイトアイコン。</desc>
<metadata>{COPYRIGHT}. Original vector artwork.</metadata>
<rect width="32" height="32" rx="7" fill="#061426"/>
{compact_mark}
</svg>'''
(BRAND / "favicon.svg").write_text(compact_svg)
shutil.copyfile(BRAND / "favicon.svg", ASSETS / "icon.svg")
for size in (16, 32):
    raster(ASSETS / "icon.svg", ASSETS / f"favicon-{size}.png", size)

crest = BRAND / "crest.svg"
app_icon = f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="BEAST KING">
<metadata>{COPYRIGHT}</metadata><defs>
<radialGradient id="app-bg" cx=".35" cy=".22" r=".9"><stop stop-color="#174158"/><stop offset=".58" stop-color="#0b2137"/><stop offset="1" stop-color="#061426"/></radialGradient>
</defs><rect width="512" height="512" fill="url(#app-bg)"/>
<circle cx="256" cy="256" r="192" fill="none" stroke="#e7bb68" stroke-opacity=".25" stroke-width="2"/>
<path d="M256 58v12m198 186h-12M256 454v-12M58 256h12" stroke="#62dfdf" stroke-opacity=".55" stroke-width="3"/>
<g transform="translate(76 69) scale(2.8125)">{inner_svg(crest)}</g></svg>'''
(BRAND / "app-icon.svg").write_text(app_icon)
for size, name in ((180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
    raster(BRAND / "app-icon.svg", ASSETS / name, size)

with tempfile.TemporaryDirectory() as work:
    # Every ICO size is rendered directly from the vector, including the 16px mark.
    images = []
    for size in (16, 32, 48, 64, 128, 256):
        target = Path(work) / f"favicon-{size}.png"
        raster(ASSETS / "icon.svg", target, size)
        images.append(Image.open(target).copy())
    images[-1].save(ASSETS / "favicon.ico", format="ICO", append_images=images[:-1],
                    sizes=[image.size for image in images])

# Preserve the existing origin profile identities.
for key, name, color in ORIGINS:
    content = inner_svg(VECTORS / f"icons/origin-{key}.svg")
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" color="{color}" role="img" aria-label="{name}のプロフィール"><metadata>{COPYRIGHT}</metadata><defs><linearGradient id="profile-{key}" x2="1" y2="1"><stop stop-color="#3b2b50"/><stop offset="1" stop-color="#151c32"/></linearGradient></defs><path d="M48 3 85 24v48L48 93 11 72V24Z" fill="url(#profile-{key})" stroke="{color}" stroke-width="1.4"/><path d="M48 9 80 27v42L48 87 16 69V27Z" fill="none" stroke="{color}" stroke-opacity=".28"/><g transform="translate(22 22) scale(2.16667)">{content}</g><path d="m45 80 3-3 3 3-3 3Z" fill="{color}"/></svg>'
    (ASSETS / f"profiles/{key}.svg").write_text(svg)

# Transcode the unmodified, approved public illustration for a portable SVG.
source_art = VECTORS / "backgrounds/entry-illustrated.webp"
buffer = BytesIO()
with Image.open(source_art) as illustration:
    illustration.convert("RGB").save(buffer, format="JPEG", quality=93, optimize=True)
art_uri = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
ogp = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="social-title social-description">
<title id="social-title">BEAST KING｜その一手に、王の意志を。</title>
<desc id="social-description">ビーストキング。全2,304枚、メイン32枚と特殊4枚で戦う無料ブラウザカードゲーム。PC・スマホ・タブレット対応。</desc>
<metadata>{COPYRIGHT}. Public illustration: assets/design-v2/backgrounds/entry-illustrated.webp. No operator-exclusive art.</metadata>
<defs>
<linearGradient id="poster-shade"><stop stop-color="#061426" stop-opacity=".98"/><stop offset=".42" stop-color="#061426" stop-opacity=".92"/><stop offset=".66" stop-color="#061426" stop-opacity=".3"/><stop offset="1" stop-color="#061426" stop-opacity=".02"/></linearGradient>
<linearGradient id="poster-footer" x1="0" y1="0" x2="0" y2="1"><stop offset=".65" stop-color="#061426" stop-opacity="0"/><stop offset="1" stop-color="#061426" stop-opacity=".88"/></linearGradient>
<linearGradient id="poster-gold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff2c5"/><stop offset=".6" stop-color="#f6d48a"/><stop offset="1" stop-color="#d8a44a"/></linearGradient>
<linearGradient id="poster-rule"><stop stop-color="#f3c66d"/><stop offset="1" stop-color="#56dce0" stop-opacity=".15"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="#061426"/>
<image width="1200" height="630" preserveAspectRatio="xMidYMid slice" xlink:href="{art_uri}"/>
<rect width="1200" height="630" fill="url(#poster-shade)"/>
<rect width="1200" height="630" fill="url(#poster-footer)"/>
<path d="M22 94V22h1078l78 78v436l-72 72H94l-72-72V94Z" fill="none" stroke="#edcb80" stroke-opacity=".55"/>
<path d="M31 100V31h1065l73 73v428l-67 67H98l-67-67Z" fill="none" stroke="#72dce0" stroke-opacity=".13"/>
<g transform="translate(61 51) scale(.52)">{inner_svg(crest)}</g>
<text x="145" y="79" fill="#83e0e1" font-size="13" font-weight="500" font-family="Noto Sans CJK JP,sans-serif" letter-spacing="2.5">BROWSER CARD BATTLE</text>
<text x="145" y="103" fill="#b0c8d8" font-size="15" font-family="Noto Sans CJK JP,sans-serif">32枚の戦略 ＋ 4枚の切り札</text>
<text x="60" y="213" fill="url(#poster-gold)" font-size="76" font-family="Georgia,serif" letter-spacing="2">BEAST KING</text>
<text x="65" y="257" fill="#e9f2f5" font-size="24" font-weight="600" font-family="Noto Sans CJK JP,sans-serif" letter-spacing="7">ビーストキング</text>
<text x="62" y="331" fill="#fff6df" font-size="32" font-weight="700" font-family="Noto Serif CJK JP,serif" letter-spacing="1">その一手に、王の意志を。</text>
<path d="M64 364h490" stroke="url(#poster-rule)"/>
<text x="64" y="422" fill="#f6d48a" font-size="41" font-family="Georgia,serif">2,304<tspan dx="8" fill="#d7e6ed" font-size="16" font-family="Noto Sans CJK JP,sans-serif">枚のカード</tspan></text>
<text x="65" y="451" fill="#9bb9cd" font-size="15" font-family="Noto Sans CJK JP,sans-serif">すべての一枚が、戦略になる。</text>
<path d="M325 394v61" stroke="#88cdd7" stroke-opacity=".3"/>
<text x="347" y="417" fill="#edf5f5" font-size="20" font-weight="600" font-family="Noto Sans CJK JP,sans-serif">無料ブラウザカードゲーム</text>
<text x="347" y="449" fill="#9edcde" font-size="15" font-family="Noto Sans CJK JP,sans-serif">PC・スマホ・タブレット対応</text>
<path d="M64 531h496" stroke="#8bc2cc" stroke-opacity=".26"/>
<text x="64" y="568" fill="#b6d4df" font-size="17" font-family="Georgia,serif" letter-spacing="1.5">www.beast-king.com</text>
<text x="1136" y="568" fill="#d5e4e8" fill-opacity=".7" text-anchor="end" font-size="12" font-family="Noto Sans CJK JP,sans-serif">{COPYRIGHT}</text>
</svg>'''
(BRAND / "social-ogp.svg").write_text(ogp)
with tempfile.TemporaryDirectory() as work:
    preview = Path(work) / "ogp.png"
    raster(BRAND / "social-ogp.svg", preview, 1200, 630)
    with Image.open(preview) as image:
        image.convert("RGB").save(ASSETS / "social-ogp.jpg", quality=94, optimize=True)

files = [ASSETS / name for name in (
    "icon.svg", "favicon-16.png", "favicon-32.png", "favicon.ico",
    "apple-touch-icon.png", "icon-192.png", "icon-512.png", "social-ogp.jpg",
)] + [ASSETS / f"profiles/{key}.svg" for key, _, _ in ORIGINS] + [
    BRAND / name for name in ("crest.svg", "wordmark.svg", "favicon.svg", "app-icon.svg", "social-ogp.svg")
]
manifest = {
    "copyright": COPYRIGHT,
    "palette": {"navy": "#061426", "gold": "#f3c66d", "cyan": "#66e7e3"},
    "tagline": "その一手に、王の意志を。",
    "socialIllustration": str(source_art.relative_to(WEB)),
    "origins": [item[0] for item in ORIGINS],
    "files": [{"path": str(path.relative_to(WEB)), "bytes": path.stat().st_size,
               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in files],
}
(VECTORS / "brand-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"brandFiles": len(files), "profiles": len(ORIGINS), "ogp": [1200, 630], "favicon": [16, 32, 48, 64, 128, 256]}, ensure_ascii=False))
