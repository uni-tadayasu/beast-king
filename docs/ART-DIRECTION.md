# Painted-ink art direction

This document records the original BK01/BK02 painted-ink revision. Its 144 redraws and 2,304-card scope describe that revision; the current four-pack inventory and BK03/BK04 production records are documented in [ARTWORK.md](ARTWORK.md).

The 2026-11-24 presentation update uses deliberate colored contours, broad
paint shapes, warm highlights and blue-violet shadows. Creature anatomy,
silhouette, individual motifs and card identity must survive any art change.
Avoid photographic fur, skin or wet-metal texture and glossy 3D rendering.

## What this release changes

Nine atlases (144 illustrations) were redrawn using the built-in image-generation
editor: beast 01, 05, 06, 09, 13 and 62; fusion 01; miracle 01; gimmick 01.
These cover starter-visible creatures, a second-set material outlier and all
four card types. Every generated atlas was checked visually for its original
16 subjects and row/column order. Generated masters were converted to WebP at
native dimensions; no rescaling or cropping is baked into the assets.

The established 12-card correction remains, except B0991 now uses its newly
redrawn 16-cell atlas. Thus the active replacement map contains 155 card IDs.
The private release ledger is `assets/design-v2/art-direction-review.json`.
It records exact card IDs, native and published hashes, dimensions and the
editing brief. It is not packaged into the public website.

The remaining atlas art has a non-destructive display finish installed by
`card-art-direction.js` and scoped by `card-art-direction.css`: light pigment
flattening and ink contours. This is a rendering treatment, not 2,304 newly
drawn images. Newly redrawn atlases receive only a slight common colour finish.
Text, numbers and rarity foil stay separate. Public and authenticated Regalia
art keep their dedicated treatment. Card gameplay data is untouched.

## Backgrounds

The entry illustration keeps the crowned violet/teal feline on the right and
quiet navy title space on the left. The three illustrated arenas are the
ancient tree (teal/gold), the twin celestial mirror gates (cyan/silver), and the
sovereign crown arena (gold/crimson). Scenery is concentrated on the perimeter
so the central playfield stays readable. None contains baked-in UI or text.

## Continuing the art pass

1. Inspect the exact shipped crop, not only the atlas master.
2. Use the painted atlas `illustration-update-02.webp` as a style reference.
3. Keep exact card subjects and atlas order; never substitute a shared creature.
4. Inspect every new cell before adding its ID to the reviewed ledger.
5. Run `node scripts/verify-release.mjs` to check crop bounds, unique cells,
   matching hashes, mapping coverage and all three distinct arena assets.

The full-catalog contact sheet generator is `scripts/review-card-art.py`.
Its output is an inspection aid; producing a contact sheet does not constitute
visual approval of every original card.
