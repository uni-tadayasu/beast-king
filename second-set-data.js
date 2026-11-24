/** Authored species and scene direction for BK02「王源の継承」.
 * No balance values or unlock entitlements live in this visual metadata. */
const freezeRows = rows => Object.freeze(rows.map(row => typeof row === 'object' ? Object.freeze(Object.fromEntries(Object.entries(row).map(([key,value]) => [key,Array.isArray(value) ? Object.freeze(value) : value]))) : row));

export const SECOND_SET_CLANS = freezeRows([
  {
    "id": "royal",
    "name": "王統",
    "origin": "king",
    "balanceSeries": "aether",
    "epithets": [
      "誓印",
      "錦旗",
      "宝璽",
      "王暦",
      "戴輪",
      "玉座",
      "帝礼",
      "創王"
    ],
    "roots": [
      "アウル",
      "レゼ",
      "ディル",
      "ソル",
      "カイ",
      "ゼル",
      "ヴェル",
      "オルド"
    ],
    "lore": "支配の証ではない。王を支える者たちが、継承の道を開く。",
    "material": "brushed gold and dark lacquer, garnet inlays and real flesh or chitin; ornamental details follow the anatomy",
    "motif": "oath seals, hanging royal banners, interlocking crown fragments",
    "miracles": [
      "勅光の一矢",
      "継承者の慈雨",
      "王統の系譜",
      "臣従の誓環",
      "宝玉の砕雨",
      "玉座の庇護",
      "血盟の杯",
      "盟友の帰還"
    ],
    "gimmicks": [
      "王璽の返刃",
      "戴冠の鏡門",
      "近衛の進軍鐘",
      "王庭の癒泉"
    ],
    "fusionTitles": [
      "誓統",
      "双璽",
      "六冠",
      "創世"
    ]
  },
  {
    "id": "strata",
    "name": "深岳",
    "origin": "mountain",
    "balanceSeries": "stone",
    "epithets": [
      "層鳴",
      "断崖",
      "硫礫",
      "鉄稜",
      "砕峰",
      "玄岳",
      "巨巌",
      "地殻"
    ],
    "roots": [
      "ドルン",
      "バルク",
      "ガダ",
      "テクト",
      "オベ",
      "ケルン",
      "モルド",
      "ラグ"
    ],
    "lore": "地の底で結ばれた誓約は、王冠よりも古い。",
    "material": "layered basalt, pale chalk and veins of native copper; rugged unpolished weight",
    "motif": "fault lines, fossil imprints, broken monoliths and geological strata",
    "miracles": [
      "断層の楔",
      "鉱母の温泉",
      "岩盤の年代記",
      "重石の加護",
      "峰崩れ",
      "褶曲の囲壁",
      "鉱血の盟約",
      "地根の再生"
    ],
    "gimmicks": [
      "崩壁の反響罠",
      "断崖の遮断盤",
      "山裾の鼓動杭",
      "晶洞の滴水槽"
    ],
    "fusionTitles": [
      "複層",
      "環岳",
      "断界",
      "原巌"
    ]
  },
  {
    "id": "delta",
    "name": "環流",
    "origin": "river",
    "balanceSeries": "tide",
    "epithets": [
      "滴紋",
      "葦瀬",
      "流紋",
      "峡流",
      "潟鏡",
      "逆瀑",
      "環河",
      "源海"
    ],
    "roots": [
      "ニレ",
      "スィル",
      "ラグナ",
      "セト",
      "イオ",
      "ムル",
      "デル",
      "パル"
    ],
    "lore": "川は王国の境を知らない。すべての約束を、次の岸へ運ぶ。",
    "material": "wet jade, translucent amber membranes and dark river stones; no universal blue recoloring",
    "motif": "braided river channels, reed shadows, ripples and floating pollen",
    "miracles": [
      "水圧の穿槍",
      "支流の抱擁",
      "伏流の記憶図",
      "分水の盟輪",
      "奔流の飛礫",
      "水門の守り",
      "潮目の交換",
      "澄流の洗礼"
    ],
    "gimmicks": [
      "渦底の逆針",
      "伏瀬の流壁",
      "水車の鼓舞環",
      "河畔の薬水庭"
    ],
    "fusionTitles": [
      "合流",
      "交河",
      "大環",
      "源流"
    ]
  },
  {
    "id": "kernel",
    "name": "胚焔",
    "origin": "seed",
    "balanceSeries": "ember",
    "epithets": [
      "胚火",
      "裂莢",
      "焦芽",
      "熾核",
      "噴種",
      "燔果",
      "業胚",
      "原種"
    ],
    "roots": [
      "ザク",
      "ボロ",
      "ネク",
      "オム",
      "ラバ",
      "セグ",
      "ドゥル",
      "エグ"
    ],
    "lore": "焼けた土にも種は残る。小さな胚に、王国の明日が眠る。",
    "material": "charred seed shells, glowing orange resin, blackened red clay and living embryonic tissue",
    "motif": "split seed pods, erupting spores, ash and germination spirals",
    "miracles": [
      "発芽の爆圧",
      "種守の余熱",
      "胚盤の予見",
      "裂果の盟芽",
      "種火の散弾",
      "果殻の護り",
      "焦土の収穫",
      "休眠の目覚め"
    ],
    "gimmicks": [
      "爆莢の返弾",
      "硬種の盾層",
      "催芽の脈動床",
      "灰床の培養槽"
    ],
    "fusionTitles": [
      "連胚",
      "双核",
      "万種",
      "始原"
    ]
  },
  {
    "id": "steppe",
    "name": "草航",
    "origin": "grass",
    "balanceSeries": "gale",
    "epithets": [
      "露走",
      "茅刃",
      "薄野",
      "飛穂",
      "荒穫",
      "草津波",
      "大穹",
      "天原"
    ],
    "roots": [
      "ハル",
      "セイ",
      "トゥラ",
      "サク",
      "フェン",
      "ロカ",
      "ヤル",
      "ゼフ"
    ],
    "lore": "踏まれても折れない草が、最初に新しい道を描く。",
    "material": "straw fiber, braided green blades, weathered bone and taut translucent membranes",
    "motif": "rolling grass waves, airborne seed awns, wind-cut contours and nomadic pennants",
    "miracles": [
      "葉刃の斜線",
      "草露の恵み",
      "風向きの手記",
      "穂先の決起",
      "刈風の奔流",
      "草垣の包み",
      "根分けの契約",
      "二番芽の息吹"
    ],
    "gimmicks": [
      "葦刃の跳ね返し",
      "草舟の風除け",
      "渡原の行進笛",
      "朝露の集水葉"
    ],
    "fusionTitles": [
      "連穂",
      "交野",
      "千原",
      "天穣"
    ]
  },
  {
    "id": "calyx",
    "name": "花灯",
    "origin": "flower",
    "balanceSeries": "dawn",
    "epithets": [
      "蕾滴",
      "咲紐",
      "萼玉",
      "蜜房",
      "彩葩",
      "香冠",
      "万華",
      "天花"
    ],
    "roots": [
      "ネム",
      "セラ",
      "ポラ",
      "シベ",
      "アネ",
      "カロ",
      "フィズ",
      "ナフ"
    ],
    "lore": "咲くことは戦わないことではない。花は約束を守るために開く。",
    "material": "velvet petals, pollen-dusted chitin, dark indigo stems and opalescent nectar",
    "motif": "oversized anthers, tubular corollas, fragrant mist and nocturnal bloom patterns",
    "miracles": [
      "雄蕊の光針",
      "花蜜の滋養",
      "花暦の予報",
      "蕾結びの誓約",
      "散華の奔雨",
      "萼杯の抱擁",
      "蜜約の交換",
      "花床の復活"
    ],
    "gimmicks": [
      "刺蕊の返し網",
      "重萼の防花壁",
      "開花の拍子鐘",
      "蜜壺の療養床"
    ],
    "fusionTitles": [
      "双咲",
      "重萼",
      "百華",
      "極芳"
    ]
  },
  {
    "id": "heartwood",
    "name": "樹憶",
    "origin": "tree",
    "balanceSeries": "grove",
    "epithets": [
      "皮脈",
      "節枝",
      "琥珀",
      "樹洞",
      "重梢",
      "古根",
      "万幹",
      "始樹"
    ],
    "roots": [
      "ウル",
      "ロム",
      "タル",
      "メル",
      "ノル",
      "バン",
      "ユグ",
      "ドロ"
    ],
    "lore": "冠を替えた歴代の王を、一本の木が見守り続けている。",
    "material": "rough bark, pale heartwood, green patinated bronze and suspended amber droplets",
    "motif": "branching vascular channels, root buttresses, growth scars and remembered rings",
    "miracles": [
      "樹脂の穿弾",
      "心材の養分",
      "枝分かれの記録",
      "根絡みの同盟",
      "折枝の豪雨",
      "樹皮の囲い",
      "樹液の契り",
      "萌芽の還流"
    ],
    "gimmicks": [
      "撥枝の弾き罠",
      "板根の垣根",
      "年輪の成長鼓",
      "樹洞の薬壺"
    ],
    "fusionTitles": [
      "交根",
      "重幹",
      "連樹",
      "始森"
    ]
  },
  {
    "id": "eclipse",
    "name": "蝕王",
    "origin": "king",
    "balanceSeries": "dusk",
    "epithets": [
      "欠月",
      "冥印",
      "虚冠",
      "黒曜",
      "陰璽",
      "蝕座",
      "無明",
      "終王"
    ],
    "roots": [
      "ネゼ",
      "ザル",
      "キル",
      "ヴォ",
      "モル",
      "シグ",
      "アズ",
      "ロゼ"
    ],
    "lore": "失われた冠にも誓いは宿る。影の王統が、継承の意味を問い直す。",
    "material": "matte obsidian, tarnished silver, crimson vitreous enamel and dim violet internal light",
    "motif": "broken coronets, eclipsed discs, reverse shadows and suspended iron chains",
    "miracles": [
      "冥令の裂線",
      "欠冠の赦し",
      "失王の書簡",
      "影臣の誓紋",
      "蝕光の崩雨",
      "空位の守幕",
      "黒杯の誓約",
      "忘却の還命"
    ],
    "gimmicks": [
      "逆璽の仕返し",
      "黒冠の反転鏡",
      "影列の行軍燭",
      "無月の浄水盤"
    ],
    "fusionTitles": [
      "欠統",
      "双蝕",
      "無冠",
      "終極"
    ]
  }
]);

