/**
 * 配色生成器：按 coolors 真实方案的结构产出候选 —— 多色相和谐 + 明度分层 + 中性底。
 * 生成 → 过 check-palettes 同款判据 → 与现有数据去重（精确 + 近似）→ 自动命名。
 *
 *   node .output/generate-palettes.mjs [数量]
 *
 * 结果写 .output/generated.json，控制台只打印摘要。
 */
import fs from "node:fs";
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl, rgbToLab } from "../src/lib/color.ts";

const TARGET = Number(process.argv[2] ?? 260);
const OUT = ".output/generated.json";

// ── 固定种子的 PRNG（可复现）──
let seed = 20260922;
const rng = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const between = (a, b) => a + rng() * (b - a);

/** 和谐规则：色相偏移（度）。同一色相重复出现是**故意的** —— coolors 的方案常这么排。 */
const HARMONIES = [
  [0, 22, -22], // 类似色
  [0, 180], // 互补
  [0, 150, 210], // 分裂互补
  [0, 120, 240], // 三角
  [0, 90, 180, 270], // 四方
];

/**
 * 风格：**整组共用一套饱和度和明度区间**。
 *
 * 这是「像随机调色板」和「像有人挑过」的分界 —— 前几版不控风格，生成出来的
 * 一组里既有荧光绿又有灰粉，看着就是随机拼的。coolors 上受欢迎的方案几乎
 * 都有一致的色调气质。
 */
const STYLES = {
  muted: {
    sat: [18, 42],
    bands: [
      [22, 38],
      [46, 62],
      [72, 86],
    ],
  },
  vivid: {
    sat: [62, 95],
    bands: [
      [18, 34],
      [45, 60],
      [68, 84],
    ],
  },
  pastel: {
    sat: [35, 68],
    bands: [
      [64, 78],
      [80, 88],
      [88, 95],
    ],
  },
  deep: {
    sat: [40, 80],
    bands: [
      [10, 24],
      [26, 40],
      [48, 64],
    ],
  },
};

/** 中性底（奶油 / 纸白 / 近黑 / 灰）。coolors 的方案几乎都有一两个。 */
const NEUTRALS = ["#F5EDE0", "#FAF3E8", "#FAFAF8", "#EDEAE4", "#16161A", "#1E1E22"];

const toHex = (h, s, l) => rgbToHex(hslToRgb({ h, s, l }));
const lstar = (hex) => rgbToLab(hexToRgb(hex)).l;
const chromaOf = (hex) => {
  const lab = rgbToLab(hexToRgb(hex));
  return Math.hypot(lab.a, lab.b);
};
const hueOf = (hex) => rgbToHsl(hexToRgb(hex)).h;
const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function makeColors() {
  const styleName = pick(Object.keys(STYLES));
  const style = STYLES[styleName];
  const base = rng() * 360;
  const sat = between(style.sat[0], style.sat[1]);
  const loL = style.bands[0][0];
  const hiL = style.bands[style.bands.length - 1][1];

  // 一半以上做**单色相色阶**（6–10 色）。实测这种最容易出彩 ——
  // 多色相全靠随机组合，出不了设计感；单色相把明度铺开就是 coolors 的
  // 「Ocean Blue Serenity / Cherry Blossom Bloom」那一类。
  if (rng() < 0.55) {
    const n = 6 + Math.floor(rng() * 5);
    const colors = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      // 饱和度也随明度走一点，整条色阶才不是「同一桶漆兑水」
      const s = sat * (0.75 + 0.35 * Math.sin(t * Math.PI));
      return toHex(base, Math.min(96, s), loL + (hiL - loL) * t);
    });
    return { colors, style: styleName };
  }

  // 其余走多色相，但**色相数压在 2–4 个**，且同一色相会出现多次（不同明度）
  const offsets = pick(HARMONIES);
  const n = 3 + Math.floor(rng() * 5);
  const hues = [];
  while (hues.length < n) {
    for (const off of offsets) {
      if (hues.length >= n) break;
      hues.push((base + off + between(-4, 4) + 360) % 360); // 抖动很小，抖开了就不像一组
    }
  }

  const bands = hues.map(() => Math.floor(rng() * style.bands.length));
  bands[Math.floor(rng() * n)] = 0; // 至少一个深
  bands[Math.floor(rng() * n)] = style.bands.length - 1; // 至少一个浅

  const colors = hues.map((h, i) => {
    const [lo, hi] = style.bands[bands[i]];
    return toHex(h, sat, between(lo, hi));
  });

  // 四成概率塞一个中性底
  if (rng() < 0.4) colors[Math.floor(rng() * colors.length)] = pick(NEUTRALS);
  return { colors, style: styleName };
}

