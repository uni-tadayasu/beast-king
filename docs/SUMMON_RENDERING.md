# Foreground relief rendering

The battle scene renders each revealed creature as an original-art silhouette
with procedural depth. It is a 2.5D relief, not a reconstruction of unseen sides
or back anatomy. Printed cards keep their complete original illustrations.

## Authorized artwork

`summon-art.js` resolves the image and crop from the field card's approved DOM
background. Pending operator artwork produces no source. Hidden cards, decks,
hands, accounts and save contents never enter the rendering worker. Already
transparent art bypasses segmentation and retains its original alpha.

For opaque images, `summon-foreground-worker.js` runs a locally served U2-Net-P
model in a dedicated single-threaded WASM worker. It receives RGBA pixels,
never source URLs, and returns only alpha. The color bytes of the original
texture are retained exactly. There is no image upload or persistent mask
cache. The worker is terminated after 12 idle seconds and on leaving battle.

The learned foreground mask is not an anatomical depth estimate. A distance
field over its alpha produces the rounded front surface in `summon-geometry.js`.
The WebGL path uses clipped triangles, a narrow back, contour sides, lighting
and depth testing. The Canvas fallback uses a smaller front grid and matte
contour sides. Neither path draws an upright rectangular frame or restores a
full-background painting if extraction fails; the underlying flat card remains
visible and usable.

The scene shares one canvas and keeps at most 16 decoded public-art entries.
Unused private textures and decoded source references are removed immediately.
Changing or revoking the authorized DOM source cannot reuse a previous mask.
Reduced-motion mode keeps the static creature visible.

## Runtime and model provenance

ONNX Runtime Web is pinned to 1.20.1. The three vendored runtime files come
from that exact npm distribution, without modification. U2-Net-P's ONNX
conversion comes from the rembg release identified in the runtime NOTICE.
`scripts/prepare-summon-runtime.mjs` checks the original source checksum and
prepares the 192px spatial metadata variant. Learned weights and operators are
unchanged. The 192px input is resampled back onto the original texture alpha.
The application requests only the first output and disables the CPU arena and
memory-pattern allocation options. Licenses are included next to these files.

Synthetic Node measurements supported the smaller input, but do not establish
physical-phone performance. Browser CI reviews actual card masks, desktop and
portrait battle layouts, pointer attacks, static motion, and native alpha.
Automated processing covers any authorized creature image; it does not certify
every feather, transparent limb or magical effect on all 2,625 illustrations.

## Apex card finish

`isApexReliefCard` selects GGR fusion creatures and GGR ordinary creatures with
printed cost 6 or greater: 402 cards in the current catalog. It does not change
rarity, stats, ownership or game balance. SVG edge lighting and grooves copy
only the adjacent approved artwork/crop. The finish stays inside the art
aperture; a thin metal rim leaves all printed text and values unobstructed.