export const SECOND_SET_CREATURES = freezeRows([
  {
    "title": "冠甲虫",
    "species": "crowned rhinoceros beetle",
    "anatomy": "six jointed legs, split wing cases, towering forked horn"
  },
  {
    "title": "輪脚蜘蛛",
    "species": "wheel-legged orb spider",
    "anatomy": "eight exceptionally long bowed legs surrounding a small suspended abdomen"
  },
  {
    "title": "鎌腕蟷螂",
    "species": "praying mantis",
    "anatomy": "two serrated scythe forearms, narrow upright thorax, folding fan wings"
  },
  {
    "title": "鎖尾蠍",
    "species": "whip-tailed scorpion",
    "anatomy": "broad low pincers, articulated chainlike tail curved over its back"
  },
  {
    "title": "灯腹蛍",
    "species": "lantern firefly",
    "anatomy": "round luminous abdomen, four translucent wing blades, tiny gripping forelegs"
  },
  {
    "title": "帆翅蝉",
    "species": "sail-winged cicada",
    "anatomy": "four oversized pleated wings, low wedge head, barrel thorax"
  },
  {
    "title": "潜砂蟻地獄",
    "species": "antlion larva",
    "anatomy": "flattened shovel-shaped body, outsized hollow jaws, no wings"
  },
  {
    "title": "百足百眼",
    "species": "many-eyed centipede",
    "anatomy": "ribbon-long segmented body, dozens of legs and eye-bearing side plates"
  },
  {
    "title": "螺殻鸚鵡貝",
    "species": "nautilus",
    "anatomy": "upright spiral shell, flowing tentacle crown, single visible pupil"
  },
  {
    "title": "鎧蝦蛄",
    "species": "mantis shrimp",
    "anatomy": "arched segmented armor, two club fists, independently raised stalk eyes"
  },
  {
    "title": "鋸吻鮫",
    "species": "sawfish",
    "anatomy": "broad horizontal ray body, long serrated rostrum, sweeping pectoral fins"
  },
  {
    "title": "鎚頭鮫",
    "species": "hammerhead shark",
    "anatomy": "wide T-shaped sensory head, muscular crescent tail, sharply swept dorsal fin"
  },
  {
    "title": "月帆鰩",
    "species": "moon-sail ray",
    "anatomy": "diamond flat body, upcurved wing fins, very long filament tail"
  },
  {
    "title": "提灯鮟鱇",
    "species": "deep-sea anglerfish",
    "anatomy": "enormous toothed mouth, spherical trunk, dangling bioluminescent lure"
  },
  {
    "title": "透骨鰻",
    "species": "glass eel",
    "anatomy": "nearly transparent long eel, exposed luminous spine, tiny fins and needle snout"
  },
  {
    "title": "鉄顎鱓",
    "species": "armored moray",
    "anatomy": "thick muscular neck, double jaws, continuous jagged dorsal ribbon"
  },
  {
    "title": "鐘傘海月",
    "species": "bell jellyfish",
    "anatomy": "high domed bell, four thick oral arms, skirt of fine trailing tentacles"
  },
  {
    "title": "八腕蛸",
    "species": "octopus",
    "anatomy": "bulbous mantle, eight separately posed arms, visible suction cups"
  },
  {
    "title": "十腕烏賊",
    "species": "cuttlefish",
    "anatomy": "broad oval mantle, rippling lateral fins, two extended feeding tentacles"
  },
  {
    "title": "双殻巨貝",
    "species": "giant bivalve",
    "anatomy": "two enormous ribbed valves, muscular foot, luminous fleshy mantle"
  },
  {
    "title": "節環海星",
    "species": "basket star",
    "anatomy": "small central disk, five repeatedly branching articulated arms"
  },
  {
    "title": "硝子海百合",
    "species": "feather star",
    "anatomy": "slender stalk-like center, radial feathered feeding arms, gripping cirri"
  },
  {
    "title": "棘冠海胆",
    "species": "crowned sea urchin",
    "anatomy": "round armored globe, extremely long uneven spines, short tube feet"
  },
  {
    "title": "葉鰓海蛞蝓",
    "species": "leaf-gilled sea slug",
    "anatomy": "soft low foot, two sensory rhinophores, elaborate leaflike dorsal gills"
  },
  {
    "title": "槌尾甲竜",
    "species": "ankylosaur",
    "anatomy": "low quadruped armored body, small head, huge blunt tail club"
  },
  {
    "title": "背帆竜",
    "species": "sail-backed synapsid",
    "anatomy": "four splayed limbs, long toothy jaw, towering rib-supported back sail"
  },
  {
    "title": "襟角竜",
    "species": "frilled ceratopsian",
    "anatomy": "massive horned beak, broad shieldlike frill, short heavy quadruped body"
  },
  {
    "title": "翼指竜",
    "species": "pterosaur",
    "anatomy": "long toothed beak, crest, membranous wings supported by single elongated fingers"
  },
  {
    "title": "長頸竜",
    "species": "long-necked marine reptile",
    "anatomy": "four flippers, compact barrel body, serpentine neck and small head"
  },
  {
    "title": "三趾疾竜",
    "species": "runner dinosaur",
    "anatomy": "lean biped, three-clawed feet, balancing horizontal tail, narrow snout"
  },
  {
    "title": "盤角蜥蜴",
    "species": "horned desert lizard",
    "anatomy": "very flat wide body, crown of small head horns, spiny flanks"
  },
  {
    "title": "膜翼壁虎",
    "species": "gliding gecko",
    "anatomy": "broad adhesive toe pads, scalloped skin sails, flattened paddle tail"
  },
  {
    "title": "鎧背犰狳",
    "species": "armadillo",
    "anatomy": "domed articulated armor bands, tapered snout, digging claws"
  },
  {
    "title": "長鼻貘",
    "species": "tapir",
    "anatomy": "short flexible trunk, barrel body, rounded ears, stout four-toed feet"
  },
  {
    "title": "巨角羚羊",
    "species": "spiral-horned antelope",
    "anatomy": "slender long legs, two vast corkscrew horns, sharp shoulder ridge"
  },
  {
    "title": "鏟角麋鹿",
    "species": "palm-antlered elk",
    "anatomy": "broad branching shovel antlers, long-legged heavy body, hanging throat beard"
  },
  {
    "title": "長吻食蟻獣",
    "species": "giant anteater",
    "anatomy": "very long tubular snout, huge hooked foreclaws, flowing flag tail"
  },
  {
    "title": "鎌爪樹懶",
    "species": "giant ground sloth",
    "anatomy": "upright bulky body, three immense curved claws, heavy balancing tail"
  },
  {
    "title": "双牙海象",
    "species": "walrus",
    "anatomy": "two long downward tusks, broad whiskered muzzle, massive wrinkled flippered body"
  },
  {
    "title": "棘毛豪猪",
    "species": "porcupine",
    "anatomy": "hunched compact body, dramatic fan of long banded quills, short muzzle"
  },
  {
    "title": "袋翼鼯鼠",
    "species": "flying squirrel",
    "anatomy": "wide membrane between wrists and ankles, flattened furry tail, small round head"
  },
  {
    "title": "鱗皮穿山甲",
    "species": "pangolin",
    "anatomy": "overlapping pointed scales, long tapered tail, curled digging foreclaws"
  },
  {
    "title": "冠喉鶴",
    "species": "crane",
    "anatomy": "very long thin legs and neck, tall feather crown, pointed beak"
  },
  {
    "title": "重嘴犀鳥",
    "species": "hornbill",
    "anatomy": "huge curved beak topped by a hollow casque, broad black wings"
  },
  {
    "title": "鐮嘴朱鷺",
    "species": "ibis",
    "anatomy": "long downward curved bill, arched neck, spread fan tail"
  },
  {
    "title": "鏟嘴鵜",
    "species": "pelican",
    "anatomy": "vast hanging throat pouch, long flat bill, broad low-spread wings"
  },
  {
    "title": "鼓喉軍艦鳥",
    "species": "frigatebird",
    "anatomy": "long angular wings, deeply forked tail, inflated round throat sac"
  },
  {
    "title": "刃羽蛇鷲",
    "species": "secretary bird",
    "anatomy": "long bare stalking legs, hooked beak, spray of backward head quills"
  },
  {
    "title": "蓑尾極楽鳥",
    "species": "bird of paradise",
    "anatomy": "small compact torso, cascading ornamental flank plumes, curled ribbon tail"
  },
  {
    "title": "楔尾風切",
    "species": "swift",
    "anatomy": "tiny body, extremely long crescent wings, short forked tail"
  },
  {
    "title": "環盤機兵",
    "species": "ring-bodied automaton",
    "anatomy": "empty levitating circular torso, four separated tool arms, single suspended eye"
  },
  {
    "title": "鼎脚炉獣",
    "species": "tripod furnace construct",
    "anatomy": "three heavy pillar legs, open furnace belly, swiveling chimney neck"
  },
  {
    "title": "浮石多面獣",
    "species": "floating polyhedral golem",
    "anatomy": "cluster of disconnected angular blocks, enormous uneven stone fists, no continuous body"
  },
  {
    "title": "水銀流体獣",
    "species": "liquid-metal organism",
    "anatomy": "shapeshifting low fluid mass, solid blade crest, many droplet satellites"
  },
  {
    "title": "硝管絡繰",
    "species": "glass-pipe automaton",
    "anatomy": "exposed branching glass tubes, piston ribs, delicate four-jointed limbs"
  },
  {
    "title": "鎖骨操兵",
    "species": "chain-linked puppet",
    "anatomy": "skeletal body joined by dangling chains, asymmetric huge hand, tiny masklike head"
  },
  {
    "title": "傘茸歩兵",
    "species": "walking parasol fungus",
    "anatomy": "broad layered mushroom cap, hollow stalk torso, thin rootlike walking feet"
  },
  {
    "title": "盃苔巨人",
    "species": "cup-lichen giant",
    "anatomy": "branching upright lichen body, many chalice-shaped growths, uneven root legs"
  },
  {
    "title": "捕虫嚢獣",
    "species": "pitcher-plant predator",
    "anatomy": "large hanging liquid-filled pitchers, hooked climbing vines, fleshy toothed lids"
  },
  {
    "title": "歯葉食獣",
    "species": "flytrap plant beast",
    "anatomy": "paired hinged toothed leaf jaws, low creeping root mat, multiple leaf arms"
  },
  {
    "title": "種鞘跳獣",
    "species": "seedpod hopper",
    "anatomy": "two giant folded jumping hindlegs, hard split seed husk torso, antenna-like stamens"
  },
  {
    "title": "冠根球獣",
    "species": "bulb-root creature",
    "anatomy": "large round underground bulb, tangled mobile roots, a tall spiraling flower stalk"
  },
  {
    "title": "紙翼折獣",
    "species": "origami-like living creature",
    "anatomy": "sharp folded planar anatomy, fanlike asymmetric wings, hollow geometric head"
  },
  {
    "title": "砂時計幻獣",
    "species": "hourglass spirit",
    "anatomy": "two opposing transparent cones, suspended head and claws, flowing grains forming its lower body"
  }
]);

