# BEAST KING — authoritative current integration contract

Public origin: https://www.beast-king.com/ . Preserve the repository CNAME and existing GitHub Pages main/(root) publication. Root owns app.js, all shared UI/CSS, integration and deployment; catalog agent owns catalog.js, catalog tests, about.html, README, this contract and online.js/client tests, with index.html description/SEO edits delegated only when requested; engine agent owns engine.js, engine tests and the online Worker/API tests; art agent owns assets. Do not publish temporary QA pages.

## Counts, names and decks

- First set name: 六源の覚醒（ろくげんのかくせい）, pack ID BK01. The first set and pack pool both include ALL1152 cards, including all128 fusion beasts. Do not describe the set as1024 or place fusion outside it.
- Catalog total1152: ordinary beasts512 (B0001–B0512), miracles256 (M0001–M0256), gimmicks256 (G0001–G0256), fusion beasts128 (F0001–F0128, indices1025–1152).
- Ordinary and fusion beasts both have category:'beast', so user-facing beast category640. Preserve internal type:'beast' vs type:'fusion'. User-facing fusion name is 合成魔獣.
- Main deck EXACT32 of ordinary beasts/miracles/gimmicks; special deck EXACT4 of fusion beasts; combined36, mandatory for every CPU/online start. At most2 copies of one ID in each deck, additionally limited by owned quantity for ALL types including fusion. Constant DECK_COPY_LIMIT=2. Constants DECK_SIZE=DECK_MIN=DECK_MAX=32, SPECIAL_DECK_SIZE=4. validateDeck/validateSpecialDeck enforce type/count/copy constraints.
- Eight starters persist, each main16 beasts/8miracles/8gimmicks, including two M0256. Each has specialIds of four distinct associated-origin fusion beasts.
- The special deck is placed in 特殊ゾーン. Materials sent away go to 異世界ゾーン and cannot be reused; internal state name banished remains. Eliminated cards go to お墓ゾーン (grave). Use 消滅 for elimination and 守備力 for beast defense; hp/maxHp remain internal compatibility fields.

## Origins, rarities and models

- Public ORIGINS has seven entries in the exact user order: mountain山, river川, seed種, grass草, flower花, tree木, king王. ELEMENTS is the same alias. Public origin names and sorting must follow this order.
- Private CARD_SERIES keeps eight original generation families and all IDs/names/art/effects. Mapping: dawn→flower, tide→river, ember→seed, gale→grass, grove→tree, stone→mountain, dusk→seed, aether→grass. Cards/starters retain the old internal series and expose the new canonical element/origin. Eight starter decks remain across six origins. Old family names are not public origin labels.
- Rarities in ascending order: Nノーマル, Rレア, KRキラレア, KKRキラキラレア, GRギラレア, GGRギラギラレア.
- MODEL_LABELS: attack:'アタック型', defense:'ディフェンス型', hybrid:'アタック・ディフェンス型'. Ordinary beasts MUST be exactly256 of each model. Each original64-card family selects32 defense models using guard/defense-priority ordering; remaining32 are attack. ALL128 fusion beasts have model:'hybrid', combining attack and defense; they are outside the ordinary256/256 count. Model classification is fixed on the card; do not recompute it as stats change.
- All five placement categories remain upright: ordinary attack models slightly forward toward the opponent; ordinary defense models slightly backward toward the owner; hybrid fusion beasts exactly centered; miracles slightly left of their reference frame; gimmicks slightly right of their reference frame.
- Gimmicks retain two actual set slots. The miracle frame displays the most recent public activation from players[].lastMiracle; it is a visual record, not an extra card zone. A used miracle still moves to grave and cannot be played or used as a material from that visual display. Do not duplicate card counts or alter36-card conservation for this record.

## Card subtypes and implemented effects

SUBTYPE_LABELS: power:'威力カード', regeneration:'再生カード', reflection:'反射カード', support:'魔獣サポートカード'.

