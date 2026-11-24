#!/usr/bin/env python3
"""Package BK05's reviewed native imagegen outputs without resizing or retouching.

This command encodes originals as WebP and records exact browser crops. A crop
does not modify the source image. Finalization requires all four independently
generated atlases and a separately reviewed cover.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'assets/design-v5/cards'
FAMILIES = ['origami', 'glass', 'shadow', 'pigment']
sha = lambda value: hashlib.sha256(value).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('--family', choices=FAMILIES)
parser.add_argument('--master', type=Path)
parser.add_argument('--reviewed', action='store_true')
parser.add_argument('--cover', action='store_true')
parser.add_argument('--finalize', action='store_true')
args = parser.parse_args()
records = DIRECTORY / 'generation-records'
records.mkdir(parents=True, exist_ok=True)

if args.family:
    assert args.master and args.reviewed, 'Supply a native master after an actual visual review.'
    plan = json.loads((DIRECTORY / 'generation-jobs.json').read_text())
    job = next(job for job in plan['jobs'] if job['family'] == args.family)
    source = Image.open(args.master)
    assert source.format == 'PNG', 'The native imagegen master must be PNG.'
    width, height = source.size
    assert width >= 1536 and height >= 1024
    assert abs(width / 6 - height / 4) <= 1, 'Native atlas cells must be square.'
    target = ROOT / job['src']
    source.convert('RGB').save(target, 'WEBP', quality=94, method=6)
    digest = sha(target.read_bytes())
    x = [round(i * width / 6) for i in range(7)]
    y = [round(i * height / 4) for i in range(5)]
    packaged = Image.open(target).convert('RGB')
    cards = []
    for index, card in enumerate(job['cards']):
        column, row = index % 6, index // 6
        cell_w, cell_h = x[column + 1] - x[column], y[row + 1] - y[row]
        size = math.floor(min(cell_w, cell_h) * .92)
        px, py = round(x[column] + (cell_w - size) / 2), round(y[row] + (cell_h - size) / 2)
        crop = packaged.crop((px, py, px + size, py + size))
        cards.append({**card, 'src': job['src'], 'sha256': digest,
                      'column': column, 'row': row, 'columns': 6, 'rows': 4,
                      'sourceSize': [width, height], 'pixelCrop': [px, py, size, size],
                      'cellSha256': sha(crop.tobytes()), 'status': 'illustrated-original',
                      'method': 'built-in-imagegen'})
    prompt = DIRECTORY / 'prompts' / (job['id'] + '.txt')
    record = {'id': job['id'], 'family': args.family, 'src': job['src'], 'sha256': digest,
              'sourceSha256': sha(args.master.read_bytes()), 'nativeMaster': args.master.name,
              'promptSha256': sha(prompt.read_bytes()), 'width': width, 'height': height,
              'columns': 6, 'rows': 4, 'x': x, 'y': y, 'cardIds': job['cardIds'],
              'nativeDimensionsPreserved': True, 'visualReview': 'reviewed', 'cards': cards}
    (records / (job['id'] + '.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'atlas': job['id'], 'nativeDimensions': [width, height], 'cards': len(cards), 'reviewed': True}))

if args.cover:
    assert args.master and args.reviewed, 'Supply a visually reviewed native cover master.'
    source = Image.open(args.master)
    assert source.format == 'PNG' and source.size == (1024, 1536)
    assert source.mode == 'RGBA' and source.getextrema()[-1][0] == 0, 'The pack exterior must retain transparency.'
    src = 'assets/design-v3/packs/bk05-cover.webp'
    target = ROOT / src
    source.save(target, 'WEBP', quality=94, method=6)
    record = {'id': 'bk05-cover', 'src': src, 'sha256': sha(target.read_bytes()),
              'sourceSha256': sha(args.master.read_bytes()), 'nativeMaster': args.master.name,
              'promptSha256': sha((ROOT / 'assets/design-v5/cover-prompt.txt').read_bytes()),
              'width': 1024, 'height': 1536, 'alpha': True,
              'method': 'built-in-imagegen', 'nativeDimensionsPreserved': True, 'visualReview': 'reviewed'}
    (records / 'bk05-cover.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'cover': src, 'nativeDimensions': [1024, 1536], 'reviewed': True}))

if args.finalize:
    plan = json.loads((DIRECTORY / 'generation-jobs.json').read_text())
    assert plan['cardCount'] == 96 and len(plan['jobs']) == 4
    browser, cards, atlases, hashes = {}, [], [], set()
    for job in plan['jobs']:
        record = json.loads((records / (job['id'] + '.json')).read_text())
        assert record['visualReview'] == 'reviewed'
        assert record['cardIds'] == job['cardIds']
        assert record['promptSha256'] == sha((DIRECTORY / 'prompts' / (job['id'] + '.txt')).read_bytes())
        assert record['sha256'] == sha((ROOT / record['src']).read_bytes())
        atlases.append({key: value for key, value in record.items() if key != 'cards'})
        for card in record['cards']:
            assert card['id'] not in browser and card['cellSha256'] not in hashes
            hashes.add(card['cellSha256'])
            x, y, size, _ = card['pixelCrop']
            width, height = card['sourceSize']
            browser[card['id']] = {'src': card['src'], 'sha256': card['sha256'],
                                   'x': x, 'y': y, 'size': size, 'width': width, 'height': height}
            cards.append(card)
    assert len(cards) == len(browser) == len(hashes) == 96
    cover = json.loads((records / 'bk05-cover.json').read_text())
    assert cover['visualReview'] == 'reviewed'
    assert cover['sha256'] == sha((ROOT / cover['src']).read_bytes())
    manifest = {'version': 1, 'method': 'built-in-imagegen', 'complete': True,
                'total': 96, 'atlasCount': 4, 'columns': 6, 'rows': 4, 'atlasSafetyInset': .04,
                'nativeCellPixelsMinimum': min(min(a['width']/6, a['height']/4) for a in atlases),
                'uniqueCropHashes': len(hashes), 'cards': cards, 'atlases': atlases, 'cover': cover}
    (DIRECTORY / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    (ROOT / 'card-art-fifth.js').write_text('/** BK05: 96 independently directed, visually reviewed native paintings. */\nexport const CARD_ART_FIFTH = Object.freeze(' + json.dumps(browser, separators=(',', ':')) + ');\n')
    print(json.dumps({'cards': len(cards), 'atlases': len(atlases), 'complete': True}))
