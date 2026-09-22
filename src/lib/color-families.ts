/**
 * i18n-ignore-file —— 本文件里的中文是**搜索关键词数据**，不是界面文案。
 * 下面的 `KEYWORDS` 表把「红 / 绿 / 蓝」这类词映射到色系，永远不会渲染给用户。
 * 详见 `check-i18n.cjs` 里 `SKIP_MARK` 的说明。
 *
 * 色系分类：把颜色归到「红 / 橙 / 黄 / 绿 / 青 / 蓝 / 紫 / 粉 / 棕 / 米 / 灰 / 黑 / 白」，
 * 让首页搜索能**按颜色找方案**（搜「绿色」出绿色系的方案），而不是只能搜名字。
 *
 * 判据和 `scripts/check-palettes.mjs` 同源：**中性色用 LCH 彩度判，不用 HSL 饱和度** ——
 * 后者在高明度处虚高（纸白 `#FAF8F4` 的 S 是 37%），会把米色误判成彩色。
 */
import { hexToRgb, rgbToHsl, rgbToLab } from "./color";

export type ColorFamily =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "brown"
  | "beige"
  | "gray"
  | "black"
  | "white";

/** 中性色的 LCH 彩度上限。与 `scripts/check-palettes.mjs` 的 `NEUTRAL_C` 保持一致。 */
const NEUTRAL_C = 10;

/** 彩色系的色相区间（度，环形；`from > to` 表示跨 0°）。 */
const HUE_RANGES: readonly { id: ColorFamily; from: number; to: number }[] = [
  { id: "red", from: 345, to: 15 },
  { id: "orange", from: 15, to: 45 },
  { id: "yellow", from: 45, to: 70 },
  { id: "green", from: 70, to: 165 },
  { id: "teal", from: 165, to: 195 },
  { id: "blue", from: 195, to: 250 },
  { id: "purple", from: 250, to: 290 },
  { id: "pink", from: 290, to: 345 },
];

/**
 * 搜索关键词 → 色系。按**包含**匹配（`query.includes(key)`），
 * 所以短别名要一并列上 —— 用户打「深绿」时命中的是「绿」这条。
 * 英文一律小写（query 也会先小写化）。
 */
const KEYWORDS: readonly { key: string; family: ColorFamily }[] = [
  { key: "红", family: "red" },
  { key: "赤", family: "red" },
  { key: "red", family: "red" },
  { key: "橙", family: "orange" },
  { key: "橘", family: "orange" },
  { key: "orange", family: "orange" },
  { key: "黄", family: "yellow" },
  { key: "金", family: "yellow" },
  { key: "yellow", family: "yellow" },
  { key: "gold", family: "yellow" },
  { key: "绿", family: "green" },
  { key: "翠", family: "green" },
  { key: "green", family: "green" },
  { key: "青", family: "teal" },
  { key: "蓝绿", family: "teal" },
  { key: "teal", family: "teal" },
  { key: "cyan", family: "teal" },
  { key: "蓝", family: "blue" },
  { key: "靛", family: "blue" },
  { key: "blue", family: "blue" },
  { key: "紫", family: "purple" },
  { key: "purple", family: "purple" },
  { key: "violet", family: "purple" },
  { key: "粉", family: "pink" },
  { key: "玫瑰", family: "pink" },
  { key: "品红", family: "pink" },
  { key: "pink", family: "pink" },
  { key: "magenta", family: "pink" },
  { key: "棕", family: "brown" },
  { key: "褐", family: "brown" },
  { key: "咖啡", family: "brown" },
  { key: "brown", family: "brown" },
  { key: "米", family: "beige" },
  { key: "奶油", family: "beige" },
  { key: "杏", family: "beige" },
  { key: "燕麦", family: "beige" },
  { key: "beige", family: "beige" },
  { key: "cream", family: "beige" },
  { key: "灰", family: "gray" },
  { key: "银", family: "gray" },
  { key: "gray", family: "gray" },
  { key: "grey", family: "gray" },
  { key: "黑", family: "black" },
  { key: "暗", family: "black" },
  { key: "black", family: "black" },
  { key: "白", family: "white" },
  { key: "素", family: "white" },
  { key: "white", family: "white" },
];

const inRange = (h: number, from: number, to: number) =>
  from <= to ? h >= from && h < to : h >= from || h < to;

/** 单个颜色属于哪些色系。一个颜色可以同时属于多个（例如深棕既是橙也是棕）。 */
export function familiesOf(hex: string): ColorFamily[] {
  const rgb = hexToRgb(hex);
  const lab = rgbToLab(rgb);
  const out: ColorFamily[] = [];

  if (Math.hypot(lab.a, lab.b) < NEUTRAL_C) {
    if (lab.l < 25) out.push("black");
    else if (lab.l > 88) out.push("white");
    else out.push("gray");
    // 暖调的中性色（米 / 奶油 / 燕麦）单列一档 —— 搜「米色」要能找到它们
    if (lab.l > 70 && lab.b > 6) out.push("beige");
    return out;
  }

  const hue = rgbToHsl(rgb).h;
  for (const range of HUE_RANGES) if (inRange(hue, range.from, range.to)) out.push(range.id);
  // 低明度的暖色看上去就是棕，不是橙 / 黄
  if (lab.l < 45 && (out.includes("orange") || out.includes("yellow"))) out.push("brown");
  return out;
}

/** 一组配色覆盖到的全部色系。 */
export function familiesOfColors(colors: readonly string[]): Set<ColorFamily> {
  const out = new Set<ColorFamily>();
  for (const hex of colors) for (const f of familiesOf(hex)) out.add(f);
  return out;
}

/** `query` 命中的色系。没命中任何关键词时返回空数组（调用方据此回退到纯名字搜索）。 */
export function matchFamilies(query: string): ColorFamily[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = new Set<ColorFamily>();
  for (const { key, family } of KEYWORDS) if (q.includes(key)) hit.add(family);
  return [...hit];
}