- Miracles: power128 (damage_enemy, draw, buff, sweep); regeneration128 (heal, shield_heal, drain, renew, plus the explicit user exception M0256 fusion). M0256 is named exactly 合成, costs3 ether, rarityR, art18, effect{kind:'fusion',value:0}, subtype regeneration. No HP healing is added to 合成.
- shield_heal heals own heart points by value up to5000 AND adds shield value. Ordinary shield effects can remain on beasts and in legacy engine compatibility.
- Gimmicks: reflection128=ambush64+barrier64. ambush returns a fixed value of effect damage to the attacking beast's defense; elimination cancels its attack. barrier triggers on a direct heart-point attack, reduces that attack by up to value, reflects the actual prevented amount to the attacking beast's defense, and cancels remaining attack if that beast is eliminated.
- Gimmick support128=spring64+fountain64. At the owner's next turn start, spring increases every allied beast's attack/current defense/max defense by value (100,200 or300). fountain restores each allied beast's defense by value (400–1800), capped by its max defense. Both consume themselves into grave after triggering. Neither is an own-heart-point-only effect.
- Generated cards' rules text must exactly match these effects. Existing ordinary keywords are guard, rush and drain; catalog currently has no pierce keyword.

## Points, turns and battle

- Each player begins at5000ハートポイント; healing cap5000. 0 means defeat; simultaneous0 is draw. Keep internal player.core and engine MAX_CORE aliases as needed.
- POINT_SCALE=100 and FUSION_MATERIAL_BONUS=100 are catalog exports. Published card attack, defense(hp/maxHp), damage, healing, buffs and shields use actual hundred-point values. Do not scale draw counts, costs, ether, slots or card counts.
- Initial/max hand4; each own turn replenishes missing cards to4. Draw effects stop at4, leaving surplus cards in deck; no overflow discard. Empty draws cause increasing fatigue count×100.
- Ether begins1 and grows by1 each own turn to10, refilling to max. Each player has at most4 field beasts (ordinary+fusion) and2 gimmicks. Summoned beasts wait until their next own turn unless rush; one attack per turn. Guard restricts ordinary attack targets, not targeted miracle effects.
- Attack targeting an ordinary (type beast) アタック型 beast only: target always消滅→grave regardless of defense. Its owner receives the attacking beast's FULL attack as heart-point damage, bypassing and preserving shield. No retaliation.
- Attack targeting an ordinary ディフェンス型 OR any 合成魔獣 (hybrid): compare current target.hp (守備力) with attacker.attack. If attack<=defense, target survives; neither defense nor owner HP is consumed; equality also survives with0 damage. If attack>defense, target消滅→grave and owner receives exactly attack−defense heart-point damage, bypassing and preserving shield. No retaliation.
- Every fusion beast uses its attack value when attacking and the defense comparison when attacked. The ordinary attack-model automatic-elimination rule never applies to fusion, including when an old saved match references a fusion card.
- Direct heart-point attacks still use ordinary shields/barrier effects. Trap resolution may cancel an attack by eliminating its source before the ordinary attack resolves.
- Miracle/reflection effect damage can reduce a beast's defense and eliminate it at0; it does not by itself invoke the model's ordinary-attack heart-point penalty. Healing defense uses maxHp cap.
- drain keyword heals only the actual enemy HEART-POINT damage caused by that combat, not nominal attack or eliminated defense points. Miracle drain remains its explicit HP damage/healing effect.

## Fusion rules and API

Fusion cards all have model hybrid, cost0, base attack/defense400–700, art24–39 from fusion-sheet.webp4x4, existing summon effects and keywords. Text begins: 特殊デッキから「合成」で召喚。素材2枚目以降、1枚につき攻撃力・守備力+100。

- Use 合成 by paying its3 ether only; no extra ether for the chosen fusion beast or material count.
- Select one or more OWN ordinary or fusion beast cards from hand/field/grave. Hand-only, field-only, grave-only or mixed zones are all legal. No material-count cap beyond available cards; no recipe/origin restriction. Opponent cards and cards already in banished are unavailable.
- All selected materials move to banished. The spell goes to grave. The selected remaining special-deck beast moves to field, occupying one slot. Check capacity AFTER consuming selected field materials.
- Attack, current defense and max defense start at the fusion card base plus(materialCount−1)×100, with no extra cap. Existing summon effects and keywords then apply. An eliminated fusion beast in grave can itself become a future material. Record fusionMaterialCount.