export const SECOND_SET_PALETTES = freezeRows([
  "black, antique gold and hot vermilion",
  "bright ivory, leaf green and dark umber",
  "burnt orange, charcoal and turquoise accents",
  "deep violet, amber and pale silver",
  "warm terracotta, bone and clear cobalt accents",
  "emerald, near-black and acid yellow",
  "burgundy, pale rose and old brass",
  "cold slate, white and saturated scarlet",
  "sand gold, aubergine and mint accents",
  "dark navy, copper and bright peach",
  "ochre, black olive and cream",
  "crimson, ash gray and luminous cyan accents",
  "moss green, lilac shadow and glowing orange",
  "plum black, porcelain white and jade",
  "copper red, pale limestone and ultramarine",
  "chartreuse, dark brown and magenta sparks"
]);

export const SECOND_SET_ENVIRONMENTS = freezeRows([
  "sunlit stepped canyon seen from below",
  "rain-swept ruined causeway at night",
  "vast pale salt flat beneath hard noon shadows",
  "claustrophobic amber-lit underground chamber",
  "scarlet storm front over jagged black terrain",
  "misty reed delta at first light",
  "shadowed vertical garden with shafts of warm light",
  "windswept high plateau under a bright cloud sky",
  "abandoned ceremonial courtyard filled with dust",
  "submerged mineral cavern illuminated from above",
  "snow-swept dark ridgeline at sunset",
  "dense root labyrinth around a warm glowing spring",
  "moonlit volcanic beach with foaming surf",
  "bright field of golden grasses and broken standing stones",
  "hanging bridges above a huge green gorge",
  "open ruined observatory under violet twilight"
]);

