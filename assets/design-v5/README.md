# BK05 — 幻彩の夢界 artwork

This release contains 96 original, individually directed card illustrations:
24 each for 折紙 (origami), 玻璃 (glass), 影絵 (shadow) and 彩墨 (pigment).
Each family has 12 normal beasts, 6 miracles, 4 gimmicks and 2 fusion beasts.
No illustration cell is shared by two cards. Existing set artwork is unchanged.

## Production assets

Four native 1,536 × 1,024 PNG atlases were generated with the built-in image
generation tool, one call per family, then visually reviewed in their actual
six-column, four-row order. Every 256px square scene has an explicit subject
from `FIFTH_ART_DIRECTION` in `fifth-set-data.js`. The family materials are
folded washi paper, transparent stained glass, living theatrical silhouettes,
and flowing painted ink. The reviewer checked the individual subject order,
readable silhouettes, separation at cell boundaries, and consistent material
identity in all 96 paintings.

The pack cover was generated separately at native 1,024 × 1,536 with a transparent
exterior. It shows a folded-paper fox alongside glass, shadow and pigment
motifs. The visible titles were checked as 第五弾, 幻彩の夢界 and BEAST KING.

WebP encoding uses quality 94 at the native dimensions. No source is resized,
retouched, recolored or upscaled. Browser crop coordinates remove four percent
from each side of a cell to keep adjacent illustrations outside the art window.
The resulting displayed card crop is 235 × 235 pixels.

## Source records and validation

- `cards/generation-jobs.json` and `cards/prompts/`: exact subjects, card order,
  palette and final prompts.
- `cards/generation-records/`: each source PNG hash, published WebP hash, prompt
  hash, native dimensions, visual-review state and per-card crop hash.
- `cards/manifest.json`: complete four-atlas registry, 96 card assignments and
  the pack cover record.
- `../../card-art-fifth.js`: production browser map.

`node scripts/prepare-fifth-art-jobs.mjs` reproduces the prompt plan from the
authored catalogue. `python scripts/package-fifth-art.py --family <family>
--master <native-png> --reviewed` packages a visually reviewed native source;
`--cover` packages the separately reviewed cover. `--finalize` requires all
five sources and writes the production registry. The `--reviewed` flag records
an actual inspection; generating an image or running a script is not itself
visual review.

`tests/fifth-art.test.mjs` and `scripts/validate-fifth-art.mjs` reject missing
cards, reused cells, duplicate individual image hashes, crops crossing into a
neighboring painting, unreviewed output, incorrect catalogue identities, and
undersized source cells. The complete release verifier also checks the shipped
WebP bytes and native dimensions.
