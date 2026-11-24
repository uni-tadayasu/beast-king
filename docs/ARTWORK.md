# BEAST KING — current artwork production

## 2026-11-24 two-pack release

The published catalogue contains 2,304 card identities: 1,152 in BK01 and 1,152 in BK02. Card artwork uses 144 independently generated four-by-four atlases and the preserved, user-approved `king.webp` illustration for B0512 (王冠竜 レガリア). The catalogue assigns each displayed card a different atlas cell; B0512 uses its standalone illustration. The corresponding unused atlas cell is never assigned to another card.

| Type | Cards across both packs | Atlas files |
| --- | ---: | ---: |
| Normal beasts | 1,024 | beast-01 through beast-64 |
| Fusion beasts | 256 | fusion-01 through fusion-16 |
| Miracles | 512 | miracle-01 through miracle-32 |
| Gimmicks | 512 | gimmick-01 through gimmick-32 |

### Generation and preservation

The new raster illustrations were generated with the built-in image generation tool. No API or CLI generation fallback was used. Each atlas specifies sixteen scenes in row-major card order, with distinct subjects, silhouettes, compositions, environments, materials and palettes. Regalia retains its approved dedicated artwork. The four starter decks reference the same newly drawn card illustrations as the catalogue and battle screens.

Production WebP files preserve their generated dimensions. Encoding uses quality 95 without resizing or semantic edits. The authoritative dimensions and hashes are recorded in `assets/design-v2/cards/individual/production.json`; the per-card file, position, crop and hash are recorded in `manifest.json`. `card-art-layouts.js` supplies the matching browser crops with a small inset to avoid panel borders.

### Release verification

`npm run verify:release` checks all 144 WebP files, their SHA-256 hashes and native dimensions, all 2,304 unique artwork assignments, the matching browser crops, both 1,152-card packs, all four starter decks, and the three distinct mode backgrounds. A missing original or an unregistered artwork prevents the release check from passing. `npm run build:client` validates the browser asset references in the static package.

### UI, modes and visual effects

The current brand files are in `assets/design-v2/brand/`; the 1,200 × 630 social preview displays the 2,304-card release. The solo, room and ranked modes use separate backgrounds in `assets/design-v2/backgrounds/`. The shared rarity renderer adds two to eleven decorative layers in the artwork window, with the highest rarity using foil, glints, dust, prism, comet, orbit, shards, halo, constellation, rays and crown layers. Effects pause outside the viewport, in hidden tabs and when reduced motion is selected. Card text and battle information remain separate from the decorative layers.

The initial artwork and music record below is retained as historical provenance. It describes the earlier release and is not the current card inventory.

---

# Initial release artwork and audio history

All five original illustration assets were generated with the built-in `image_gen.imagegen` tool; the social preview was subsequently edited with the same tool for the 1,152-card fusion expansion. No API/CLI fallback was used. Image encoding was optimized with Sharp without semantic alteration; the social artwork was proportionally fitted to 1200 × 630 pixels. The original generated PNGs remain in the task's generated_images directory.

## Production assets

| File | Pixels | Bytes | Use |
| --- | --- | --- | --- |
| hero-wide.webp | 1672 × 941 | 404018 | Main scene, dragon on right, copy space on left |
| beasts-sheet.webp | 1254 × 1254 | 816112 | 4 columns × 4 rows, art 0–15 |
| arcana-sheet.webp | 1774 × 887 | 692572 | 4 columns × 2 rows, art 16–23 |
| fusion-sheet.webp | 1254 × 1254 | 822662 | 4 columns × 4 rows, fusion art 24–39 |
| social-ogp.jpg | 1200 × 630 | 282082 | Social preview with BEAST KING title and 1,152-card tagline |

Total: 3,017,446 bytes, approximately 2.88 MiB.

## Sprite geometry

Render artwork regions as squares. Beast and fusion atlases: `background-size: 400% 400%`; position is `column * 100/3` percent horizontally and `row * 100/3` percent vertically. Fusion atlas positions use `art - 24`. Arcana atlas: `background-size: 400% 200%`; position is `column * 100/3` percent horizontally and `row * 100` percent vertically. Atlas panels were visually inspected after compression.

