/**
 * 把 .output/generated.json 里的候选写进项目数据文件。
 * 自动命名（色系词 + 序号）、自动分配标签，避免人工给两百多组起名。
 *
 *   node .output/apply-generated.mjs
 */
import fs from "node:fs";
import { hexToRgb, rgbToHsl, rgbToLab } from "../src/lib/color.ts";

const DATA_FILE = "src/lib/colora-palettes.ts";
const DICT_FILE = "src/lib/i18n/en.palettes.ts";
const palette = JSON.parse(fs.readFileSync(".output/generated.json", "utf8"));

const chromaOf = (hex) => {
  const lab = rgbToLab(hexToRgb(hex));
  return Math.hypot(lab.a, lab.b);
};
const hueOf = (hex) => rgbToHsl(hexToRgb(hex)).h;

/** 主色系：组内非中性色的色相中位数。 */
function familyOf(colors) {
  const hues = colors
    .filter((c) => chromaOf(c) >= 10)
    .map(hueOf)
    .sort((a, b) => a - b);
  if (hues.length === 0) return "gray";
  const h = hues[Math.floor(hues.length / 2)];
  if (h >= 345 || h < 15) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 195) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

/**
 * 意象词表：每个色系一组「场景词 + 状态词」，两两组合出不重复的名字。
 *
 * 不用「色系 + 序号」那种自动编号 —— 和手工 / 精选那两批的意象名摆在一起，
 * 一眼就能看出是机器拼的。这里拼出来的至少读着像名字。
 *
 * **状态词各色系独立**：一开始九个色系共用同一批（微光 / 低语 / 暮色…），
 * 结果「微光」出现 24 次、前五个词占了全部名字的 44%。各色系用自己的词，
 * 每个词的出现次数就降到「该色系组数 / 10」。
 */