newGame({playerDeck,cpuDeck,playerSpecialDeck,cpuSpecialDeck,seed,difficulty}) validates both decks. Omitted specials use a corresponding starter or first starter for backward compatibility. Player state includes special:[FIDs], banished:[BIDs or FIDs], specialSize:4; field can contain beast or fusion. State names deck/hand/grave/traps/core/hp/maxHp stay compatible.

getFusionMaterials(state,who=state.active) returns eligible objects {zone:'hand'|'field'|'grave',index,uid?,cardId}. validateFusionSelection(state,handIndex,{specialIndex,materials:[{zone,index,uid?}]}) returns{valid,errors}. Validate integer indexes, distinct physical references (same ID copies can be separate materials), ownership/type, special presence, energy, post-consumption capacity and game state BEFORE mutation. Invalid/cancelled selections consume nothing and do not change seed/log. Handle spell/material hand indexes atomically. playCard accepts the selection. getPlayableCards includes 合成 only when at least one legal selection exists. CPU uses legal own materials including single-zone options and obeys the same rules.

## First entry and play modes

- First entry requires a player name of1–16 characters, persisted as local playerName in the v6 game save and changeable later. The top menu offers the start action; after starting, expose three clearly named modes: ソロ, マルチ, ランク.
- ソロ has ten chapters with exactly two battles per chapter (20 total), plus the existing three-level local CPU practice mode. Save campaign progress locally and synchronize the validated save for linked devices; win advances, loss/draw/surrender never advances, and cleared battles remain replayable. Use dist/campaign.js and deduplicate results by game.campaignMatchId. マルチ is code-based1v1 online rooms. ランク is ranked online matchmaking with the server's60-second BOT fallback. Do not label a local CPU match as an online human match.
- Root synchronizes local playerName to the anonymous online nickname when connecting/updating. The name string can be included in local backups; the anonymous online identity, bearer credential and server rating remain excluded.

## Collection, treasure and packs

- The first set 六源の覚醒 contains ordinary512+fusion128+miracle256+gimmick256=1152. Every catalog card is in PACK_CARD_IDS; fusion cards are not an unrestricted special library.
- Initial collection grants enough copies to construct any of the eight starter decks, including their four fusion cards. Shared starter IDs use the maximum required quantity, not an unrestricted unlock. Other cards are acquired from packs. All deck editors and start gates enforce owned quantities and exact32+4.
- Initial treasure100. Pack price100, size12, with one slot guaranteed R-or-higher. The remaining slots can also be rare. The collection holds at most3 of each ID; every fourth-or-later copy converts immediately to5 treasure.
- Completed battle rewards: win60, loss20, draw30, forfeit0. Award a completed result once; avoid duplicate settlement from renders, reloads, polling or repeated end-state callbacks.
- Local v6 state stores playerName, collection, treasure, decks, CPU progress/stats and settings. Root owns migration/backup logic. Preserve valid compatible saves; do not grant all1152 or all fusion cards during migration. Online credentials/profile/rating are not part of a game backup.

## Online play and persistence