| Art | Subject |
| --- | --- |
| 0 | Ivory and teal celestial crown dragon |
| 1 | Golden winged fox |
| 2 | Sapphire sea leviathan |
| 3 | Moonlit jellyfish spirit |
| 4 | Scarlet obsidian phoenix |
| 5 | Molten horned lion |
| 6 | Emerald feathered griffin |
| 7 | Turquoise wind kirin |
| 8 | Flowering spirit stag |
| 9 | Mosswood ancient turtle |
| 10 | Amethyst crystal rhinoceros |
| 11 | Basalt golem |
| 12 | Violet shadow panther |
| 13 | Indigo raven chimera |
| 14 | Rainbow astral serpent |
| 15 | Silver mechanical owl |
| 16 | Sacred starlight burst |
| 17 | Tidal healing spell |
| 18 | Spiral elemental magic |
| 19 | Cosmic library |
| 20 | Gilded arcane trap sigil |
| 21 | Crystalline ward shield |
| 22 | Celestial clockwork device |
| 23 | Moonflower fountain |
| 24 | Dawn celestial dragon × golden lion |
| 25 | Dawn winged fox × solar phoenix |
| 26 | Tide leviathan × luminous jellyfish |
| 27 | Tide sea turtle × marine griffin |
| 28 | Ember phoenix × horned lion |
| 29 | Ember obsidian rhinoceros × lava dragon |
| 30 | Gale kirin × wind griffin |
| 31 | Gale sky serpent × winged fox |
| 32 | Grove flowering stag × ancient turtle |
| 33 | Grove mosswood golem × botanical griffin |
| 34 | Stone amethyst rhino × basalt golem |
| 35 | Stone crystal owl × stone lion |
| 36 | Dusk shadow panther × raven |
| 37 | Dusk spectral serpent × horned lion |
| 38 | Aether astral serpent × mechanical owl |
| 39 | Aether nebula fox × celestial dragon |

## Final generation prompts

### Hero

Use case: stylized-concept. Asset type: premium original fantasy browser-card-game hero background for 娯楽王 (GORAKUOH). Create a polished 2048x1152 widescreen painterly Japanese anime fantasy illustration. A magnificent original celestial dragon occupies the right 65 percent of the image. The dragon has flowing pearl and ivory armor-like scales, rich midnight teal feather fins, crescent antler horns, an elegant long sinuous body, and a luminous gold constellation crown hovering above its head. It is graceful, powerful, and unmistakably dragon-like, with a striking expressive head. Its body sweeps diagonally down to the lower-right. Behind it is a vast ruined observatory under deep midnight-blue stars, with subtle ancient gold celestial instruments, tiny floating turquoise motes, atmospheric clouds, and radiant curved constellation trails. Dramatic refined turquoise rim lighting and warm gold highlights, beautifully intricate brushwork and clean shapes, premium trading-card illustration quality. Keep the leftmost 40 percent predominantly dark indigo atmospheric negative space, so white website typography will read cleanly. Strong cinematic depth. Absolutely no text, letters, numbers, logos, watermark, UI, border, card frame, or collage. Entirely original creature design, no resemblance to any existing franchise creature. Illustration only, no photorealism, no 3D render, no low-poly shapes.

The title was subsequently changed by the user to ビーストキング / BEAST KING. This text-free artwork remains suitable for the updated title.

### Beasts atlas

Use case: stylized-concept. Asset type: precise 4 by 4 sprite atlas of original fantasy creature illustrations for a premium Japanese card game. Generate one SQUARE 2048x2048 raster image divided into exactly FOUR equal-width columns and FOUR equal-height rows, 16 equal SQUARE tiles filling the entire image. Every tile is a distinct complete illustration, with hard straight boundaries at 25%,50%,75% of width and height. Absolutely NO gutters, no margins, no frames, no borders, no text, no numbers, no symbols resembling letters, no logo. Each creature centered completely inside its square with a strongly recognizable head and upper body, detailed scenic atmospheric backdrop. Polished richly colored hand-painted Japanese anime fantasy card art, crisp character silhouettes, dramatic lighting, not realistic photography, not 3D, not lowpoly. Carefully follow row-major tile order: TOP ROW left to right: 1) celestial ivory-and-teal dragon with crescent antler horns and golden star crown, 2) gold-and-white winged fox with sunlit tail, 3) sapphire sea leviathan emerging from deep-blue water, 4) translucent luminous moonlit jellyfish spirit. SECOND ROW left to right: 5) scarlet obsidian phoenix with flame feathers, 6) molten horned lion with glowing red mane, 7) emerald feathered griffin soaring amid green wind, 8) graceful turquoise wind kirin with flowing wisps. THIRD ROW left to right: 9) flowering antlered forest spirit stag, 10) ancient mosswood turtle with miniature grove on its shell, 11) amethyst crystal-armored rhinoceros, 12) massive basalt golem with gold glowing cracks. BOTTOM ROW left to right: 13) violet shadow panther with luminous eyes, 14) indigo raven chimera with iridescent plumage, 15) rainbow astral serpent curling around tiny stars, 16) intricate silver mechanical owl with celestial gears. Only these sixteen tiles, exact equal square alignment, no extra artwork or shared background between tiles. Entirely original creatures.

