/**
 * 首页配色墙的数据自检。
 *
 *   node scripts/check-palettes.mjs
 *
 * 校验项：
 *   1. id 唯一、colors 长度 3–10、全部是合法的大写 `#RRGGBB`
 *   2. **组内色相要散开** —— 非中性色（LCH 彩度 ≥10，见 `NEUTRAL_C`）之间，色相角的
 *      **环形**最大差必须 ≥60°。这条挡的是「同一色相的深→浅阶梯」式伪方案：那种方案
 *      摆进配色墙就是一条渐变，一组和一百组长得一样。
 *
 *      ⚠️ 旧版这里查的是「组内两两颜色逐通道差 ≤14 算分不开」。那条口径本身没错，
 *      但它和下面的明度跨度一夹，**恰好只剩「同色系明暗阶梯」能同时满足两条** ——
 *      实测把 120 组全逼成了一个模子（`PaletteCard` 里那段「刻意不做成五等分」
 *      的注释也是同一个思路下的产物）。已废弃，换成色相口径。
 *   3. **组内有明度跨度** —— L* 极差 ≥25（柔和系 ≥10）。一组全是中间调的糊色，
 *      缩略图上会糊成一片。整组基本是中性色（非中性色 <2 个）时这条提到 ≥40：
 *      没有色相可用，只能靠明度把方案撑起来。
 *   4. **跨组近似重复** —— 两组（按明度排序后）逐位颜色都 ≤14 就算重复。
 *      这条肉眼看不出来，是写这个脚本的主要原因（`color-duos.ts` 里记过同类的坑：
 *      曾用「逐通道差 ≤14」捞出 2 组、放到 ≤18 又捞出 4 组）。
 *      **两组颜色数不同时自动跳过** —— 3–8 色的组合天然不会互相误判。
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
import { hexToRgb, rgbToHsl, rgbToLab } from "../src/lib/color.ts";

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
 * 用 25 去卡等于逼每组都塞一个深色进去，反而毁掉它。实测 coolors 的 pastel 方案
 * 跨度只有 11.1（`#CDB4DB → #BDE0FE`），所以线放在 10。
 */
const MIN_SPREAD = 25;
const MIN_SPREAD_PASTEL = 10;
/**
 * 彩度低于这个值算中性色（黑 / 白 / 灰 / 米 / 纸白），不参与色相统计。
 *
 * ⚠️ 这里用 **LCH 的彩度 C** 而不是 HSL 的饱和度 S。HSL 的 S 在高明度处会虚高 ——
 * 纸白 `#FAF8F4` 的 S 是 37%、米色 `#E8E4DC` 是 21%，都会被当成「彩色」，
 * 于是「素纸」这种纯灰阶方案的色相跨度算出 0°，被判成同色系阶梯。实测踩过。
 * 同一批颜色的 C 只有 2–5，一眼就是中性色。
 */
const NEUTRAL_C = 10;
/** 非中性色之间色相角最大差（环形）的下限。低于它 = 一组同色系明暗阶梯。 */
const MIN_HUE_SPAN = 60;
/**
 * 窄色相方案的豁免门槛：**色数 ≥6 就放行**。
 *
 * 这条是给 coolors 那批精选方案开的（见 `colora-palettes.ts` 末尾的「精选」段）。
 * 同样是同色系，6 色以上是「一条完整色阶」（`#590D22 → #FFF0F3` 十级粉），
 * 5 色才是「五格渐变」—— 后者在 4 列并排的网格里最容易显得单调，前者不会。
 * 数据里现有那批手工方案仍然全部走 ≥60° 的色相判据，不受这条影响。
 */
const MIN_MANY_COLORS = 6;
/** 整组基本是中性色（非中性色 <2 个）时的明度跨度下限：没有色相可用，只能靠明度撑。 */
const MIN_SPREAD_NEUTRAL = 40;

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
const hslOf = (hex) => rgbToHsl(hexToRgb(hex));
/** LCH 彩度。判断「这个颜色看上去是不是彩色」用这个，不用 HSL 的饱和度（见 NEUTRAL_C）。 */
const chromaOf = (hex) => {
  const lab = rgbToLab(hexToRgb(hex));
  return Math.hypot(lab.a, lab.b);
};
/** 两个色相角之间的环形距离（0–180）。0° 与 350° 只差 10°，不是 350°。 */
const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ── 1. 基本字段 ──
const ids = new Map();
const HEX = /^#[0-9A-F]{6}$/;

for (const p of CURATED_PALETTES) {
  if (ids.has(p.id)) fail(`id 重复：${p.id}（也出现在 ${ids.get(p.id)}）`);
  else ids.set(p.id, p.name);

  if (p.colors.length < 3 || p.colors.length > 10) {
    fail(`${p.name}：颜色数 ${p.colors.length}，应为 3–10`);
  }
  for (const c of p.colors) {
    if (!HEX.test(c)) fail(`${p.name}：${JSON.stringify(c)} 不是大写 #RRGGBB`);
  }
  if (p.tags.length === 0) fail(`${p.name}：没有标签`);
  for (const tag of p.tags) {
    if (!PALETTE_TAGS.some((t) => t.id === tag)) fail(`${p.name}：未知标签 ${tag}`);
  }
}

// ── 2 / 3. 组内：色相要散开、明度要有跨度 ──
for (const p of CURATED_PALETTES) {
  const ls = p.colors.map(lstar);
  const spread = Math.max(...ls) - Math.min(...ls);
  const floor = p.tags.includes("pastel") ? MIN_SPREAD_PASTEL : MIN_SPREAD;
  if (spread < floor) {
    fail(`${p.name}：明度跨度只有 ${spread.toFixed(1)}（要求 ≥${floor}）`);
  }

  // 中性色（黑 / 白 / 灰 / 米）没有可用的色相，只拿非中性色两两比
  const hues = p.colors.filter((hex) => chromaOf(hex) >= NEUTRAL_C).map((hex) => hslOf(hex).h);

  if (hues.length >= 2) {
    let span = 0;
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) span = Math.max(span, hueDist(hues[i], hues[j]));
    }
    if (span < MIN_HUE_SPAN && p.colors.length < MIN_MANY_COLORS) {
      fail(
        `${p.name}：非中性色的色相全挤在 ${span.toFixed(0)}° 以内（要求 ≥${MIN_HUE_SPAN}°，` +
          `或色数 ≥${MIN_MANY_COLORS}）—— 这又是一条同色系明暗阶梯\n      ${p.colors.join(" ")}`,
      );
    }
  } else if (spread < MIN_SPREAD_NEUTRAL) {
    // 整组是灰阶 + 至多一个点缀色：没有色相可用，只能靠明度撑
    fail(
      `${p.name}：整组基本是中性色（非中性色只有 ${hues.length} 个），明度跨度却只有 ` +
        `${spread.toFixed(1)}（要求 ≥${MIN_SPREAD_NEUTRAL}）`,
    );
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
