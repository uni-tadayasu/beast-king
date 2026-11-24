"""Build visual contact sheets from every card's actual shipped crop.

The review sheets are private build artifacts (not part of the website).
Neither a generated-image ledger nor a hash check is a visual approval.
Normal Regalia is included, but the authenticated operator's skin is not.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import argparse
import json
import math
import hashlib

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--tile-size", type=int, default=144)
args = parser.parse_args()
tile = args.tile_size
if not 96 <= tile <= 240:
    parser.error("tile-size must be between 96 and 240")
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / "assets/design-v2/cards/individual/manifest.json").read_text(encoding="utf-8"))
cards = manifest["cards"]
assert len(cards) == 2304 and len({c["id"] for c in cards}) == 2304
font = ImageFont.load_default()
images = {}
rows = []
for edition in ("BK01", "BK02"):
    for prefix in ("B", "M", "G", "F"):
        group = [c for c in cards if c["setId"] == edition and c["id"].startswith(prefix)]
        for batch in range(0, len(group), 64):
            chunk = group[batch:batch + 64]
            name = f"{edition}-{prefix}-{batch // 64 + 1:02d}"
            sheet = Image.new("RGB", (8 * (tile+8), math.ceil(len(chunk)/8) * (tile+25)), "#161a24")
            draw = ImageDraw.Draw(sheet)
            for idx, card in enumerate(chunk):
                src = root / card["src"]
                if src not in images:
                    with Image.open(src) as im:
                        images[src] = im.convert("RGB")
                source = images[src]
                if card.get("pixelCrop"):
                    x, y, w, h = card["pixelCrop"]
                    assert x >= 0 and y >= 0 and x+w <= source.width and y+h <= source.height
                    crop = source.crop((x,y,x+w,y+h))
                else:
                    assert card["id"] == "B0512", card["id"]
                    crop = ImageOps.fit(source,(min(source.size),)*2)
                art = crop.resize((tile,tile), Image.Resampling.LANCZOS)
                x = (idx%8)*(tile+8)+4
                y = (idx//8)*(tile+25)+4
                sheet.paste(art, (x,y))
                draw.text((x+1,y+tile+3), card["id"], fill="#f8e5bc", font=font)
                rows.append({"id":card["id"],"name":card["name"],"setId":edition,"source":card["src"],"crop":card.get("pixelCrop"),"sheet":name+".jpg","cell":idx+1,"visualReview":"unreviewed"})
            sheet.save(out / (name+".jpg"), "JPEG", quality=87, optimize=True)
            images.clear()
assert len(rows) == 2304 and len({r["id"] for r in rows}) == 2304
(out / "review-index.json").write_text(json.dumps({"total":len(rows),"reviewed":0,"cards":rows},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"cards":len(rows),"sheets":len(list(out.glob("*.jpg"))),"visualReview":"unreviewed; actual image inspection required"}))
