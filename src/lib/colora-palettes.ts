import type { TKey } from "./i18n";

/**
 * 首页配色墙的配色方案库。
 *
 * 全部手工设计，按 10 个标签各 12 组铺开。**每个标签下先定一条用色规则再逐组设计** ——
 * 否则 120 组摆在一起会「一看就是按色系排的」（`color-duos.ts` 的注释里记过这个坑）。
 * 各标签的规则：
 *
 * - 自然：绿为主，混土壤棕 / 天空蓝 / 花点缀，组内保证深-中-浅三段
 * - 日落：暖色梯度，橙红紫为主，常以一个近白暖色或深色收尾
 * - 柔和：高明度低饱和，白 / 淡粉 / 淡蓝 / 薄荷 / 淡黄
 * - 复古：70 年代印刷感，芥末黄 / 锈橙 / 橄榄绿 / 砖红 / 奶油白，整体降饱和
 * - 霓虹：近黑底 + 2–3 个高饱和霓虹，组内明暗对比拉到最大
 * - 大地：土壤 / 黏土 / 沙 / 岩，棕褐色系低饱和
 * - 海洋：蓝青为主，深浅海分层，可带泡沫白或珊瑚点缀
 * - 极简：白与近白为主，中性灰阶 + 一个深色锚点，最多一个克制的彩色点缀
 * - 都市：混凝土灰 + 一个醒目信号色
 * - 夜行：深蓝紫灰为主 + 柔光；**刻意与霓虹区分** —— 霓虹是纯黑底 + 高饱和，夜行是深色 + 低饱和柔光
 *
 * 校验靠 `node scripts/check-palettes.mjs`：id 唯一、hex 合法、组内颜色分得开、
 * 组内有明度跨度、跨组无近似重复、每个 name 都出现在 `en.palettes.ts` 里。
 * 改数据后**一定要跑一遍**，跨组近似重复是肉眼看不出来的。
 *
 * `name` 是中文名，同时是 i18n 词典 key（见 `src/lib/i18n/en.palettes.ts`）。
 */
export type PaletteTag =
  | "nature"
  | "sunset"
  | "pastel"
  | "retro"
  | "neon"
  | "earth"
  | "ocean"
  | "minimal"
  | "urban"
  | "night";

export type CuratedPalette = {
  /** 稳定 slug：React key、以及「这组方案是否已收藏」的比对依据。 */
  id: string;
  /**
   * 中文名，同时是 i18n 词典 key。
   *
   * 类型写成 `TKey` 而不是 `string` 是有意的：`TKey = keyof typeof en`，写错一个字
   * 编译期就报错，调用点可以直接 `t(p.name)` 而不用断言。代价是新增方案时
   * 必须先把名字加进 `en.palettes.ts`。
   */
  name: TKey;
  /** 4–5 个大写 hex。 */
  colors: readonly string[];
  tags: readonly PaletteTag[];
};

/**
 * 「这组配色是否已收藏」的比对 key。
 *
 * 必须与 store 的 `normalizeSavedColors`（只做大写化、**保序**）对齐 ——
 * 顺序或大小写对不上，收藏过的那颗心形就不会亮。
 */
export function paletteKey(colors: readonly string[]) {
  return colors.map((c) => c.toUpperCase()).join(",");
}

/** 筛选栏的标签。`label` 是词典 key。 */
export const PALETTE_TAGS: readonly { id: PaletteTag; label: TKey }[] = [
  { id: "nature", label: "自然" },
  { id: "sunset", label: "日落" },
  { id: "pastel", label: "柔和" },
  { id: "retro", label: "复古" },
  { id: "neon", label: "霓虹" },
  { id: "earth", label: "大地" },
  { id: "ocean", label: "海洋" },
  { id: "minimal", label: "极简" },
  { id: "urban", label: "都市" },
  { id: "night", label: "夜行" },
];