const WORDS = {
  red: {
    a: ["赤霞", "丹枫", "朱雀", "烈火", "珊瑚", "石榴", "落日", "枫林", "红岩", "朝曦"],
    b: ["余烬", "晚照", "残阳", "赤潮", "烬火", "灼光", "暮红", "枫燃", "血玉", "夕烧"],
    enA: ["Crimson", "Maple", "Ember", "Coral", "Garnet", "Vermilion", "Scarlet", "Ruby", "Rust", "Clay"],
    enB: ["Embers", "Sunset", "Afterglow", "Tide", "Cinder", "Flare", "Dusk", "Blaze", "Garnet", "Scorch"],
  },
  orange: {
    a: ["麦田", "琥珀", "秋林", "暖沙", "蜂蜡", "橘园", "蜜糖", "篝火", "旱原", "柿林"],
    b: ["暖阳", "麦浪", "余温", "蜜色", "秋收", "暖砂", "橘光", "蜂巢", "熟果", "夕照"],
    enA: ["Amber", "Harvest", "Autumn", "Honey", "Apricot", "Saffron", "Wheat", "Bonfire", "Prairie", "Persimmon"],
    enB: ["Sunlight", "Field", "Warmth", "Nectar", "Harvest", "Dune", "Glow", "Comb", "Ripeness", "Afterglow"],
  },
  yellow: {
    a: ["麦浪", "葵田", "蜂蜜", "金穗", "柠檬", "沙丘", "稻田", "金盏", "油菜", "日光"],
    b: ["晨光", "日光", "麦芒", "亮金", "暖风", "稻香", "柠檬", "和煦", "金辉", "晴昼"],
    enA: ["Golden", "Wheat", "Sunflower", "Honey", "Saffron", "Lemon", "Meadow", "Barley", "Dune", "Dawn"],
    enB: ["Morning", "Daylight", "Awn", "Bright", "Breeze", "Rice", "Citrus", "Mild", "Sheen", "Noon"],
  },
  green: {
    a: ["青苔", "竹林", "松林", "蕨丛", "草甸", "藤蔓", "林间", "山岚", "苔石", "灌木"],
    b: ["晨雾", "新雨", "苔痕", "林影", "草露", "藤荫", "松风", "青岚", "蕨语", "春信"],
    enA: ["Moss", "Fern", "Pine", "Meadow", "Thicket", "Grove", "Clover", "Ivy", "Sage", "Woodland"],
    enB: ["Mist", "Rain", "Trail", "Shadow", "Dew", "Shade", "Wind", "Haze", "Whisper", "Spring"],
  },
  teal: {
    a: ["泻湖", "浅滩", "碧波", "海雾", "池塘", "礁石", "泉水", "青潭", "湿地", "港湾"],
    b: ["涟漪", "清浅", "水光", "碧潭", "潮痕", "浅濑", "泉声", "湖影", "湿风", "清冽"],
    enA: ["Lagoon", "Tide", "Reef", "Pool", "Spring", "Marsh", "Shallows", "Creek", "Harbor", "Atoll"],
    enB: ["Ripple", "Shallow", "Sheen", "Pool", "Mark", "Rapids", "Murmur", "Mirror", "Breeze", "Chill"],
  },
  blue: {
    a: ["深海", "远洋", "潮汐", "浅湾", "极地", "港湾", "碧波", "冰原", "夜海", "海峡"],
    b: ["微光", "远航", "深流", "冰痕", "夜航", "碧涛", "极夜", "沉静", "寒潮", "幽蓝"],
    enA: ["Marine", "Ocean", "Deep", "Arctic", "Harbor", "Strait", "Trench", "Glacier", "Nightfall", "Abyss"],
    enB: ["Glow", "Voyage", "Current", "Frost", "Nightfall", "Swell", "Polar", "Calm", "Surge", "Depth"],
  },
  purple: {
    a: ["鸢尾", "紫藤", "薰衣", "暮云", "夜昙", "紫晶", "深穹", "晚霞", "紫苏", "极光"],
    b: ["幽梦", "紫烟", "夜昙", "轻纱", "氤氲", "紫雾", "星尘", "幻境", "梦痕", "暮霭"],
    enA: ["Iris", "Lilac", "Violet", "Twilight", "Orchid", "Amethyst", "Nebula", "Dusk", "Plum", "Aurora"],
    enB: ["Dream", "Smoke", "Bloom", "Veil", "Mist", "Haze", "Stardust", "Reverie", "Trace", "Gloam"],
  },
  pink: {
    a: ["樱花", "桃林", "蔷薇", "霞光", "粉黛", "莓园", "绯云", "海棠", "玫瑰", "晨露"],
    b: ["轻语", "绯云", "晨露", "柔风", "花信", "暖意", "粉雪", "霞光", "桃夭", "甜梦"],
    enA: ["Blossom", "Cherry", "Rose", "Peony", "Dawn", "Berry", "Petal", "Flush", "Camellia", "Silk"],
    enB: ["Whisper", "Flush", "Dew", "Breeze", "Tidings", "Warmth", "Snow", "Glow", "Bloom", "Sweet"],
  },
  gray: {
    a: ["石阶", "旧墙", "雾都", "铅云", "石板", "素壁", "灰岩", "铁桥", "烟雨", "薄霜"],
    b: ["静默", "薄霜", "铅云", "烟雨", "石痕", "旧尘", "清冷", "灰烬", "雾色", "铁锈"],
    enA: ["Slate", "Ash", "Stone", "Fog", "Mist", "Iron", "Quartz", "Smoke", "Frost", "Pebble"],
    enB: ["Stillness", "Rime", "Overcast", "Drizzle", "Mark", "Dust", "Chill", "Ash", "Haze", "Rust"],
  },
};

/**
 * 词缀：`c` 是单字后缀（拼 3 字 / 5 字名），`p` 是双字前缀（拼 6 字 / 7 字名）。
 *
 * 手工 / 精选那两批的名字长度是散的（2 字「素纸」到 7 字「混凝土与信号黄」都有），
 * 而生成那批一开始全是 4 字 —— 摆在一起一眼就看出是另一套。这里让长度也散开。
 */