- Frontend: GitHub Pages at https://www.beast-king.com/ . Backend: Sites Worker with D1, API base https://beast-king.hisa-0128-1996.chatgpt.site/api . Sources server/worker.js and server/schema.sql; deployment applies schema/migrations. Do not create the schema per gameplay request.
- Support code-based1v1 rooms and real-time ranked matching. Ranked waits for a real opponent; before60 seconds never create a BOT. At/after60 seconds, still prefer an available human, otherwise the server creates the BOT. Always label BOT opponents explicitly. Client timers never generate or decide a BOT match.
- Online turns have a120-second server deadline; expiration loses the match. Leaving the screen, changing tabs or closing the browser does not pause an online match. Keep this separate from music pausing in hidden tabs.
- Anonymous guest bearer credentials and nickname persist in the separate beast-king-online-profile-v1 storage key. They identify an account through an independent device session and are excluded from v6 game saves/backups. Server owns rating/match state. The validated v6 save, including collection and treasure, synchronizes through revision-checked cloud saves; never silently overwrite concurrent device changes.
- Initial server rating1000; ranked results update Elo once (K32); room matches do not change rating. UI uses server results/rating. Online snapshots rotate the viewer to player0 and redact deck order, opponent hand/special identities, hidden trap cards and RNG seed.
- Profile creation: unauthenticated POST /profile {nickname?,origin?}; authenticated GET /profile and POST /profile for nickname changes. Successful registration includes token and profile; subsequent authenticated calls use Authorization: Bearer.
- Rooms: POST /rooms {deck,special}; POST /rooms/:code/join {deck,special}; GET/DELETE /rooms/:code. Queue: POST /queue {deck,special}, GET/DELETE /queue. Room/queue payloads contain status waiting/matched/idle/closed and match when assigned.
- Match: GET /matches/:id; POST /matches/:id/actions with actionId, revision and kind play/attack/endTurn/surrender plus action fields. Repeated identical actionId/payload is idempotent. Conflicts return HTTP409 and latest match; UI chooses when to refresh.
- online.js exposes createOnlineClient with phase-tagged raw-server updates, excluding registration token from public returns/events. ensureProfile may use the verified identity cache; refreshProfile must request current GET /profile activity for an existing bearer so a lost membership response can be recovered, returning an explicit authentication-required state on401; never silently replace an invalidated account with a new guest. One guest registration at a time; identical GETs share transport; poll only while visible, with one second after the prior request completes. Cancellation, old screen generations and older revisions must never overwrite current UI. Cancellation uses silent AbortError; network/HTTP failures report through onError.

## BGM

- Use the three user-provided MP3 tracks without changing the assignment: source00001.mp3 is menu/general BGM at assets/audio/menu.mp3; source00002.mp3 is battle BGM at assets/audio/battle.mp3. Non-battle screens use the menu track; the battle screen uses the battle track.
- dist/music.js owns playback control; app.js selects the current scene and exposes BGM on/off and volume controls. Audio must not affect card rules, match state or CPU progression.
- Default BGM is ON at50% volume. Root persists bgm and bgmVolume in the v6 browser save. All three tracks loop; scene switches pause the old track and resume the target track at its previous position. Re-rendering the scene must not reset playback. Off pauses; volume0 preserves playback position while muted.
- Attempt normal autoplay while BGM is enabled. If the browser rejects it, retry on the first user click/tap or later permission-granting gesture. Rejected playback promises must not break the application; do not bypass browser autoplay restrictions.
- Pause music while the document is hidden or pagehide fires. On becoming visible, attempt to resume; if still blocked, retry on the next user gesture. Do not play multiple tracks at the same time.

## UI, saves and verification

Main and special deck editors expose separate counts and combined36 validity. Card list filters use seven origins, ordinary models256 each, fusion separately, and miracle/gimmick subtypes128 each. Field cards show attack/守備力 and model labels. Battle panels show remaining special cards, お墓ゾーン and 異世界ゾーン. Opponent special identities may stay hidden. Fusion dialog groups material sources, previews point bonuses and3-ether cost, then confirms the move to 異世界ゾーン; cancel leaves state unchanged.

Root owns v6 save version and migration implementation. Preserve valid compatible decks/settings/stats/collection/treasure, reject invalid exact-size or unowned decks, and avoid fabricating cards in resumed old matches. Catalog tests cover exact totals/subtypes/models/decks and text/value consistency; engine tests cover equal/greater/lower defense, no retaliation, full/difference HP transfer, reflection/support, fusion input atomicity, material movements, conservation and complete CPU games. Shop tests cover1152-card pack membership,12 cards, rarity guarantee, ownership caps, duplicate conversion and rewards. Music tests cover track switching, autoplay rejection and hidden-tab behavior. Online client tests cover bearer isolation, registration concurrency, cancellation, polling and revision/errors; tests/online.test.mjs uses real SQLite via Node24 node:sqlite to verify the API. Browser QA checks responsive layouts and user-facing words, the central battle seat/seven-origin navigation, left/right deck/archive portals, shop and online entry points. Only publish after integration signal; never include temporary QA files.