export const SECOND_SET_COMPOSITIONS = freezeRows([
  "extreme low-angle close approach; body fills the diagonal",
  "wide environmental shot; small creature against monumental scale",
  "side profile in mid-leap with a sharply readable silhouette",
  "top-down view showing radial or segmented anatomy",
  "three-quarter rear view turning the head toward the viewer",
  "frontal foreshortening with a strong central mass and asymmetric limbs",
  "close macro portrait emphasizing one distinctive organ",
  "long-lens layered view framed by foreground obstacles",
  "spiraling motion across the image with displaced debris",
  "quiet resting pose on a sharply isolated perch",
  "steep high-angle view of a creature climbing toward the camera",
  "underwater or airborne suspended pose with limbs widely separated",
  "ground-level sprint toward the edge of the composition",
  "curled defensive posture against a broad open background",
  "emerging through a broken surface, half the body still concealed",
  "full-body encounter at eye level with dramatic sidelight"
]);

export const SECOND_SET_FORMS = freezeRows([
  "a crownlike sensory organ grown from its own body, not a worn human crown",
  "asymmetric enlarged forelimbs and an unusually compact rear body",
  "elongated sensory appendages and thin ribbonlike secondary fins",
  "a heavy layered carapace split open around a softly glowing interior",
  "hollow porous body sections with natural bridges and arches",
  "one enormous protective dorsal plate above a tiny mobile head",
  "branching external gills or antennae clearly separate from the limbs",
  "translucent juvenile-sized body contrasted with one colossal tail or appendage"
]);

