"""Rebuild the current Beast King branding without replacing approved artwork.

Requires Node.js and the project's Sharp dependency. The editable crest/favicon
SVG masters and the versioned, approved OGP JPEG are the source of truth.
Profiles, card artwork, frames and UI glyphs are preserved.
"""
from pathlib import Path
import base64
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT if (ROOT / "catalog.js").exists() else ROOT / "dist"
ASSETS = WEB / "assets"
VECTORS = ASSETS / "design-v2"
BRAND = VECTORS / "brand"
COPYRIGHT = "© 2026 Beast King"
ORIGINS = ["mountain", "river", "seed", "grass", "flower", "tree", "king"]
SOCIAL_IMAGE = ASSETS / "brand/social-ogp-r37.jpg"

if not SOCIAL_IMAGE.is_file():
    raise FileNotFoundError("The approved social image is missing: " + str(SOCIAL_IMAGE))

subprocess.run(["node", str(ROOT / "scripts/generate-design-vectors.mjs"), "--brand-only"], check=True, cwd=ROOT)
subprocess.run(["node", str(ROOT / "scripts/generate-brand-icons.mjs")], check=True, cwd=ROOT)
shutil.copyfile(SOCIAL_IMAGE, ASSETS / "social-ogp.jpg")

# Keep the old portable SVG export usable, embedding the approved image verbatim.
# This does not redraw or regenerate the image or introduce a stale card count.
art_uri = "data:image/jpeg;base64," + base64.b64encode(SOCIAL_IMAGE.read_bytes()).decode("ascii")
ogp = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="social-title social-description">
<title id="social-title">BEAST KING｜その一手に、王の意志を。</title>
<desc id="social-description">黒い王宮に置かれた金色の王冠と、BEAST KINGのタイトル。36枚で戦う無料ブラウザカードゲーム。</desc>
<metadata>{COPYRIGHT}. Approved social image: assets/brand/social-ogp-r37.jpg.</metadata>
<image width="1200" height="630" xlink:href="{art_uri}"/>
</svg>\n'''
(BRAND / "social-ogp.svg").write_text(ogp)

names = ["icon.svg", "favicon.svg", "favicon-16.png", "favicon-32.png", "favicon-48.png", "favicon-96.png", "favicon.ico",
         "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "social-ogp.jpg"]
files = [ASSETS / name for name in names] + [SOCIAL_IMAGE]
files += [ASSETS / f"profiles/{origin}.svg" for origin in ORIGINS]
files += [BRAND / name for name in ["crest.svg", "wordmark.svg", "favicon.svg", "app-icon.svg", "app-icon-maskable.svg", "social-ogp.svg"]]
manifest = {
    "copyright": COPYRIGHT,
    "generatedBy": "scripts/prepare-brand-assets.py",
    "palette": {"obsidian": "#090b0e", "champagne": "#ceb889", "ivory": "#f0e9db"},
    "tagline": "その一手に、王の意志を。",
    "socialIllustration": "assets/design-v4/royal-archive.webp",
    "socialImage": str(SOCIAL_IMAGE.relative_to(WEB)),
    "socialImageSize": {"width": 1200, "height": 630, "type": "image/jpeg"},
    "origins": ORIGINS,
    "files": [{"path": str(path.relative_to(WEB)), "bytes": path.stat().st_size,
               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in files],
}
(VECTORS / "brand-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"brandFiles": len(files), "profilesPreserved": len(ORIGINS), "ogp": [1200, 630], "favicon": [16, 32, 48, 64, 128, 256]}, ensure_ascii=False))