const AFFIX = {
  red: { c: ["红", "赤", "焰", "暖", "暮"], p: ["黄昏", "旧日", "残阳", "炉火", "秋末"] },
  orange: { c: ["橙", "暖", "蜜", "秋", "金"], p: ["秋日", "午后", "晒场", "暖房", "暮秋"] },
  yellow: { c: ["黄", "金", "亮", "暖", "晴"], p: ["清晨", "正午", "麦季", "夏日", "晴日"] },
  green: { c: ["绿", "翠", "青", "荫", "露"], p: ["初春", "雨后", "林深", "山间", "苔径"] },
  teal: { c: ["青", "碧", "澈", "浅", "润"], p: ["浅湾", "潮间", "水畔", "雨歇", "溪畔"] },
  blue: { c: ["蓝", "靛", "深", "寒", "夜"], p: ["极夜", "暮海", "冰原", "静水", "远岸"] },
  purple: { c: ["紫", "黛", "幽", "梦", "暮"], p: ["黄昏", "夜半", "花时", "深宵", "梦回"] },
  pink: { c: ["粉", "绯", "柔", "暖", "桃"], p: ["初春", "花期", "晨间", "暖房", "三月"] },
  gray: { c: ["灰", "素", "冷", "淡", "霜"], p: ["旧年", "雨日", "清晨", "暮冬", "石巷"] },
};

/**
 * 长度模式，按权重铺开（数组里重复几次就是几份权重）。`i % PATTERNS.length`
 * 决定用哪个 —— **确定性**，同一个 `i` 永远得到同一个长度。
 *
 * 4 字仍是主力（跟手工那批的比例接近），但 2 / 3 / 5 / 6 / 7 字都有。
 */
const PATTERNS = [
  ...Array(2).fill("a"), // 2 字：深海
  ...Array(3).fill("ac"), // 3 字：深海蓝
  ...Array(8).fill("ab"), // 4 字：深海微光
  ...Array(3).fill("a-b"), // 5 字：深海之微光
  ...Array(2).fill("pab"), // 6 字：暮海深海微光
  ...Array(2).fill("pa-a"), // 7 字：暮海深海与远洋
];

/**
 * 给第 `i` 个（同色系的第几个）取名字。组合会与**已有的方案名**去重 ——
 * 撞了就往后顺延一个组合（比如「樱花微光」已经被手工那批占了）。
 */
function makeName(family, i, used) {
  const w = WORDS[family];
  const af = AFFIX[family];
  const combos = w.a.length * w.b.length * af.c.length * af.p.length;
  for (let step = 0; step < combos; step++) {
    const k = i + step;
    const pattern = PATTERNS[k % PATTERNS.length];
    // 索引要**又快变又长周期**，两者是矛盾的，所以拆开：
    // - 快索引 `k % len` 保证相邻的名字用不同的词（否则前 10 个全是「XX 微光」）；
    // - 慢偏移 `floor(k / 100)` 每 100 个才变一次，把联合周期从 20 拉到 1000
    //   （只靠快索引的话 `k` 和 `k+20` 会生成一样的名字，green 有 76 组时直接撞满）。
    const slow = Math.floor(k / 100);
    const ai = k % w.a.length;
    const bi = (k * 7 + slow * 3) % w.b.length;
    const ci = (k * 3 + slow) % af.c.length;
    const pi = (k * 11 + slow * 2) % af.p.length;

    let cn;
    switch (pattern) {
      case "a":
        cn = w.a[ai];
        break;
      case "ac":
        cn = w.a[ai] + af.c[ci];
        break;
      case "a-b":
        cn = w.a[ai] + (k % 2 ? "之" : "与") + w.b[bi];
        break;
      case "pab":
        cn = af.p[pi] + w.a[ai] + w.b[bi];
        break;
      case "pa-a":
        cn = af.p[pi] + w.a[ai] + "与" + w.a[(ai + 3) % w.a.length];
        break;
      default:
        cn = w.a[ai] + w.b[bi];
    }

    // 撞名、或两个词撞字（「远洋远航」读着拗口）都跳过
    if (used.has(cn) || new Set(cn).size !== cn.length) continue;
    used.add(cn);
    return { cn, en: `${w.enA[ai]} ${w.enB[bi]}` };
  }
  throw new Error(`${family} 的名字组合用完了`);
}
const TAG_BY_FAMILY = {
  red: "sunset",
  orange: "sunset",
  yellow: "retro",
  green: "nature",
  teal: "ocean",
  blue: "ocean",
  purple: "neon",
  pink: "pastel",
  gray: "minimal",
};

