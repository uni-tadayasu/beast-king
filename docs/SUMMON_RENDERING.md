# Original-art foreground relief

Each revealed creature stands above its flat card as an original-art silhouette
with procedural depth. The representation is a **2.5D relief**: the original
painting supplies the visible front, with a rounded surface and a narrow edge.
It does not reconstruct unseen anatomy, a separate back illustration, or an
independently rigged character. Printed cards retain their full illustrations.

## Public masks prepared before release

Public creature alpha masks are computed during artwork production and packed
as grayscale PNGs. The browser loads the appropriate cached tile and multiplies
the source alpha by that coverage. It preserves every source RGB byte. No ML
model, inference worker, ONNX bundle, or WASM runtime is downloaded by the game;
the player does not run segmentation on their device.

The release gate requires `card-foreground-masks.js` to cover all 2,625 public
beasts and fusion creatures. Each 2048 × 2048 PNG atlas has an 8 × 8 grid of
256 × 256 mask tiles. Unused cells in the final atlas remain black. Every row
records the mask atlas SHA-256 and the original illustration file SHA-256.
The packer also measures `maskStats` from each final decoded tile: the pixel
count, pixels with coverage at most 8, pixels with coverage at least 128, and
the sum of all 8-bit coverage values. `nativeAlpha` records whether the approved
original already had usable transparency. This production flag never grants
runtime permission to use a mask or substitutes for checking the real source.
The manifest and PNGs are public resources; artwork-production inputs and
tooling are excluded from the browser package. Missing entries block release.

The build-time native runtime is initialized only after setting
`ORT_DISABLE_TELEMETRY=1`. The same process-level opt-out is required in the
generation workflow. This follows the runtime's documented switch that prevents
its telemetry uploader, events, and persistent identifier from being created;
it must precede loading the native module. Production browsers never load this
build dependency. Reference: [ONNX Runtime privacy documentation](https://github.com/microsoft/onnxruntime/blob/main/docs/Privacy.md).

The production alpha is distinct from a depth estimate. A distance field over
that alpha supplies the rounded front in `summon-geometry.js`. The WebGL path
uses clipped triangles, a narrow back, contour sides, lighting, and depth
testing. The Canvas fallback uses a smaller front grid and matte contour sides.
Both modes use the same source image, alpha, and camera placement.

## Exact source binding and private artwork

`summon-art.js` reads the field card's already-authorized DOM background.
`summonMaskSourceKey` binds the cache to the exact public asset URL, including
its query, source dimensions, and illustration crop. Preview and production
origins can differ, while the public asset identity remains exact. A changed
illustration, different crop, or unknown opaque replacement cannot borrow
another card's mask.

Pending operator artwork produces no source. An authorized image that already
has transparency uses its native alpha directly. Private/custom opaque art
without a matching public source receives no public fallback mask. The flat
card stays visible and usable while a matching public mask is loading, or if
the source cannot be resolved; the renderer never substitutes a full-background
upright rectangle and never invents a replacement creature.

Hidden cards, hands, decks, account state, and saved game contents are not
inputs to mask lookup. No source image is uploaded. Decoded private source
references and textures are discarded when they are no longer authorized or
used. Public cache reads are bounded and remain in memory only.

## Lifecycle and motion

The scene shares one canvas, keeps at most 16 decoded public-art entries, and
limits drawing resolution. A summoned creature remains present until it leaves
the field. Confirmed summon, attack, damage, and activation events trigger
presentation cues without changing game rules. Reduced-motion mode retains
the static creature; hidden pages pause drawing. Returning to battle, source
changes, GPU context loss, and removals all use the same lifecycle checks.

## Release verification

`scripts/validate-foreground-masks.mjs` checks complete creature coverage, exact
source keys, both SHA-256 hashes, PNG signatures and dimensions, grid-aligned
tile bounds, and unintended tile sharing. Identical source keys may share a
tile, including the explicitly shared Selva original. It deduplicates disk
reads and requires no image-processing or ML dependency. `verify-release.mjs`
runs this gate; the public readback probe checks the shipped manifest, lookup
module, coordinator, and every referenced mask atlas against local bytes.

Each non-native mask must have at least four clear and four visible pixels,
and mean coverage between 3% and 97%. Missing, empty, effectively opaque, or
outlying masks block release for repair and review. Native-alpha records may
have a white cache tile because the browser uses the actual source alpha
directly. These metrics are calculated by the packer from the final tiles;
their atlas SHA-256 binds them to the bytes checked by the release gate.

Browser CI runs the real source-key resolver, mask decoder, and alpha composer
on public artwork from multiple editions. It records RGB preservation, source
immutability, transparency, cache latency, and observed same-origin GET-only
requests, then produces original/cutout contact sheets for visual inspection.
It also checks desktop and portrait battle layouts, real pointer attacks,
static motion, removals, and unchanged approved card sources. Numerical alpha
coverage alone does not prove that a mask retains every limb or excludes every
piece of scenery; representative contact sheets remain a visual release
review requirement. CI timing is not a physical-phone performance guarantee.

## Apex card finish

`isApexReliefCard` selects GGR fusion creatures and GGR ordinary creatures with
printed cost 6 or greater: 402 cards in the current catalog. It changes no
rarity, statistics, ownership, or game balance. SVG edge lighting and grooves
copy only the adjacent approved artwork and its crop. The finish stays inside
the illustration aperture; a thin metal rim leaves names, costs, rules, and
statistics unobstructed. Static relief remains visible with animation disabled.
