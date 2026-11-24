"""Package native generated atlases. Format conversion only; pixels are not resized.

Usage: python3 scripts/package-card-art.py /absolute/path/to/native-atlases
The optional --allow-incomplete flag is only for staging; release validation must
run without it. Regalia's established standalone illustration is never replaced.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]).resolve()
allow_incomplete = '--allow-incomplete' in sys.argv[2:]
target = root / 'assets/design-v2/cards/individual'
target.mkdir(parents=True, exist_ok=True)
expected = [f'{kind}-{index:02d}' for kind, count in [('beast', 64), ('fusion', 16), ('miracle', 32), ('gimmick', 32)] for index in range(1, count + 1)]
missing = [name for name in expected if not (source / (name + '.png')).is_file()]
if missing and not allow_incomplete:
    raise SystemExit('Incomplete artwork: ' + ', '.join(missing))
ledger_path = target / 'production.json'
old = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
previous = {x['atlas']: x for x in old.get('atlases', [])}
ledger = []
layouts = {}
for name in expected:
    native = source / (name + '.png')
    if not native.is_file():
        continue
    native_hash = hashlib.sha256(native.read_bytes()).hexdigest()
    with Image.open(native) as image:
        image.load()
        width, height = image.size
        if width < 1000 or height < 1000 or abs(width - height) > 40:
            raise ValueError(f'Unexpected native atlas shape: {name} {image.size}')
        out = target / (name + '.webp')
        prior = previous.get(name)
        if not (prior and prior.get('nativeSha256') == native_hash and out.exists() and hashlib.sha256(out.read_bytes()).hexdigest() == prior.get('sha256')):
            image.save(out, 'WEBP', quality=95, method=6)
        x = [round(width * n / 4) for n in range(5)]
        y = [round(height * n / 4) for n in range(5)]
        layouts[out.name] = {'width': width, 'height': height, 'x': x, 'y': y}
        ledger.append({'atlas': name, 'nativeSha256': native_hash, 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'width': width, 'height': height, 'bytes': out.stat().st_size, 'generator': 'builtin-imagegen', 'conversion': {'format': 'webp', 'quality': 95, 'resized': False, 'cropped': False}})
(target / 'layouts.json').write_text(json.dumps({'version': 2, 'description': 'Native four-by-four generated atlas boundaries; CSS crops keep each illustration inside its own cell.', 'atlases': layouts}, ensure_ascii=False, indent=2) + '\n')
ledger_path.write_text(json.dumps({'version': 1, 'expectedAtlases': len(expected), 'complete': not missing, 'atlases': ledger, 'missing': missing, 'preserved': ['king.webp']}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'packaged': len(ledger), 'expected': len(expected), 'missing': missing, 'format': 'WebP q95, native dimensions'}))
