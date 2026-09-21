/**
 * 生成一批「≥AA」的成对配色，追加进 src/lib/color-duos.ts。
 *
 *   node scripts/gen-color-duos.mjs                 # 默认加 72 组
 *   node scripts/gen-color-duos.mjs --count 40      # 加 40 组
 *   node scripts/gen-color-duos.mjs --seed 12345    # 换个种子，出一批不同的
 *   node scripts/gen-color-duos.mjs --dry           # 只报告，不写文件
 *
 * 结果**确定可复现**：同一个种子 + 同一份现有数据 → 同样的输出。跑之前先 commit，
 * 不满意就 `git checkout src/lib/color-duos.ts` 退回去。
 *
 * 两个坑，改这个脚本前先读：
 *
 * 1. **对比度必须用项目自己的 `src/lib/color.ts` 算**。数据里写着达标、界面运行时
 *    用另一个公式算出 4.49，那张卡就会被 `ratio >= 4.5` 静默筛掉。这里靠 Node 的
 *    类型擦除直接 import 那个 .ts（需要 Node ≥ 22.18 / 23，会打一条 ExperimentalWarning）。
 * 2. **AA 档目标取 5.0 而不是 4.5**。4.5 是判定边界，贴着它生成、8bit 取整后可能掉到
 *    4.49 被筛掉；5.0 留出余量，徽章读起来也整齐。
 *
 * 生成的三类刻意贴着 duo.alexpate.com 的用色习惯（别改着改着变成"另一个味"）：
 *   A 鲜艳中明度底 + 近白/近黑文字 —— 那个站最招牌的一类
 *   B 深底 + 鲜艳前景
 *   C 跨色系双鲜艳，色相差只取 60/90/120/150/180
 *     （**跳过 0 和 30**：那两档出来的是同色系明暗阶梯，一堆摆一起像"按色系排的"）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  contrastRatio,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  relativeLuminance,
} from "../src/lib/color.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "src/lib/color-duos.ts");
const MARKER = "export const COLOR_DUOS";
const MIN_RATIO = 4.5;

/** 每个家族给一组目标档位，**确定轮转**而不是随机取 —— 随机取会让低档位一边倒。
 *  高档位只有「深底」够得到：中明度鲜艳底配近白字最多也就 8:1 上下。 */
const TIERS_A = [5.0, 6.5, 8.0];
const TIERS_B = [8.0, 12.0, 16.0];
const TIERS_C = [5.0, 6.5, 8.0];
const HUE_GAPS = [60, 90, 120, 150, 180];

/** 近白 / 近黑文字锚点：原站用过的那批值，保持同一个味道。 */
const NEAR_WHITE = ["#FFFFFF", "#F7F8F7", "#FEF8F6", "#F9F9D2", "#F7EAD1", "#FCEBCD"];
const NEAR_BLACK = ["#000000", "#1A1A1A", "#101010", "#181818", "#0D0D0D"];

// ---------------------------------------------------------------- CLI

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : undefined;
};
const COUNT = Number(flag("count") ?? 72);
const SEED = Number(flag("seed") ?? 20260921);
const DRY = argv.includes("--dry");

// ---------------------------------------------------------------- 工具

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const L = (hex) => rgbToHsl(hexToRgb(hex)).l;
const S = (hex) => rgbToHsl(hexToRgb(hex)).s;
const lum = (hex) => relativeLuminance(hexToRgb(hex));

const hexOf = (h, s, l) =>
  rgbToHex(
    hslToRgb({
      h: ((h % 360) + 360) % 360,
      s: Math.max(0, Math.min(100, s)),
      l: Math.max(0, Math.min(100, l)),
    }),
  ).toUpperCase();

/**
 * 固定色相/饱和度，反解明度，让这个色对 other 的对比度刚好够到 target。
 * 对比度对明度单调：other 暗就取「够得到 target 的最暗」，other 亮就取最亮。
 */
function solveL(h, s, otherHex, target) {
  const otherIsDark = lum(otherHex) < 0.18;
  let lo = 0;
  let hi = 100;
  let best = null;
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    const hex = hexOf(h, s, mid);
    if (contrastRatio(hex, otherHex) >= target) {
      best = hex;
      if (otherIsDark) hi = mid;
      else lo = mid;
    } else if (otherIsDark) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/** 两个色是否「看着差不多」（逐通道最大差）。 */
function near(a, b, tol = 14) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b)) <= tol;
}

// ---------------------------------------------------------------- 读现有数据

const src = fs.readFileSync(FILE, "utf8");
const head = src.slice(0, src.indexOf(MARKER));
if (!head) throw new Error(`在 ${FILE} 里找不到 ${MARKER}`);

const PAIR = /\["(#[0-9A-Fa-f]{6})",\s*"(#[0-9A-Fa-f]{6})"\]/g;
const existing = [...src.matchAll(PAIR)].map((m) => [m[1].toUpperCase(), m[2].toUpperCase()]);
if (!existing.length) throw new Error("现有数据解析为空，格式可能变了");

const taken = new Set();
const fgUse = new Map();
for (const [bg, fg] of existing) {
  taken.add(`${bg}|${fg}`);
  taken.add(`${fg}|${bg}`); // 互换过的也算重复
  fgUse.set(fg, (fgUse.get(fg) || 0) + 1);
}

// ---------------------------------------------------------------- 生成

const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const out = [];
/** 背景色相桶，保证新的一批铺得散。 */
const buckets = new Map();
const bucketOf = (hex) => {
  const { h, s } = rgbToHsl(hexToRgb(hex));
  return s < 6 ? -1 : Math.floor(h / 30) % 12;
};

