"""Build visual contact sheets from shipped crops and standalone originals.

The review sheets are private build artifacts (not part of the website).
Neither a generated-image ledger nor a hash check is a visual approval.
Normal Regalia is included, but the authenticated operator's skin is not.
Standalone originals are shown in full, without distorting their proportions;
their browser fit is recorded separately because card windows have many shapes.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import argparse
import hashlib
import json
import math
import re
import subprocess

root = Path(__file__).resolve().parents[1]
PREVIEW_BACKGROUND = "#161a24"


def read_registry(filename, export_name):
    """Read a JSON-shaped export without depending on the number of exports."""
    source = (root / filename).read_text(encoding="utf-8")
    start = re.search(r"\bexport\s+const\s+" + re.escape(export_name)
                      + r"\s*=\s*Object\.freeze\(\s*", source)
    assert start, f"Missing registry {export_name} in {filename}"
    registry, _ = json.JSONDecoder().raw_decode(source[start.end():])
    assert isinstance(registry, dict)
    return registry


def load_published_art():
    """Use the real ES module exports, including generated or frozen entries."""
    source = """
import {CARDS} from './catalog.js';
import {PREMIUM_CARD_IDS} from './premium-cards.js';
import {PREMIUM_CARD_ART} from './card-art-premium.js';
process.stdout.write(JSON.stringify({
  cards: CARDS.map(({id,name,setId,type}) => ({id,name,setId,type})),
  premiumCardIds: PREMIUM_CARD_IDS,
  premiumArt: PREMIUM_CARD_ART,
}));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", source], cwd=root,
                            capture_output=True, text=True, check=True, timeout=30)
    return json.loads(result.stdout)


def apply_art_overrides(cards, registry):
    """Apply either atlas cells or native images after a release adds its cards."""
    by_id = {card["id"]: card for card in cards}
    assert set(registry).issubset(by_id), "Artwork references an unknown card"
    for card_id, record in registry.items():
        card = by_id[card_id]
        card["src"] = record["src"]
        if all(key in record for key in ("x", "y", "size")):
            card["pixelCrop"] = [record["x"], record["y"], record["size"], record["size"]]
            card.pop("standaloneArt", None)
        else:
            assert record["fit"] in ("cover", "contain")
            assert record["width"] > 0 and record["height"] > 0
            card.pop("pixelCrop", None)
            card["standaloneArt"] = dict(record)


def load_review_cards(extra_cards=(), extra_registries=()):
    """Cover every published card while preserving historical atlas manifests."""
    manifest = json.loads((root / "assets/design-v2/cards/individual/manifest.json").read_text(encoding="utf-8"))
    expansion = json.loads((root / "assets/design-v3/cards/manifest.json").read_text(encoding="utf-8"))
    assert expansion["complete"] is True
    assert expansion["total"] == len(expansion["cards"])
    cards = manifest["cards"] + expansion["cards"] + list(extra_cards)
    assert len({card["id"] for card in cards}) == len(cards)
    published = load_published_art()
    catalog = {card["id"]: card for card in published["cards"]}
    assert len(catalog) == len(published["cards"])
    premium_ids = set(published["premiumCardIds"])
    premium_art = published["premiumArt"]
    missing_art = premium_ids - set(premium_art)
    assert not missing_art, "Premium illustrations incomplete: " + ", ".join(sorted(missing_art))
    assert set(premium_art) == premium_ids, "Unexpected premium illustration IDs"
    known_ids = {card["id"] for card in cards}
    cards.extend(dict(card) for card in published["cards"] if card["id"] not in known_ids)
    assert {card["id"] for card in cards} == set(catalog), "Review inventory differs from the published catalog"
    for card in cards:
        card.update(catalog[card["id"]])

    # Match browser precedence rather than reviewing superseded atlas cells.
    apply_art_overrides(cards, read_registry("card-art-overrides.js", "CARD_ART_OVERRIDES"))
    expanded = read_registry("card-art-expansion.js", "CARD_ART_EXPANSIONS")
    assert len(expanded) == expansion["total"]
    for card in expansion["cards"]:
        record = expanded[card["id"]]
        assert card["src"] == record["src"]
        assert card["pixelCrop"] == [record["x"], record["y"], record["size"], record["size"]]
    apply_art_overrides(cards, expanded)
    apply_art_overrides(cards, premium_art)
    for registry in extra_registries:
        apply_art_overrides(cards, registry)

    originals = read_registry("card-art-user.js", "CARD_ART_USER_OVERRIDES")
    shared_groups = read_registry("card-art-user.js", "CARD_ART_USER_GROUPS")
    for group_id, group in shared_groups.items():
        mapped = {card_id for card_id, record in originals.items() if record["sharedGroup"] == group_id}
        assert mapped == set(group["cardIds"])
        assert len(group["cardIds"]) == len(mapped)
        assert group["exactOriginal"] is True and group["provenance"] == "user-provided"
        original_bytes = (root / group["src"]).read_bytes()
        assert len(original_bytes) == group["bytes"]
        assert hashlib.sha256(original_bytes).hexdigest() == group["sha256"]
    for record in originals.values():
        group = shared_groups[record["sharedGroup"]]
        for key in ("src", "width", "height", "sha256", "provenance"):
            assert record[key] == group[key]
    apply_art_overrides(cards, originals)
    assert all(card.get("src") for card in cards), "A published card has no artwork"
    return cards, shared_groups