export const SECOND_SET_NAME_SUFFIXES = freezeRows([
  "ーン",
  "ギア",
  "セト",
  "ディア",
  "ヴァン",
  "ネア",
  "ラス",
  "オン"
]);

const idFor = (prefix, ordinal) => `${prefix}${String(ordinal).padStart(4, '0')}`;
const spellSubjects = [
  'a concentrated spear of force striking a jagged target, clearly directional impact',
  'a healing source restoring cracked organic tissue through warm streams of light',
  'an unfolding three-dimensional memory archive with blank geometric tablets and branching light paths',
  'a visible oath binding several living limbs through a luminous woven ring',
  'a sweeping storm of many physical shards crossing a wide battlefield',
  'a large protective enclosure wrapped around a vulnerable living heart of light',
  'two vessels exchanging opposite currents of life force through an arcing siphon',
  'damaged plants and armor visibly regrowing around an old remnant',
];
const deviceSubjects = [
  'a concealed mechanical counterattack trap with sprung blades aimed back toward an incoming strike',
  'an enormous angled reflector shield turning an incoming beam back into the distance',
  'an active battlefield support mechanism transmitting visible strengthening pulses through the ground',
  'a carefully built restorative reservoir feeding healing fluid through several branching conduits',
];
function brief(clan, local, species, anatomy, type) {
  const e = SECOND_SET_CLANS.indexOf(clan);
  return Object.freeze({
    species,
    anatomy,
    transformation: SECOND_SET_FORMS[(Math.floor(local / 8) + e * 3) % SECOND_SET_FORMS.length],
    material: clan.material,
    motif: clan.motif,
    palette: SECOND_SET_PALETTES[(local * 7 + e * 3) % SECOND_SET_PALETTES.length],
    environment: SECOND_SET_ENVIRONMENTS[(local * 5 + e * 7 + (type === 'gimmick' ? 3 : type === 'miracle' ? 9 : 0)) % SECOND_SET_ENVIRONMENTS.length],
    composition: SECOND_SET_COMPOSITIONS[(local * 11 + e * 5 + (type === 'fusion' ? 7 : 0)) % SECOND_SET_COMPOSITIONS.length],
  });
}
const properName = (clan, local) => `${clan.roots[local % 8]}${SECOND_SET_NAME_SUFFIXES[Math.floor(local / 8) % 8]}`;