## Profile, landscape, notices and battle history

- Store local profileOrigin with one of mountain, river, seed, grass, flower, tree, king, default mountain. Offer all seven in that order on entry and settings. Preserve typed names when changing the selection. Authenticated profile updates synchronize nickname and origin; public opponent snapshots include origin, never bearer tokens.
- Smartphones/tablets use landscape. Display a portrait rotation gate; from a user start gesture request fullscreen and screen.orientation.lock('landscape') where available. Handle denial/unsupported APIs without breaking the game, and explain manual rotation. Never claim OS rotation can be forced by an unsupported browser. The app manifest declares landscape.
- UI backgrounds use deep blue/purple consistently. Keep three distinct field motifs and accents, seven origin colours and readable card illustrations.
- The top news ticker moves right to left, offers pause/resume and full text, and respects reduced motion. Notices are maintained in dist/news.js, outside the rerendering game root.
- Public battle log entries preserve {text,type} and add turn. Keep the most recent 1000. Log actual HP/defense changes, card sources and fusion/消滅 outcomes, while keeping unrevealed cards private. Show a desktop right panel and a small-screen drawer; preserve reading scroll when new events arrive.

- Third BGM assets/audio/battle-danger.mp3 is the user upload カードゲームBGM.mp3. In all duel modes, choose battle-danger whenever either player core <= MAX_HEART_POINTS/2 (2500), including equality. Return to normal battle when both recover above2500, and to menu outside the duel. Volume, mute, loop, autoplay fallback and saved playback positions remain shared/exclusive across all three tracks.


## Linked devices and private hand reference

- dist/hand-inspector.js reads only players[0].hand, displays effect text at the left, and allows inspection during the opponent turn. Inspection never sends an action or mutates the match. Online polling must preserve the inspected card identity where still present.
- dist/cloud-sync.js synchronizes validated v6 game data separately from authentication. Revisions use compare-and-swap; offline or concurrent edits require an explicit choice. Keep pending writes and their mutation IDs across lost responses/reloads. Do not replace an active local battle with a remote snapshot.
- Link codes are high-entropy, expire after10 minutes and are single-use. Claiming creates a separate session for the same player. Revocation must also disable an original legacy session without fallback. Never put tokens, link codes, credentials, server roles or online redacted snapshots in game saves/backups.
- Gift/event claims and cloud inventory updates commit atomically with one claim ledger per player. Check recipients, dates, publication status and current save revision server-side; retries cannot duplicate rewards.
- Privileged operations and presence lists require authorization on every server route. Runtime credentials never enter source or client assets. Visible sessions send presence every30 seconds; the server expires them after90 seconds. Recent-login aggregation uses server time and a strict24-hour window, independent of heartbeat renewal. Do not expose player activity lists through public profiles or ordinary account APIs.

## Original card artwork and King origin

- All 1,152 card IDs map to distinct illustrations. B0512 is 王冠竜 レガリア, origin king, ordinary beast, cost 8 (the maximum ordinary-beast cost), GGR. Preserve its defense model, 700 ATK, 900 DEF, drain keyword and physical ID so saved collections stay compatible.
- Rarity finishing is clipped to artwork only: N quiet, R moving satin, KR animated sparkles, KKR moving gold sweep, GR animated iridescence, GGR royal iridescence and breathing crown. Apply it to card grids, hands and revealed field/arcana cards, while hidden opponent cards remain hidden. Reduced-motion settings disable movement.
- Atlas cells use a 1% safety inset. Nonuniform atlases use measured boundaries in layouts.json and generated card-art-layouts.js, shared by browser rendering and owner material export. Keep the portable owner gallery outside the public frontend.
- Copyright text is © 2026 Beast King.
- Discourage native artwork save/drag/long-press and accidental selection/zoom while preserving form editing and the hidden seven-click operator gesture. Browser screenshots and external browser/OS controls cannot be prevented.
- The additive origin_v2 column supports king without rebuilding or deleting existing profile rows. Reads use origin_v2 with legacy origin fallback; all profile writes keep the legacy column valid.