function tryPush(bg, fg, family) {
  if (!bg || !fg) return false;
  if (contrastRatio(fg, bg) < MIN_RATIO) return false;
  if (taken.has(`${bg}|${fg}`)) return false;
  if ((fgUse.get(fg) || 0) >= 3) return false; // 同一个前景别反复用
  const b = bucketOf(bg);
  if (b >= 0 && (buckets.get(b) || 0) >= 8) return false;
  // 跟已有的、以及**本批已生成的**都别撞脸 —— 只比 existing 的话，同一批里会长出孪生卡
  for (const [eb, ef] of existing) if (near(bg, eb) && near(fg, ef)) return false;
  for (const d of out) if (near(bg, d.bg) && near(fg, d.fg)) return false;

  taken.add(`${bg}|${fg}`);
  taken.add(`${fg}|${bg}`);
  fgUse.set(fg, (fgUse.get(fg) || 0) + 1);
  buckets.set(b, (buckets.get(b) || 0) + 1);
  out.push({ bg, fg, family, ratio: contrastRatio(fg, bg) });
  return true;
}

/** A 鲜艳中明度底 + 近白/近黑文字 */
function familyA(quota) {
  const whites = [
    ...new Set([...NEAR_WHITE, ...existing.map(([, f]) => f).filter((f) => lum(f) > 0.8)]),
  ];
  const blacks = [
    ...new Set([...NEAR_BLACK, ...existing.map(([, f]) => f).filter((f) => lum(f) < 0.03)]),
  ];
  let n = 0;
  for (let i = 0; i < 8000 && n < quota; i++) {
    const fg = pick(rnd() < 0.5 ? whites : blacks);
    const bg = solveL(Math.floor(rnd() * 360), 42 + rnd() * 44, fg, TIERS_A[n % TIERS_A.length]);
    if (!bg) continue;
    const bl = L(bg);
    if (bl < 16 || bl > 72 || S(bg) < 30) continue; // 得还是「中明度鲜艳底」
    if (tryPush(bg, fg, "A")) n++;
  }
}

/** B 深底 + 鲜艳前景 */
function familyB(quota) {
  let n = 0;
  for (let i = 0; i < 12000 && n < quota; i++) {
    const fg = hexOf(Math.floor(rnd() * 360), 58 + rnd() * 38, 48 + rnd() * 22);
    if (S(fg) < 45 || L(fg) < 40) continue;
    const bg = solveL(Math.floor(rnd() * 360), 26 + rnd() * 40, fg, TIERS_B[n % TIERS_B.length]);
    if (!bg) continue;
    const bl = L(bg);
    if (bl < 6 || bl > 32) continue; // 「深底」，但不收纯黑 —— 纯黑底配什么都是那一张脸
    if (L(fg) - bl < 25) continue;
    if (tryPush(bg, fg, "B")) n++;
  }
}

/** C 跨色系双鲜艳 */
function familyC(quota) {
  let n = 0;
  for (let i = 0; i < 60000 && n < quota; i++) {
    const h1 = Math.floor(rnd() * 360);
    const h2 = h1 + HUE_GAPS[n % HUE_GAPS.length] * (rnd() < 0.5 ? 1 : -1);
    const vividIsFg = rnd() < 0.5;
    const fg = hexOf(vividIsFg ? h1 : h2, 55 + rnd() * 40, 45 + rnd() * 22);
    if (S(fg) < 50) continue;
    const bg = solveL(vividIsFg ? h2 : h1, 45 + rnd() * 45, fg, TIERS_C[n % TIERS_C.length]);
    if (!bg) continue;
    const bl = L(bg);
    if (bl < 22 || bl > 72 || S(bg) < 38) continue; // 两个都要「鲜艳」，不能退化成近白/近黑
    if (Math.abs(L(fg) - bl) < 15) continue;
    if (tryPush(bg, fg, "C")) n++;
  }
}

// 先跑约束最紧的 C，再 B，最后 A 兜底补足 —— 反过来的话 A 会把配额吃光
familyC(Math.round(COUNT * 0.3));
familyB(Math.round(COUNT * 0.3));
familyA(COUNT - out.length);

if (!out.length) throw new Error("一组都没生成出来，检查约束或换个种子");

// ---------------------------------------------------------------- 洗牌 + 写回

const all = [...existing, ...out.map((d) => [d.bg, d.fg])];
const rnd2 = mulberry32(0x5eed1);
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(rnd2() * (i + 1));
  [all[i], all[j]] = [all[j], all[i]];
}

const body =
  "export const COLOR_DUOS: readonly (readonly [string, string])[] = [\n" +
  all.map(([bg, fg]) => `  ["${bg}", "${fg}"],`).join("\n") +
  "\n];\n";

if (DRY) {
  console.log("[dry] 没有写文件。");
} else {
  fs.writeFileSync(FILE, head + body);
}

// ---------------------------------------------------------------- 报告

const byFamily = {};
for (const d of out) byFamily[d.family] = (byFamily[d.family] || 0) + 1;
const ratios = all.map(([bg, fg]) => contrastRatio(fg, bg));
const pass = ratios.filter((r) => r >= MIN_RATIO);

console.log(
  `种子 ${SEED}，新增 ${out.length} 组（${Object.entries(byFamily)
    .map(([k, v]) => `${k} ${v}`)
    .join(" / ")}）`,
);
console.log(
  `新增对比度区间 ${Math.min(...out.map((d) => d.ratio)).toFixed(2)} – ${Math.max(...out.map((d) => d.ratio)).toFixed(2)}`,
);
console.log(
  `库总数 ${all.length}；展示（≥${MIN_RATIO}）${pass.length} —— AA ${pass.filter((r) => r < 7).length} / AAA ${pass.filter((r) => r >= 7).length}`,
);
console.log(`\n记得同步 ${path.relative(ROOT, FILE)} 头部注释里的数字。`);