/** Index 0–510: B0513–B1023. B0512 keeps its existing Regalia identity. */
export function secondBeastDefinition(index) {
  const e = Math.floor(index / 64), local = index % 64, tier = Math.floor(local / 8);
  const clan = SECOND_SET_CLANS[e], creature = SECOND_SET_CREATURES[(local * 17 + e * 11) % 64];
  return Object.freeze({
    id: idFor('B', 513 + index), name: `${clan.epithets[tier]}${creature.title} ${properName(clan, local)}`,
    type: 'beast', setId: 'BK02', series: clan.id, origin: clan.origin,
    artBrief: brief(clan, local, creature.species, creature.anatomy, 'beast'),
  });
}

/** Index 0–255: M0257–M0512. The second set includes its own fusion spell. */
export function secondMiracleDefinition(index) {
  const e = Math.floor(index / 32), local = index % 32, rank = Math.floor(local / 8), kind = local % 8;
  const clan = SECOND_SET_CLANS[e], fusion = index === 255;
  return Object.freeze({
    id: idFor('M', 257 + index), name: fusion ? '王源合成' : `${clan.epithets[rank * 2]}の${clan.miracles[kind]}`,
    type: 'miracle', setId: 'BK02', series: clan.id, origin: clan.origin,
    artBrief: brief(clan, local, fusion ? 'a royal fusion ritual' : spellSubjects[kind], fusion ? 'several physically different beasts dissolve into interlocking crown fragments; one new immense hybrid emerges from their convergence, no letters or symbols resembling text' : `the ${clan.name} motif made into a visible magical event; ${['intimate focused action','expanding two-part composition','monumental cascading action','vast climactic phenomenon'][rank]}; no readable text or floating card interfaces`, 'miracle'),
  });
}

