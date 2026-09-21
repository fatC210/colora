/**
 * 首页配色墙（`src/lib/colora-palettes.ts`）的英文词条：120 条方案名 + 10 条标签名。
 *
 * ⚠️ 与 `en.canvas.ts` 同样的两条约束：
 * 1. **不要重复定义 `en.ts` core 里已有的 key**（跨文件重复不会报错，会静默覆盖）。
 * 2. **保持单个对象字面量，不要加 `: Record<string, string>` 注解** ——
 *    那会把字面量 key 类型擦成 `string`，让 `TKey` 失去检查能力。
 *
 * 改完跑 `node check-i18n.cjs` 与 `node scripts/check-palettes.mjs`。
 */
export const palettes = {
  // ─────────────────────────── 标签 ───────────────────────────
  自然: "Nature",
  日落: "Sunset",
  柔和: "Pastel",
  复古: "Retro",
  // 「霓虹」刻意不在这里定义：`en.canvas.ts` 的画笔名里已经有一条 `霓虹: "Neon"`，
  // 跨文件重复 key 不会报错、只会静默覆盖，所以这里留空由那条兜底（`check-i18n.cjs` 会查）。
  大地: "Earth",
  海洋: "Ocean",
  极简: "Minimal",
  都市: "Urban",
  夜行: "Night",

  // ─────────────────────────── 自然 ───────────────────────────
  苔原清晨: "Tundra Morning",
  松针与雾: "Pine Needle Mist",
  野草地: "Wild Meadow",
  雨后林间: "After the Rain",
  蕨叶与石: "Fern and Stone",
  春日新芽: "Spring Buds",
  沼泽晨雾: "Marsh Mist",
  高原草甸: "Highland Meadow",
  林中空地: "Forest Clearing",
  常青藤: "Ivy",
  竹影: "Bamboo Shade",
  野莓丛: "Wild Berries",

  // ─────────────────────────── 日落 ───────────────────────────
  熔金天际: "Molten Sky",
  落日熔岩: "Sunset Lava",
  沙丘晚照: "Dune Afterglow",
  暮色港湾: "Dusk Harbor",
  火烧云: "Burning Clouds",
  黄昏麦田: "Golden Wheat Dusk",
  落日余温: "Lingering Warmth",
  珊瑚晚霞: "Coral Dusk",
  赤道黄昏: "Equator Dusk",
  铜色黄昏: "Copper Dusk",
  暮云熔铜: "Molten Copper Cloud",
  长日将尽: "Day's End",

  // ─────────────────────────── 柔和 ───────────────────────────
  棉花糖: "Cotton Candy",
  薄荷奶昔: "Mint Shake",
  淡紫晨雾: "Lilac Haze",
  桃色信笺: "Peach Letter",
  海盐苏打: "Sea Salt Soda",
  樱花微光: "Cherry Blossom Glow",
  奶油薄荷: "Cream Mint",
  云朵蓝: "Cloud Blue",
  蜜桃气泡: "Peach Fizz",
  淡藕荷: "Lotus Mist",
  青柠冰沙: "Lime Smoothie",
  雾感薰衣草: "Misty Lavender",

  // ─────────────────────────── 复古 ───────────────────────────
  老唱片: "Old Vinyl",
  芥末时代: "Mustard Era",
  砖红标语: "Brick Slogan",
  橄榄绿厨房: "Olive Kitchen",
  复古泳池: "Retro Pool",
  铁锈与奶: "Rust and Cream",
  橙皮汽水: "Orange Soda",
  旧海报: "Old Poster",
  芥末与砖: "Mustard and Brick",
  复古绿皮车: "Retro Railcar",
  陶土与赭: "Terracotta and Ochre",
  七十年代客厅: "Seventies Living Room",

  // ─────────────────────────── 霓虹 ───────────────────────────
  赛博招牌: "Cyber Sign",
  电子午夜: "Electric Midnight",
  酸性绿光: "Acid Green",
  霓虹粉巷: "Neon Pink Alley",
  电光蓝调: "Electric Blues",
  午夜霓虹: "Midnight Neon",
  荧光涂鸦: "Fluorescent Graffiti",
  电子紫: "Electric Violet",
  霓虹棕榈: "Neon Palm",
  深夜游戏厅: "Late Night Arcade",
  激光柠檬: "Laser Lemon",
  紫外光晕: "Ultraviolet Halo",

  // ─────────────────────────── 大地 ───────────────────────────
  陶土原色: "Raw Terracotta",
  黏土与沙: "Clay and Sand",
  赭石高原: "Ochre Plateau",
  岩石与苔: "Rock and Moss",
  赤陶砖: "Terracotta Tile",
  沙丘: "Sand Dune",
  深棕皮革: "Dark Leather",
  火山岩: "Volcanic Rock",
  干草与泥: "Hay and Mud",
  栗色山脊: "Chestnut Ridge",
  砂岩层: "Sandstone Strata",
  土陶与灰: "Clay and Ash",

  // ─────────────────────────── 海洋 ───────────────────────────
  深海航线: "Deep Sea Route",
  浅滩: "Shallows",
  潮汐: "Tide",
  珊瑚礁: "Coral Reef",
  远洋: "Open Ocean",
  浪花白: "Breaking Wave",
  冰川湾: "Glacier Bay",
  深海蓝鲸: "Blue Whale",
  潮间带: "Intertidal",
  午夜海面: "Midnight Sea",
  蓝绿泻湖: "Turquoise Lagoon",
  港口晨雾: "Harbor Mist",

  // ─────────────────────────── 极简 ───────────────────────────
  素纸: "Plain Paper",
  象牙与墨: "Ivory and Ink",
  冷灰阶: "Cool Grays",
  玫瑰灰: "Rose Gray",
  单点靛蓝: "Single Indigo",
  石墨黑: "Graphite",
  米白与陶: "Cream and Clay",
  灰阶加赭: "Gray with Ochre",
  极简青灰: "Teal Gray",
  冷白与藏青: "Cold White and Navy",
  米色书房: "Beige Study",
  灰白与橄榄: "Gray and Olive",

  // ─────────────────────────── 都市 ───────────────────────────
  混凝土与信号黄: "Concrete and Signal Yellow",
  地铁瓷砖: "Subway Tile",
  沥青与霓虹橙: "Asphalt and Neon Orange",
  玻璃幕墙: "Glass Facade",
  锈铁与蓝: "Rust and Blue",
  涂鸦紫: "Graffiti Violet",
  水泥与砖: "Cement and Brick",
  信号红: "Signal Red",
  都市苔绿: "Urban Moss",
  高架桥下: "Under the Overpass",
  钢与青: "Steel and Teal",
  夜色招牌: "Night Signage",

  // ─────────────────────────── 夜行 ───────────────────────────
  午夜蓝调: "Midnight Blues",
  深空紫: "Deep Space Violet",
  午夜森林: "Midnight Forest",
  夜航: "Night Flight",
  暗夜石板: "Dark Slate",
  深靛: "Deep Indigo",
  午夜酒红: "Midnight Wine",
  夜雾灰: "Night Fog",
  深潭: "Deep Pool",
  夜行霓蓝: "Night Neon Blue",
  暗紫罗兰: "Dark Violet",
  午夜墨绿: "Midnight Pine",
};