const eol = fs.readFileSync(DATA_FILE, "utf8").includes("\r\n") ? "\r\n" : "\n";
/** 已有的方案名（手工 + 精选那两批），用来避开重名。 */
const usedNames = new Set(
  [...fs.readFileSync(DATA_FILE, "utf8").matchAll(/name: "([^"]+)"/g)].map((m) => m[1]),
);
const counter = {};
const rows = [];
const dict = [];

for (const { colors, style } of palette) {
  const family = familyOf(colors);
  counter[family] = (counter[family] || 0) + 1;
  const idx = String(counter[family]).padStart(2, "0");
  // 用「同色系第几个」当组合索引，名字与已有方案去重
  const { cn, en } = makeName(family, counter[family] - 1, usedNames);

  // 标签：主色系定基调，风格再修正 —— vivid 往霓虹靠，pastel / deep 各自成档
  let tag = TAG_BY_FAMILY[family];
  if (style === "vivid" && tag !== "ocean") tag = "neon";
  if (style === "pastel") tag = "pastel";
  if (style === "deep") tag = "night";
  if (style === "muted" && (tag === "neon" || tag === "sunset")) tag = "retro";

  const id = `gen-${family}-${idx}`;
  rows.push(
    [
      "  {",
      `    id: ${JSON.stringify(id)},`,
      `    name: ${JSON.stringify(cn)},`,
      `    colors: [${colors.map((c) => `"${c}"`).join(", ")}],`,
      `    tags: [${JSON.stringify(tag)}],`,
      "    featured: true,",
      "  },",
    ].join(eol),
  );
  // key 必须带引号：`明黄 01` 里有空格，词典扫描器的裸 key 正则
  // （`[^\s:{}()[\].,"']+`）认不出来，会误报「词典缺词条」。
  // 项目里带空格的 key 一律加引号（如 `"共 {n} 组配色"`），这里跟同一惯例。
  dict.push(`  ${JSON.stringify(cn)}: ${JSON.stringify(en)},`);
}

// ── 插入数据文件（在末尾的 `];` 之前）──
let data = fs.readFileSync(DATA_FILE, "utf8");
const dataAt = data.lastIndexOf("];");
if (dataAt < 0) throw new Error("找不到 CURATED_PALETTES 的结尾");
const banner = [
  "",
  "  // ─────────────── 程序生成（`scripts/gen-palettes.mjs`） ───────────────",
  "  //",
  "  // 由 `scripts/gen-palettes.mjs` 产出：整组共用一套饱和度 / 明度区间（风格），",
  "  // 一半以上是单色相色阶 —— 随机组合多色相出不了设计感，把明度铺开的单色相",
  "  // 才是参考站最容易出彩的那一类。",
  "  //",
  "  // 生成后过了四重筛：`check-palettes` 同款判据、与已有方案的精确去重、按 L*",
  "  // 排序的近似去重（逐位色差 ≤14）、以及明度跨度的硬底线。近似去重的池子里",
  "  // **必须同时含已有数据和本批已生成的** —— 只比前者会漏出大量同色系近亲",
  "  // （实测漏过 287 处）。",
  "  //",
  "  // 命名走 `WORDS` 的「场景词 + 状态词」组合，与已有方案名去重 —— 不用「色系 +",
  "  // 序号」那种自动编号，和手工 / 精选那两批的意象名摆在一起一眼就是机器拼的。",
  "  // 词典 key 一律加引号：英文名含空格，词典扫描器的裸 key 正则认不出来。",
  "",
].join(eol);
data = data.slice(0, dataAt) + banner + rows.join(eol) + eol + data.slice(dataAt);
fs.writeFileSync(DATA_FILE, data);

// ── 插入词典（在末尾的 `};` 之前）──
let dictSrc = fs.readFileSync(DICT_FILE, "utf8");
const dictAt = dictSrc.lastIndexOf("};");
if (dictAt < 0) throw new Error("找不到词典的结尾");
dictSrc =
  dictSrc.slice(0, dictAt) +
  eol +
  "  // ─────────────── 程序生成（意象名，自动组合） ───────────────" +
  eol +
  dict.join(eol) +
  eol +
  dictSrc.slice(dictAt);
fs.writeFileSync(DICT_FILE, dictSrc);

console.log(`写入 ${rows.length} 组`);
console.log("色系分布：", JSON.stringify(counter));