/** check-palettes.mjs 同款判据（pastel 的明度跨度放宽到 10）。 */
function passes(colors, style) {
  const ls = colors.map(lstar);
  const spread = Math.max(...ls) - Math.min(...ls);
  if (spread < (style === "pastel" ? 10 : 25)) return false;
  const hues = colors.filter((c) => chromaOf(c) >= 10).map(hueOf);
  if (hues.length >= 2) {
    let span = 0;
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) span = Math.max(span, hueDist(hues[i], hues[j]));
    return span >= 60 || colors.length >= 6;
  }
  return spread >= 40;
}

const key = (colors) =>
  [...colors]
    .map((c) => c.toUpperCase())
    .sort()
    .join(",");
const maxDiff = (a, b) => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return Math.max(Math.abs(ra.r - rb.r), Math.abs(ra.g - rb.g), Math.abs(ra.b - rb.b));
};

// ── 现有数据：精确去重 + 近似去重（按 L* 排序后逐位比）──
const src = fs.readFileSync("src/lib/colora-palettes.ts", "utf8");
const existingKeys = new Set();
const existingSorted = [];
for (const m of src.matchAll(/colors: \[([\s\S]*?)\]/g)) {
  const colors = [...m[1].matchAll(/"#[0-9A-F]{6}"/gi)].map((x) => x[0].slice(1, -1));
  if (!colors.length) continue;
  existingKeys.add(key(colors));
  existingSorted.push([...colors].sort((a, b) => lstar(a) - lstar(b)));
}
/**
 * 近似去重：按 L* 排序后逐位比，≤14 算重复。
 *
 * ⚠️ 池子里**必须同时有「已有数据」和「本批已生成的」** —— 只跟已有数据比的话，
 * 同一批里两个同色系的色阶会双双通过（实测漏出过 287 处近似重复）。
 * 单色相色阶彼此天然接近，这条是它们的主要防线。
 */
const nearIn = (pool, sorted) =>
  pool.some((other) => {
    if (other.length !== sorted.length) return false;
    return sorted.every((c, i) => maxDiff(c, other[i]) <= 14);
  });

// ── 生成 ──
const out = [];
const seen = new Set();
const generatedSorted = [];
let tries = 0;
while (out.length < TARGET && tries < TARGET * 2000) {
  tries++;
  const { colors, style } = makeColors();
  if (colors.length < 3 || colors.length > 10) continue;
  if (!passes(colors, style)) continue;
  const k = key(colors);
  if (seen.has(k) || existingKeys.has(k)) continue;
  seen.add(k);
  const sorted = [...colors].sort((a, b) => lstar(a) - lstar(b));
  if (nearIn(existingSorted, sorted) || nearIn(generatedSorted, sorted)) continue;
  generatedSorted.push(sorted);
  out.push({ colors, style });
}

console.log(
  `生成 ${out.length} 组（尝试 ${tries} 次，命中率 ${((out.length / tries) * 100).toFixed(1)}%）`,
);
const sizes = {};
const styles = {};
for (const p of out) {
  sizes[p.colors.length] = (sizes[p.colors.length] || 0) + 1;
  styles[p.style] = (styles[p.style] || 0) + 1;
}
console.log("色数分布：", JSON.stringify(sizes));
console.log("风格分布：", JSON.stringify(styles));
console.log("前 5 组示例：");
for (const p of out.slice(0, 5)) console.log(`  [${p.style}] ` + p.colors.join(" "));

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`写入 ${OUT}`);