def art_preview(source, card, tile):
    if card.get("pixelCrop"):
        x, y, width, height = card["pixelCrop"]
        assert x >= 0 and y >= 0 and x + width <= source.width and y + height <= source.height
        return source.crop((x, y, x + width, y + height)).resize((tile, tile), Image.Resampling.LANCZOS)
    if card.get("standaloneArt"):
        original = card["standaloneArt"]
        assert source.size == (original["width"], original["height"])
        preview = ImageOps.contain(source, (tile, tile), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (tile, tile), PREVIEW_BACKGROUND)
        canvas.paste(preview, ((tile - preview.width) // 2, (tile - preview.height) // 2))
        return canvas
    assert card["id"] == "B0512", card["id"]
    return ImageOps.fit(source, (tile, tile), Image.Resampling.LANCZOS)


def build_review(output, tile, cards, shared_groups):
    output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    images, rows = {}, []
    sheets = 0
    for edition in dict.fromkeys(card["setId"] for card in cards):
        for prefix in dict.fromkeys(card["id"][0] for card in cards if card["setId"] == edition):
            group = [card for card in cards if card["setId"] == edition and card["id"].startswith(prefix)]
            for batch in range(0, len(group), 64):
                chunk = group[batch:batch + 64]
                name = f"{edition}-{prefix}-{batch // 64 + 1:02d}"
                sheet = Image.new("RGB", (8 * (tile + 8), math.ceil(len(chunk) / 8) * (tile + 25)), PREVIEW_BACKGROUND)
                draw = ImageDraw.Draw(sheet)
                for index, card in enumerate(chunk):
                    src = root / card["src"]
                    if src not in images:
                        with Image.open(src) as image:
                            images[src] = image.convert("RGB")
                    art = art_preview(images[src], card, tile)
                    x = (index % 8) * (tile + 8) + 4
                    y = (index // 8) * (tile + 25) + 4
                    sheet.paste(art, (x, y))
                    draw.text((x + 1, y + tile + 3), card["id"], fill="#f8e5bc", font=font)
                    row = {"id": card["id"], "name": card["name"], "setId": edition,
                           "source": card["src"], "crop": card.get("pixelCrop"),
                           "sheet": name + ".jpg", "cell": index + 1, "visualReview": "unreviewed"}
                    if card.get("standaloneArt"):
                        original = card["standaloneArt"]
                        row.update({"sourceSize": [original["width"], original["height"]],
                                    "sourceSha256": original["sha256"], "displayFit": original["fit"],
                                    "displayPosition": original.get("position", "center"), "previewFit": "contain",
                                    "provenance": original.get("provenance"), "sharedGroup": original.get("sharedGroup")})
                    rows.append(row)
                sheet.save(output / (name + ".jpg"), "JPEG", quality=87, optimize=True)
                sheets += 1
                images.clear()
    assert len(rows) == len(cards) and len({row["id"] for row in rows}) == len(cards)
    identities = {("original", row["sourceSha256"]) if row.get("sourceSha256") else
                  ("atlas", row["source"], tuple(row["crop"]) if row["crop"] else None) for row in rows}
    report = {"total": len(rows), "uniqueIllustrations": len(identities), "reviewed": 0,
              "sharedIllustrationGroups": shared_groups, "cards": rows}
    (output / "review-index.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"cards": len(rows), "uniqueIllustrations": len(identities), "sheets": sheets,
            "sharedIllustrationGroups": len(shared_groups), "visualReview": "unreviewed; actual image inspection required"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tile-size", type=int, default=144)
    args = parser.parse_args()
    if not 96 <= args.tile_size <= 240:
        parser.error("tile-size must be between 96 and 240")
    cards, shared_groups = load_review_cards()
    print(json.dumps(build_review(args.output.resolve(), args.tile_size, cards, shared_groups)))


if __name__ == "__main__":
    main()
