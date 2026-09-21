/**
 * 首页配色墙的数据自检。
 *
 *   node scripts/check-palettes.mjs
 *
 * 校验项：
 *   1. id 唯一、colors 长度 4–5、全部是合法的大写 `#RRGGBB`
 *   2. **组内两两颜色分得开** —— 逐通道差全 ≤14 的两个色算「分不开」。
 *      这条是为了排除「同色系明暗阶梯」式的伪方案：五个颜色摆一起像一条渐变，
 *      当成一组配色方案没有任何信息量。
 *   3. **组内有明度跨度** —— L* 极差 ≥30。一组里全是中间调的糊色，缩略图上会糊成一片。
 *   4. **跨组近似重复** —— 两组（按明度排序后）逐位颜色都 ≤14 就算重复。
 *      这条肉眼看不出来，是写这个脚本的主要原因（`color-duos.ts` 里记过同类的坑：
 *      曾用「逐通道差 ≤14」捞出 2 组、放到 ≤18 又捞出 4 组）。
 *   5. 每个 `name` 都出现在 `src/lib/i18n/en.palettes.ts` 里（防漏翻）
 *   6. 每个 `tags` 值都在 `PALETTE_TAGS` 里，且每个标签至少被用到一次
 *
 * 色值一律用项目自己的 `src/lib/color.ts` 算，不另写一份公式 —— 界面侧将来若拿
 * 同一个色值做判定，两边必须同源（`gen-color-duos.mjs` 的注释里记过这个坑）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CURATED_PALETTES, PALETTE_TAGS } from "../src/lib/colora-palettes.ts";
import { hexToRgb, rgbToLab } from "../src/lib/color.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * 词典文件。**要全部列上**：一个 key 只要出现在其中任意一份里，`t()` 就能取到值
 * （`en.ts` 是 `{ ...core, ...canvas, ...palettes }`）。只查 `en.palettes.ts` 会误报
 * 「霓虹」这种「别处已经定义过、这里刻意不重复」的词。
 */
const DICT_FILES = [
  "src/lib/i18n/en.ts",
  "src/lib/i18n/en.canvas.ts",
  "src/lib/i18n/en.palettes.ts",
];

/** 逐通道差全 ≤ 这个值 → 两个颜色「分不开」。口径来自 `color-duos.ts` 的注释。 */
const NEAR = 14;
/**
 * 组内 L* 极差下限。
 *
 * 柔和系（pastel）单独放一条更低的线：那个标签的定义就是「高明度低饱和」，
 * 用 30 去卡等于逼每组都塞一个深色进去，反而毁掉它。
 */
const MIN_SPREAD = 30;
const MIN_SPREAD_PASTEL = 12;

const problems = [];

function fail(message) {
  problems.push(message);
}

const rgbOf = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b];
};
const maxChannelDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const lstar = (hex) => rgbToLab(hexToRgb(hex)).l;

// ── 1. 基本字段 ──
const ids = new Map();
const HEX = /^#[0-9A-F]{6}$/;

for (const p of CURATED_PALETTES) {
  if (ids.has(p.id)) fail(`id 重复：${p.id}（也出现在 ${ids.get(p.id)}）`);
  else ids.set(p.id, p.name);

  if (p.colors.length < 4 || p.colors.length > 5) {
    fail(`${p.name}：颜色数 ${p.colors.length}，应为 4–5`);
  }
  for (const c of p.colors) {
    if (!HEX.test(c)) fail(`${p.name}：${JSON.stringify(c)} 不是大写 #RRGGBB`);
  }
  if (p.tags.length === 0) fail(`${p.name}：没有标签`);
  for (const tag of p.tags) {
    if (!PALETTE_TAGS.some((t) => t.id === tag)) fail(`${p.name}：未知标签 ${tag}`);
  }
}

// ── 2 / 3. 组内 ──
for (const p of CURATED_PALETTES) {
  const rgbs = p.colors.map(rgbOf);
  for (let i = 0; i < rgbs.length; i++) {
    for (let j = i + 1; j < rgbs.length; j++) {
      const d = maxChannelDiff(rgbs[i], rgbs[j]);
      if (d <= NEAR) {
        fail(`${p.name}：${p.colors[i]} 与 ${p.colors[j]} 分不开（逐通道差最大 ${d}）`);
      }
    }
  }

  const ls = p.colors.map(lstar);
  const spread = Math.max(...ls) - Math.min(...ls);
  const floor = p.tags.includes("pastel") ? MIN_SPREAD_PASTEL : MIN_SPREAD;
  if (spread < floor) {
    fail(`${p.name}：明度跨度只有 ${spread.toFixed(1)}（要求 ≥${floor}）`);
  }
}

// ── 4. 跨组近似重复 ──
// 按 L* 排序后逐位比较，这样「同一组颜色换个顺序」也能被捞出来。
const keyed = CURATED_PALETTES.map((p) => ({
  p,
  sorted: [...p.colors].sort((a, b) => lstar(a) - lstar(b)).map(rgbOf),
}));

for (let i = 0; i < keyed.length; i++) {
  for (let j = i + 1; j < keyed.length; j++) {
    const a = keyed[i];
    const b = keyed[j];
    if (a.sorted.length !== b.sorted.length) continue;
    const diffs = a.sorted.map((rgb, k) => maxChannelDiff(rgb, b.sorted[k]));
    if (Math.max(...diffs) <= NEAR) {
      fail(
        `近似重复：「${a.p.name}」与「${b.p.name}」逐位色差最大仅 ${Math.max(...diffs)}` +
          `\n      ${a.p.colors.join(" ")}\n      ${b.p.colors.join(" ")}`,
      );
    }
  }
}

// ── 5. 词典覆盖 ──
const dictKeys = new Set();
for (const rel of DICT_FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const line of src.split("\n")) {
    // 带引号的 key 必须先判，否则下面的裸 key 分支会把 `"首页"` 连引号一起吞掉
    // （与 check-i18n.cjs 的 loadDictKeys 同一套判法）。
    const quoted = line.match(/^\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1\s*:\s*(?:["'`]|$)/);
    if (quoted) {
      dictKeys.add(quoted[2]);
      continue;
    }
    const bare = line.match(/^\s*([^\s:{}()[\].,"']+)\s*:\s*(?:["'`]|$)/);
    if (bare) dictKeys.add(bare[1]);
  }
}
for (const p of CURATED_PALETTES) {
  if (!dictKeys.has(p.name)) fail(`词典缺词条：${p.name}（查了 ${DICT_FILES.join(" / ")}）`);
}
for (const tag of PALETTE_TAGS) {
  if (!dictKeys.has(tag.label)) fail(`词典缺标签词条：${tag.label}`);
}

// ── 6. 标签使用情况 ──
for (const tag of PALETTE_TAGS) {
  const n = CURATED_PALETTES.filter((p) => p.tags.includes(tag.id)).length;
  if (n === 0) fail(`标签「${tag.label}」没有任何方案在用`);
}

// ── 报告 ──
const tagCount = PALETTE_TAGS.map(
  (t) => `${t.label} ${CURATED_PALETTES.filter((p) => p.tags.includes(t.id)).length}`,
).join("  ");

if (problems.length) {
  console.log(`❌ ${problems.length} 处问题（共 ${CURATED_PALETTES.length} 组）\n`);
  for (const p of problems) console.log(`   ${p}`);
  process.exit(1);
}

console.log(`✅ ${CURATED_PALETTES.length} 组配色全部通过自检`);
console.log(`   标签分布：${tagCount}`);
console.log(`   颜色数：${CURATED_PALETTES.reduce((n, p) => n + p.colors.length, 0)} 个`);