### Arcana atlas

Use case: stylized-concept. Asset type: exact 4 columns by 2 rows sprite atlas of eight premium magical card illustrations. Create one LANDSCAPE 2048x1024 image consisting of precisely FOUR equal-width columns and TWO equal-height rows: EIGHT equal SQUARE panels with hard straight boundaries at 25%,50%,75% image width and 50% image height. No gaps, no gutters, no margins, no outlines, no borders, no text/letters/numbers/logo/card frame. Every panel a distinct complete richly detailed hand-painted Japanese fantasy illustration. No UI, no photorealism or 3D. Center primary magical subject inside each tile. Premium luminous anime fantasy style, deep atmospheric backgrounds, refined gold and jewel colors, beautifully crafted arcana imagery. TOP ROW left to right: 1) sacred radiant golden-white starlight burst over a navy celestial altar, 2) turquoise tidal healing spell with glowing water ribbon and pearl lotus, 3) violet-teal-gold spiral of elemental magic orbiting a brilliant orb, 4) ancient cosmic library with floating open books and abstract unreadable glowing runes under starry vaulted ceiling. BOTTOM ROW left to right: 5) intricate ominous gilded arcane trap sigil centered in purple shadow, 6) iridescent azure crystalline ward shield surrounded by shimmering shards, 7) mystical ornate bronze-and-teal clockwork device with layered celestial gears, 8) moonflower fountain overflowing with lavender-blue healing light at night. Each image touches all four of its panel edges. Strict mathematical equal 4-by-2 grid. No extra panels.

### Social preview

Use case: ads-marketing. Asset type: social open graph preview for an original premium Japanese anime fantasy card browser game called ビーストキング (BEAST KING). Wide landscape social image, aspect ratio exactly 1.90476:1, intended 1200x630. Polished hand-painted anime fantasy art. On RIGHT half: majestic original pearl-ivory dragon with dark teal feather fins, crescent antler horns, luminous golden celestial crown, intensely beautiful expressive face, ornate celestial ruins and stars behind it, turquoise and gold rim lighting. On LEFT half: deep midnight navy negative space with a few faint gold constellation arcs. Place large beautiful highly legible Japanese title exactly 「ビーストキング」 in a sharp premium golden serif game logotype at left upper-middle; keep entire title inside image safe zone with generous margins, no clipping. Underneath place exact English text 「BEAST KING」 with wide elegant gold capitals. Under that in small clean white typography place exactly 「1024枚のカードが、戦略になる。」. Render text perfectly accurately, crisp, centered within left half. No other words, no badges, no buttons, no interface. Title should read exceptionally well at thumbnail size, balanced editorial game key art. All typography within central 85 percent safe area. Entirely original dragon design, no recognizable franchise content. No photorealism, no 3D, no watermark.

## Icon exports

The project-native `dist/assets/icon.svg` crown-and-beast emblem was rasterized with Sharp into favicon-16.png (16²), favicon-32.png (32²), apple-touch-icon.png (180²), icon-192.png (192²), and icon-512.png (512²). favicon.ico contains the 16² and 32² PNG images in a standard ICO container; both sizes were decoded successfully for verification. No image-generation edits were applied to the vector mark.

## Fusion expansion — final prompts

### Fusion atlas