export const CURATED_PALETTES: readonly CuratedPalette[] = [
  // ─────────────────────────── 自然 ───────────────────────────
  {
    id: "tundra-morning",
    name: "苔原清晨",
    colors: ["#1B3A2F", "#3E6B4F", "#7FA88A", "#D6E4D2", "#F2F0E6"],
    tags: ["nature"],
  },
  {
    id: "pine-mist",
    name: "松针与雾",
    colors: ["#12241C", "#2F4F3E", "#5C8A6E", "#A9C4B2", "#E8EFE9"],
    tags: ["nature", "minimal"],
  },
  {
    id: "wild-meadow",
    name: "野草地",
    colors: ["#3E5B2A", "#7EA33C", "#B7CC6A", "#E3EBC4", "#F7F5EA"],
    tags: ["nature"],
  },
  {
    id: "after-the-rain",
    name: "雨后林间",
    colors: ["#17301F", "#2E5C3A", "#4F8F5B", "#9BC79A", "#DCEBDC"],
    tags: ["nature"],
  },
  {
    id: "fern-and-stone",
    name: "蕨叶与石",
    colors: ["#22301C", "#465C33", "#7C9455", "#BCC79B", "#EDEADF"],
    tags: ["nature", "earth"],
  },
  {
    id: "spring-buds",
    name: "春日新芽",
    colors: ["#3E5B2A", "#7BB661", "#A8D07E", "#D3E6A8", "#F0F3D8"],
    tags: ["nature", "pastel"],
  },
  {
    id: "marsh-mist",
    name: "沼泽晨雾",
    colors: ["#24301C", "#46562A", "#6E7E3E", "#A8B26E", "#DDDCC0"],
    tags: ["nature"],
  },
  {
    id: "highland-meadow",
    name: "高原草甸",
    colors: ["#3F5E2B", "#6B8F3F", "#9DBB63", "#CBD99C", "#F1F0E2"],
    tags: ["nature"],
  },
  {
    id: "forest-clearing",
    name: "林中空地",
    colors: ["#1E3B2B", "#35624A", "#5E9670", "#A3C6A4", "#E4EFE2"],
    tags: ["nature"],
  },
  {
    id: "ivy",
    name: "常青藤",
    colors: ["#0F2A1D", "#24513A", "#3F7C57", "#7FB28C", "#CFE3D4"],
    tags: ["nature", "night"],
  },
  {
    id: "bamboo-shade",
    name: "竹影",
    colors: ["#2C3F1E", "#4E6B2E", "#7E9C4A", "#B5C982", "#E9EFD6"],
    tags: ["nature"],
  },
  {
    id: "wild-berries",
    name: "野莓丛",
    colors: ["#1C3324", "#3A6B3F", "#7FA84E", "#C2D06A", "#F2E9D8"],
    tags: ["nature"],
  },

  // ─────────────────────────── 日落 ───────────────────────────
  {
    id: "molten-sky",
    name: "熔金天际",
    colors: ["#2B0F1A", "#7A1E2B", "#D6452F", "#F08A24", "#F6D06B"],
    tags: ["sunset"],
  },
  {
    id: "sunset-lava",
    name: "落日熔岩",
    colors: ["#1A0A12", "#5C1030", "#A81E3F", "#E8552E", "#F7B24A"],
    tags: ["sunset"],
  },
  {
    id: "dune-afterglow",
    name: "沙丘晚照",
    colors: ["#3A1A1E", "#8A3A28", "#C96A34", "#E9A85B", "#F6E2B8"],
    tags: ["sunset", "earth"],
  },
  {
    id: "dusk-harbor",
    name: "暮色港湾",
    colors: ["#14163A", "#3E2A5C", "#8A3A6B", "#D9605C", "#F0A868"],
    tags: ["sunset", "night"],
  },
  {
    id: "burning-clouds",
    name: "火烧云",
    colors: ["#20060E", "#6B0F2A", "#C42B3F", "#EF6B2E", "#F7C15C"],
    tags: ["sunset"],
  },
  {
    id: "golden-wheat-dusk",
    name: "黄昏麦田",
    colors: ["#33210F", "#7A4A1A", "#C08A2E", "#E8C468", "#F7EDC8"],
    tags: ["sunset", "retro"],
  },
  {
    id: "lingering-warmth",
    name: "落日余温",
    colors: ["#2A1020", "#7A2038", "#C74A48", "#EE8A5A", "#F7CFA0"],
    tags: ["sunset"],
  },
  {
    id: "coral-dusk",
    name: "珊瑚晚霞",
    colors: ["#1F1226", "#5E2A4A", "#B24A6A", "#EE7A6A", "#F7B98C"],
    tags: ["sunset"],
  },
  {
    id: "equator-dusk",
    name: "赤道黄昏",
    colors: ["#16060C", "#5E0E26", "#C03A2A", "#F58A18", "#FFD166"],
    tags: ["sunset"],
  },
  {
    id: "copper-dusk",
    name: "铜色黄昏",
    colors: ["#2C1608", "#6E3A14", "#B06A28", "#DE9A48", "#F3D9A0"],
    tags: ["sunset", "earth"],
  },
  {
    id: "molten-copper-cloud",
    name: "暮云熔铜",
    colors: ["#1C0E1A", "#55203C", "#A03A48", "#DE6A3A", "#F2AE64"],
    tags: ["sunset"],
  },
  {
    id: "days-end",
    name: "长日将尽",
    colors: ["#120A18", "#4A1430", "#8E2244", "#D44A3C", "#F08C4A"],
    tags: ["sunset", "night"],
  },

  // ─────────────────────────── 柔和 ───────────────────────────
  {
    id: "cotton-candy",
    name: "棉花糖",
    colors: ["#FDF6F0", "#F7D9E3", "#EFC3D8", "#C9CCEC", "#AFDCE4"],
    tags: ["pastel"],
  },
  {
    id: "mint-shake",
    name: "薄荷奶昔",
    colors: ["#FBFDF8", "#E2F0E4", "#C6E3D4", "#A8D8D0", "#F4E8D0"],
    tags: ["pastel"],
  },
  {
    id: "lilac-haze",
    name: "淡紫晨雾",
    colors: ["#FAF7FD", "#E2D6F3", "#CCBCEA", "#B4C6EE", "#F7DCC8"],
    tags: ["pastel"],
  },
  {
    id: "peach-letter",
    name: "桃色信笺",
    colors: ["#FFF8F4", "#FCE0D6", "#F7C4B4", "#EFD6C4", "#E8E4DA"],
    tags: ["pastel"],
  },
  {
    id: "sea-salt-soda",
    name: "海盐苏打",
    colors: ["#F5FCFD", "#CDE9F0", "#A6D4E2", "#7EBCD4", "#E4F1F5"],
    tags: ["pastel", "ocean"],
  },
  {
    id: "cherry-blossom-glow",
    name: "樱花微光",
    colors: ["#FFFAFB", "#FADCE4", "#F2BFD0", "#E0CFE8", "#F7EFE6"],
    tags: ["pastel"],
  },
  {
    id: "cream-mint",
    name: "奶油薄荷",
    colors: ["#FCFBF5", "#E6EEDA", "#CEDFBA", "#BCD8CE", "#F5E6D0"],
    tags: ["pastel", "nature"],
  },
  {
    id: "cloud-blue",
    name: "云朵蓝",
    colors: ["#F8FAFD", "#DCE5F5", "#C0D0EE", "#A4BEE6", "#F2E4CC"],
    tags: ["pastel"],
  },
  {
    id: "peach-fizz",
    name: "蜜桃气泡",
    colors: ["#FFF9F4", "#FDD9C4", "#F9B79A", "#F5D2B4", "#E8DCC8"],
    tags: ["pastel"],
  },
  {
    id: "lotus-mist",
    name: "淡藕荷",
    colors: ["#FBF8FA", "#E9D8E8", "#D6BEDC", "#C0B4DC", "#DDE8D8"],
    tags: ["pastel"],
  },
  {
    id: "lime-smoothie",
    name: "青柠冰沙",
    colors: ["#FAFCF3", "#E2EECA", "#C8DFA8", "#B6D8C0", "#EDF0DC"],
    tags: ["pastel", "nature"],
  },
  {
    id: "misty-lavender",
    name: "雾感薰衣草",
    colors: ["#F9F8FD", "#E0DCF2", "#C6BCE6", "#AFA6DE", "#BEDDD6"],
    tags: ["pastel"],
  },

  // ─────────────────────────── 复古 ───────────────────────────
  {
    id: "old-vinyl",
    name: "老唱片",
    colors: ["#2B1B12", "#7A3B1E", "#C1662F", "#D9A441", "#EDE0C8"],
    tags: ["retro"],
  },
  {
    id: "mustard-era",
    name: "芥末时代",
    colors: ["#241A0E", "#6B4A18", "#B08A2A", "#D9BE5C", "#EFE6C4"],
    tags: ["retro"],
  },
  {
    id: "brick-slogan",
    name: "砖红标语",
    colors: ["#1E1210", "#6B2A1E", "#A84A2E", "#CE8455", "#E8D9BE"],
    tags: ["retro"],
  },
  {
    id: "olive-kitchen",
    name: "橄榄绿厨房",
    colors: ["#1A1C10", "#4A5220", "#7E8A38", "#B0B468", "#E6E2C2"],
    tags: ["retro"],
  },
  {
    id: "retro-pool",
    name: "复古泳池",
    colors: ["#123038", "#1E5A5E", "#4A8A80", "#A8C4A8", "#EDE4CE"],
    tags: ["retro", "ocean"],
  },
  {
    id: "rust-and-cream",
    name: "铁锈与奶",
    colors: ["#1E100C", "#5E2416", "#9C4A1E", "#C88A3C", "#F2E4BE"],
    tags: ["retro", "earth"],
  },
  {
    id: "orange-soda",
    name: "橙皮汽水",
    colors: ["#2A1408", "#7A3A12", "#C06A1E", "#E0A044", "#F2E0B4"],
    tags: ["retro"],
  },
  {
    id: "old-poster",
    name: "旧海报",
    colors: ["#1C1814", "#4E4030", "#8A7048", "#C0A468", "#E8DCC0"],
    tags: ["retro", "minimal"],
  },
  {
    id: "mustard-and-brick",
    name: "芥末与砖",
    colors: ["#201810", "#5E4418", "#A07828", "#C89A50", "#EDDFBE"],
    tags: ["retro"],
  },
  {
    id: "retro-railcar",
    name: "复古绿皮车",
    colors: ["#141C18", "#2E4A3A", "#567A5A", "#9AAE7E", "#E4E0C4"],
    tags: ["retro", "nature"],
  },
  {
    id: "terracotta-and-ochre",
    name: "陶土与赭",
    colors: ["#26160E", "#6A3418", "#A8622A", "#CC9455", "#EFE0C2"],
    tags: ["retro", "earth"],
  },
  {
    id: "seventies-living-room",
    name: "七十年代客厅",
    colors: ["#241C0E", "#6A5220", "#A88C34", "#D4BE72", "#F2ECD2"],
    tags: ["retro"],
  },

  // ─────────────────────────── 霓虹 ───────────────────────────
  {
    id: "cyber-sign",
    name: "赛博招牌",
    colors: ["#08060F", "#1B0A3A", "#FF2E88", "#00E5FF", "#B4FF39"],
    tags: ["neon"],
  },
  {
    id: "electric-midnight",
    name: "电子午夜",
    colors: ["#05060E", "#101A3A", "#FF3D6E", "#3DF2FF", "#FFE23D"],
    tags: ["neon", "night"],
  },
  {
    id: "acid-green",
    name: "酸性绿光",
    colors: ["#060A08", "#0E2018", "#39FF88", "#C6FF2E", "#00D8FF"],
    tags: ["neon"],
  },
  {
    id: "neon-pink-alley",
    name: "霓虹粉巷",
    colors: ["#0A050E", "#2A0A3E", "#FF2EA6", "#7A3DFF", "#2EE8FF"],
    tags: ["neon"],
  },
  {
    id: "electric-blues",
    name: "电光蓝调",
    colors: ["#04070F", "#0C1A3C", "#2E8CFF", "#4DF2E0", "#FF5CA8"],
    tags: ["neon"],
  },
  {
    id: "midnight-neon",
    name: "午夜霓虹",
    colors: ["#07050C", "#1C0A2E", "#FF4D3D", "#FFC72E", "#3DFF9E"],
    tags: ["neon", "night"],
  },
  {
    id: "fluorescent-graffiti",
    name: "荧光涂鸦",
    colors: ["#0B0A06", "#241C08", "#E8FF2E", "#FF6A00", "#2EE8C6"],
    tags: ["neon", "urban"],
  },
  {
    id: "electric-violet",
    name: "电子紫",
    colors: ["#06050F", "#1A0C3A", "#9E3DFF", "#FF3DD4", "#3DF2FF"],
    tags: ["neon"],
  },
  {
    id: "neon-palm",
    name: "霓虹棕榈",
    colors: ["#050B0A", "#0C2A24", "#2EFFB0", "#FFE23D", "#FF4D8C"],
    tags: ["neon"],
  },
  {
    id: "late-night-arcade",
    name: "深夜游戏厅",
    colors: ["#08060C", "#200A2E", "#FF2E5C", "#2EFFD4", "#B43DFF"],
    tags: ["neon", "night"],
  },
  {
    id: "laser-lemon",
    name: "激光柠檬",
    colors: ["#070805", "#1C2008", "#E8FF3D", "#2EFF88", "#FF7A2E"],
    tags: ["neon"],
  },
  {
    id: "ultraviolet-halo",
    name: "紫外光晕",
    colors: ["#05040A", "#180A38", "#7A2EFF", "#FF3DA6", "#2ED8FF"],
    tags: ["neon"],
  },

  // ─────────────────────────── 大地 ───────────────────────────
  {
    id: "raw-terracotta",
    name: "陶土原色",
    colors: ["#2A1A12", "#6B3E24", "#A87048", "#C9A87E", "#E8DCC4"],
    tags: ["earth"],
  },
  {
    id: "clay-and-sand",
    name: "黏土与沙",
    colors: ["#241610", "#5C3A22", "#96704A", "#C4AC86", "#E6DCC8"],
    tags: ["earth"],
  },
  {
    id: "ochre-plateau",
    name: "赭石高原",
    colors: ["#1E140C", "#4E3418", "#8A6230", "#B99A62", "#E4D8B8"],
    tags: ["earth"],
  },
  {
    id: "rock-and-moss",
    name: "岩石与苔",
    colors: ["#1A1814", "#3E3A2C", "#6E6A4A", "#A8A480", "#DCD8C0"],
    tags: ["earth", "nature"],
  },
  {
    id: "terracotta-tile",
    name: "赤陶砖",
    colors: ["#28140E", "#6A2E1C", "#A85A38", "#C99068", "#EADCC6"],
    tags: ["earth"],
  },
  {
    id: "sand-dune",
    name: "沙丘",
    colors: ["#2E2416", "#6E5A34", "#A89058", "#CDBA8C", "#EAE0C8"],
    tags: ["earth"],
  },
  {
    id: "dark-leather",
    name: "深棕皮革",
    colors: ["#1C120C", "#4A2C18", "#7E4E2C", "#AE8452", "#DDC8A2"],
    tags: ["earth", "retro"],
  },
  {
    id: "volcanic-rock",
    name: "火山岩",
    colors: ["#16120E", "#3A2E24", "#6A5646", "#9E8C74", "#D6CCB8"],
    tags: ["earth", "minimal"],
  },
  {
    id: "hay-and-mud",
    name: "干草与泥",
    colors: ["#26200C", "#5E5220", "#968A3C", "#C0B668", "#E6E0B8"],
    tags: ["earth"],
  },
  {
    id: "chestnut-ridge",
    name: "栗色山脊",
    colors: ["#200E06", "#5C2810", "#94441C", "#C4783C", "#E8D2A8"],
    tags: ["earth"],
  },
  {
    id: "sandstone-strata",
    name: "砂岩层",
    colors: ["#342616", "#74583A", "#A88E6E", "#CBBBA6", "#EFE8DA"],
    tags: ["earth"],
  },
  {
    id: "clay-and-ash",
    name: "土陶与灰",
    colors: ["#201814", "#4E3A2E", "#82644E", "#B0A088", "#DED4C0"],
    tags: ["earth", "minimal"],
  },

  // ─────────────────────────── 海洋 ───────────────────────────
  {
    id: "deep-sea-route",
    name: "深海航线",
    colors: ["#04121E", "#0A2E44", "#106A8C", "#3FA8B8", "#C8E4E8"],
    tags: ["ocean"],
  },
  {
    id: "shallows",
    name: "浅滩",
    colors: ["#0A2A33", "#14707E", "#38B0B0", "#9ADCD4", "#F0F7F2"],
    tags: ["ocean"],
  },
  {
    id: "tide",
    name: "潮汐",
    colors: ["#061826", "#0E3A5C", "#1E6E96", "#56A8C4", "#D6EAF0"],
    tags: ["ocean"],
  },
  {
    id: "coral-reef",
    name: "珊瑚礁",
    colors: ["#08202E", "#10506A", "#2E9AA8", "#7ED0C0", "#F2E8D8"],
    tags: ["ocean"],
  },
  {
    id: "open-ocean",
    name: "远洋",
    colors: ["#03101C", "#0A2840", "#125070", "#2E86A8", "#A8D0DC"],
    tags: ["ocean"],
  },
  {
    id: "breaking-wave",
    name: "浪花白",
    colors: ["#0A2430", "#14627A", "#2E9CAE", "#8CD4D8", "#EFF6F6"],
    tags: ["ocean"],
  },
  {
    id: "glacier-bay",
    name: "冰川湾",
    colors: ["#071C2A", "#0E4058", "#2A7E96", "#6AB8C4", "#DCEAEC"],
    tags: ["ocean"],
  },
  {
    id: "blue-whale",
    name: "深海蓝鲸",
    colors: ["#010A16", "#061C38", "#0C4268", "#1E74A6", "#C2E0EC"],
    tags: ["ocean"],
  },
  {
    id: "intertidal",
    name: "潮间带",
    colors: ["#0C2028", "#1A4A4E", "#2E7E72", "#8AC0A8", "#E8E8D8"],
    tags: ["ocean", "nature"],
  },
  {
    id: "midnight-sea",
    name: "午夜海面",
    colors: ["#010810", "#06182C", "#0C3A5E", "#2472A0", "#9CC8DC"],
    tags: ["ocean", "night"],
  },
  {
    id: "turquoise-lagoon",
    name: "蓝绿泻湖",
    colors: ["#062024", "#0C4A4A", "#1E8E86", "#6ECAB4", "#E4F0E6"],
    tags: ["ocean"],
  },
  {
    id: "harbor-mist",
    name: "港口晨雾",
    colors: ["#0A1E2A", "#16485C", "#3A8090", "#8ABAC4", "#E6EDEE"],
    tags: ["ocean"],
  },

  // ─────────────────────────── 极简 ───────────────────────────
  {
    id: "plain-paper",
    name: "素纸",
    colors: ["#FFFFFF", "#EDEDED", "#CDCDCD", "#7E7E7E", "#151515"],
    tags: ["minimal"],
  },
  {
    id: "ivory-and-ink",
    name: "象牙与墨",
    colors: ["#FAF8F4", "#EAE4D8", "#C6BCA8", "#7C7260", "#1E1A14"],
    tags: ["minimal"],
  },
  {
    id: "cool-grays",
    name: "冷灰阶",
    colors: ["#F7F8FA", "#E2E6EC", "#C0C7D2", "#828C9C", "#12161C"],
    tags: ["minimal"],
  },
  {
    id: "rose-gray",
    name: "玫瑰灰",
    colors: ["#FBF6F5", "#EFE3E0", "#D4C0BC", "#96807C", "#221A19"],
    tags: ["minimal", "pastel"],
  },
  {
    id: "single-indigo",
    name: "单点靛蓝",
    colors: ["#FBFBFB", "#ECECEC", "#C6C6C6", "#2B3A8C", "#12142A"],
    tags: ["minimal"],
  },
  {
    id: "graphite",
    name: "石墨黑",
    colors: ["#FCFCFD", "#E9E9EE", "#C6C6CE", "#5A5A64", "#050507"],
    tags: ["minimal", "urban"],
  },
  {
    id: "cream-and-clay",
    name: "米白与陶",
    colors: ["#FBF7F1", "#EFE7DA", "#D2C4AE", "#A8764A", "#23201A"],
    tags: ["minimal", "earth"],
  },
  {
    id: "gray-with-ochre",
    name: "灰阶加赭",
    colors: ["#F9F9F7", "#E9E9E5", "#C6C6C0", "#83837C", "#8A5A2A"],
    tags: ["minimal"],
  },
  {
    id: "teal-gray",
    name: "极简青灰",
    colors: ["#F2F6F6", "#D8E4E4", "#B0C4C4", "#6A7E7E", "#101C1C"],
    tags: ["minimal"],
  },
  {
    id: "cold-white-and-navy",
    name: "冷白与藏青",
    colors: ["#FDFDFE", "#E4E9F4", "#BEC9DA", "#6A78A2", "#081024"],
    tags: ["minimal", "urban"],
  },
  {
    id: "beige-study",
    name: "米色书房",
    colors: ["#F7F5EE", "#E6E0D2", "#C4BBA4", "#6E6650", "#1A180F"],
    tags: ["minimal"],
  },
  {
    id: "gray-and-olive",
    name: "灰白与橄榄",
    colors: ["#F8F8F4", "#E8E8DE", "#C8C8B8", "#7A7A62", "#1C1E14"],
    tags: ["minimal", "nature"],
  },

  // ─────────────────────────── 都市 ───────────────────────────
  {
    id: "concrete-and-signal-yellow",
    name: "混凝土与信号黄",
    colors: ["#2A2A2E", "#4A4A50", "#8A8A90", "#E8C11C", "#F2F2F0"],
    tags: ["urban"],
  },
  {
    id: "subway-tile",
    name: "地铁瓷砖",
    colors: ["#1E2228", "#36414C", "#5C6B78", "#C74A3C", "#E8E6E0"],
    tags: ["urban"],
  },
  {
    id: "asphalt-and-neon-orange",
    name: "沥青与霓虹橙",
    colors: ["#18181C", "#33333A", "#6E6E78", "#FF6A1E", "#E4E4E0"],
    tags: ["urban"],
  },
  {
    id: "glass-facade",
    name: "玻璃幕墙",
    colors: ["#22262C", "#3E4A56", "#6E8494", "#A8BCC8", "#F0F2F2"],
    tags: ["urban", "ocean"],
  },
  {
    id: "rust-and-blue",
    name: "锈铁与蓝",
    colors: ["#1C1E22", "#3A4048", "#6A7480", "#3D6EA8", "#E0E4E6"],
    tags: ["urban"],
  },
  {
    id: "graffiti-violet",
    name: "涂鸦紫",
    colors: ["#22202A", "#3E3A50", "#6E688A", "#8A4AE0", "#EAE6F0"],
    tags: ["urban", "neon"],
  },
  {
    id: "cement-and-brick",
    name: "水泥与砖",
    colors: ["#262428", "#44403E", "#7A726A", "#B04A32", "#E6E0D8"],
    tags: ["urban", "earth"],
  },
  {
    id: "signal-red",
    name: "信号红",
    colors: ["#1A1A1E", "#3A3A42", "#70707A", "#D62B2B", "#EDEDEA"],
    tags: ["urban"],
  },
  {
    id: "urban-moss",
    name: "都市苔绿",
    colors: ["#20241F", "#3A4238", "#66705E", "#7A9A4A", "#E2E4DA"],
    tags: ["urban", "nature"],
  },
  {
    id: "under-the-overpass",
    name: "高架桥下",
    colors: ["#16181C", "#2E343C", "#5A646E", "#E07A2A", "#DCDEE0"],
    tags: ["urban"],
  },
  {
    id: "steel-and-teal",
    name: "钢与青",
    colors: ["#1E2428", "#38464E", "#5E7884", "#2E8A9E", "#DEE8EA"],
    tags: ["urban", "ocean"],
  },
  {
    id: "night-signage",
    name: "夜色招牌",
    colors: ["#1C1A22", "#36343E", "#605C6C", "#E8447A", "#E8E4EC"],
    tags: ["urban", "night"],
  },

  // ─────────────────────────── 夜行 ───────────────────────────
  {
    id: "midnight-blues",
    name: "午夜蓝调",
    colors: ["#080C1A", "#14203C", "#22345C", "#3A5480", "#8EA8C8"],
    tags: ["night"],
  },
  {
    id: "deep-space-violet",
    name: "深空紫",
    colors: ["#0A0818", "#1C1636", "#33295A", "#524380", "#9E90C0"],
    tags: ["night"],
  },
  {
    id: "midnight-forest",
    name: "午夜森林",
    colors: ["#060E0C", "#0E1E1A", "#1A342C", "#2E5244", "#7EA090"],
    tags: ["night", "nature"],
  },
  {
    id: "night-flight",
    name: "夜航",
    colors: ["#070B14", "#101C30", "#1C3048", "#2E4A6A", "#7A98B8"],
    tags: ["night"],
  },
  {
    id: "dark-slate",
    name: "暗夜石板",
    colors: ["#0A0C10", "#161C24", "#242E3A", "#3A4854", "#8896A4"],
    tags: ["night", "minimal"],
  },
  {
    id: "deep-indigo",
    name: "深靛",
    colors: ["#080A1C", "#141A38", "#222C58", "#36447E", "#8A96C4"],
    tags: ["night"],
  },
  {
    id: "midnight-wine",
    name: "午夜酒红",
    colors: ["#0C0608", "#200E14", "#381A24", "#56283A", "#A8788C"],
    tags: ["night"],
  },
  {
    id: "night-fog",
    name: "夜雾灰",
    colors: ["#0C0C0E", "#1A1A1E", "#2C2C32", "#46464E", "#9A9AA2"],
    tags: ["night", "minimal"],
  },
  {
    id: "deep-pool",
    name: "深潭",
    colors: ["#050C10", "#0C1A20", "#162E38", "#244652", "#6E96A4"],
    tags: ["night", "ocean"],
  },
  {
    id: "night-neon-blue",
    name: "夜行霓蓝",
    colors: ["#060A14", "#0E1A2E", "#1A2E4C", "#2A4670", "#5E7EB0"],
    tags: ["night"],
  },
  {
    id: "dark-violet",
    name: "暗紫罗兰",
    colors: ["#0A0614", "#1A1030", "#2C1C50", "#42306E", "#9484B8"],
    tags: ["night"],
  },
  {
    id: "midnight-pine",
    name: "午夜墨绿",
    colors: ["#040C08", "#0A1C12", "#123024", "#1E4A34", "#63A488"],
    tags: ["night", "nature"],
  },
];