/** Index 0–255: G0257–G0512. */
export function secondGimmickDefinition(index) {
  const e = Math.floor(index / 32), local = index % 32, rank = Math.floor(local / 4), kind = local % 4;
  const clan = SECOND_SET_CLANS[e];
  return Object.freeze({
    id: idFor('G', 257 + index), name: `${clan.epithets[rank]}の${clan.gimmicks[kind]}`,
    type: 'gimmick', setId: 'BK02', series: clan.id, origin: clan.origin,
    artBrief: brief(clan, local, deviceSubjects[kind], `${['compact hinged portable object','long suspended chain apparatus','radial floor mechanism','vertical multi-level tower','folding segmented field engine','deep excavated multi-part installation','levitating architectural machine','landscape-sized ancient construction'][rank]}; readable physical cause and effect; constructed from the faction material, no text`, 'gimmick'),
  });
}

/** Index 0–127: F0129–F0256; every recipe combines two distinct body plans. */
export function secondFusionDefinition(index) {
  const e = Math.floor(index / 16), local = index % 16, rank = Math.floor(local / 4);
  const clan = SECOND_SET_CLANS[e];
  const a = SECOND_SET_CREATURES[(local * 7 + e * 3) % 64];
  const b = SECOND_SET_CREATURES[(local * 11 + e * 9 + 19) % 64];
  const title = `${clan.fusionTitles[rank]}${a.title.slice(0, 2)}${b.title.slice(-2)}`;
  return Object.freeze({
    id: idFor('F', 129 + index), name: `${title} ${properName(clan, local + 32)}`,
    type: 'fusion', setId: 'BK02', series: clan.id, origin: clan.origin,
    artBrief: brief(clan, local + 32, `one coherent chimera combining ${a.species} with ${b.species}`, `primary structure: ${a.anatomy}; integrated secondary structure: ${b.anatomy}; combine into one plausible and unmistakable full silhouette, not two animals next to each other`, 'fusion'),
  });
}