Use case: stylized-concept. Asset type: exact 4 columns by 4 rows sprite atlas of sixteen ORIGINAL fusion-beast illustrations for a premium Japanese fantasy card game BEAST KING. Create ONE SQUARE image 2048x2048, exactly 16 EQUAL SQUARE PANELS, FOUR columns and FOUR rows, hard panel boundaries at exactly25%,50%,75% image width and height. No gutter, no margin, no frame, no borders, no writing, no numbers, no labels, no logos. Each cell is an independent richly painted close-up fantasy hybrid monster with both fused animal identities visibly combined into a single elegant coherent anatomy. Polished detailed anime fantasy card illustration, luminous jewel colors, dark navy atmosphere, intricate gold highlights and teal accents, premium heroic beauty. Distinct poses and clear bold silhouettes, each monster entirely within its own cell. Backgrounds vary to match element. Follow EXACT ROW-MAJOR order:
TOP ROW: (1) DAWN majestic pearl-white celestial crown DRAGON fused with golden LION, lion mane framing long draconic face, crescent horns, feather fins, starlight crown; (2) DAWN luminous winged golden FOX fused with PHOENIX, fox face and ears with solar fire feather wings and long radiant tails; (3) TIDE sapphire LEVIATHAN fused with luminous JELLYFISH, dragon head crowned with translucent umbrella fins and flowing turquoise tentacles under water; (4) TIDE ancient sea TURTLE fused with marine GRIFFIN, armored shell, eagle head and fins like immense blue wings amid surf.
SECOND ROW: (5) EMBER scarlet PHOENIX fused with horned LION, leonine face with beaklike crest and huge red feathered flame mane; (6) EMBER obsidian RHINOCEROS fused with lava DRAGON, molten armored plating and glowing horn, smoldering wings; (7) GALE emerald KIRIN fused with wind GRIFFIN, long elegant kirin face, antlers, feathered winged body, swirling green air; (8) GALE silver sky SERPENT fused with winged FOX, fox face and silver fluffy collar on slender curling serpent body with airy fins.
THIRD ROW: (9) GROVE flowering forest STAG fused with ancient TURTLE, antlered stag face, green shell grown with miniature blossoming trees; (10) GROVE mosswood GOLEM fused with botanical GRIFFIN, living bark feather wings and leafy eagle head with golden eyes; (11) STONE amethyst RHINO fused with basalt GOLEM, massive rhinoceros head and thick crystalline shoulders with glowing gold cracks; (12) STONE crystal OWL fused with stone LION, broad owl face, lion mane carved from translucent crystals, stone armored paws.
BOTTOM ROW: (13) DUSK shadow PANTHER fused with RAVEN, feline face and indigo feather mane, violet glowing eyes, black raven wings; (14) DUSK spectral SERPENT fused with horned LION, leonine face and dark vapor mane on long shadowy serpent body beneath purple moon; (15) AETHER rainbow astral SERPENT fused with silver mechanical OWL, owl head with celestial gear halo on elegant prismatic serpentine body and metallic wings; (16) AETHER radiant nebula FOX fused with celestial DRAGON, elegant fox face, draconic horns, teal-gold fin wings and flowing luminous celestial tails. EXACT 16 square illustrations. No photorealism, no3D, no lowpoly. Entirely original creatures, not from existing franchises.

### Social preview count edit

Reference: original `social-ogp.jpg`, visually inspected before editing.

Use case: text-localization / precise-object-edit. Edit the provided BEAST KING social preview image. Change ONLY the small white Japanese tagline under BEAST KING, from 「1024枚のカードが、戦略になる。」 to EXACTLY 「1152枚のカードが、戦略になる。」. Keep precisely the same original Japanese gold title ビーストキング, English gold title BEAST KING, letter styling, gold decorative lines, full dragon illustration, crescent horns, crown, constellation background, colors, lighting, layout, margins, proportions, and landscape aspect ratio. Do not change anything else. The edited tagline must be crisp, white, fully legible, positioned and sized like the original. Exact digits: 1 1 5 2. No additional words or logos. Preserve all the other original visual details.

## User-provided BGM

The user supplied two MP3 files and specified the following assignment. Both production files are byte-for-byte copies of the provided originals. No re-encoding, loudness adjustment, trimming, metadata removal, or cover removal was performed; the original files were not edited.

| User file | Production path | Use | Duration | Audio format | File bytes |
| --- | --- | --- | --- | --- | --- |
| 00001.mp3 | assets/audio/menu.mp3 | Menu and general screens | 202.560 s (3:22.56) | MP3, 48 kHz, stereo, approximately 192 kbps | 4879077 |
| 00002.mp3 | assets/audio/battle.mp3 | Battle screens | 359.904 s (5:59.904) | MP3, 48 kHz, stereo, approximately 186 kbps | 8409470 |

Both files include embedded 360 × 360 JPEG cover art, retained unchanged. Technical inspection used ffprobe and FFmpeg silencedetect with a -50 dB threshold and minimum 0.4-second duration. The menu file has an approximately 1.196-second quiet interval at 183.047–184.243 seconds, with no qualifying trailing interval. The battle file has quiet intervals at 218.506–219.246 seconds and 287.082–287.832 seconds, and an approximately 1.479-second trailing interval beginning at 358.401 seconds. These are source-audio characteristics and are preserved. The total two-track payload is 13,288,547 bytes (approximately 12.67 MiB); existing MP3 encoding was retained to avoid an unnecessary additional lossy compression pass.
