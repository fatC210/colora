/**
 * 词典孤儿词条自检（`check-i18n.cjs` 的反方向）。
 *
 *   node scripts/check-i18n-orphans.mjs
 *
 * `check-i18n.cjs` 查的是「源码里的中文有没有进词典」（漏翻）；
 * 这个脚本查反方向：**词典里有、但源码里再也没有人用的 key**。
 * 删功能时最容易留下这种东西 —— 比如首页 hero 和工具卡片网格被移除后，
 * 它们那几句文案就没人引用了，词典白白膨胀。
 *
 * ## 判据（刻意保守）
 *
 * 一个 key 算孤儿，当且仅当它的字符串**作为完整的字符串字面量**在 `src/` 里
 * （i18n 目录除外）一次都没出现 —— 也就是没有任何 `"key"` / `'key'` / `` `key` ``。
 *
 * 为什么要按**字面量**匹配而不是 `text.includes(key)`：子串匹配会把短 key 误判成「还在用」。
 * 例如 `"颜色"` 是 `"应用颜色：{name}"` 的子串，`"调配、混合、预览、导出，一站式完成配色工作"`
 * 是路由 meta 里那条更长的 key 的前缀 —— 用 `includes` 它们永远查不出来（实测漏了 5 条）。
 *
 * 为什么要按「字面量」而不是「是否被 t() 包裹」：词典的 key 大量是**动态**取的 ——
 * `t(tool.label)`（`Sidebar.tsx` 的 TOOLS）、`t(tag.label)`（`PALETTE_TAGS`）、
 * `t(entry.name)`（配色方案名）。这些 key 只以字面量形式躺在数据表里，从来不出现在
 * `t("…")` 里。用后者判定会把整张数据表误报成孤儿。
 *
 * 代价是**假阴性**：只在注释里出现过的 key 会被当成「还在用」而漏报。这个方向是安全的 ——
 * 漏报只是少删几条，误删会让界面直接显示中文原文。
 *
 * 用法：先看输出，确认某条确实没人用了再手工删。**不要**让脚本自动删。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DICT_FILES = [
  "src/lib/i18n/en.ts",
  "src/lib/i18n/en.canvas.ts",
  "src/lib/i18n/en.palettes.ts",
];

/** 与 check-i18n.cjs 的 loadDictKeys 同一套判法。 */
function loadDictKeys(file) {
  const keys = [];
  for (const line of fs.readFileSync(path.join(ROOT, file), "utf8").split("\n")) {
    // 带引号的 key 必须先判，否则下面的裸 key 分支会把 `"首页"` 连引号一起吞掉
    const quoted = line.match(/^\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1\s*:\s*(?:["'`]|$)/);
    if (quoted) {
      keys.push(quoted[2]);
      continue;
    }
    const bare = line.match(/^\s*([^\s:{}()[\].,"']+)\s*:\s*(?:["'`]|$)/);
    if (bare) keys.push(bare[1]);
  }
  return keys;
}

/**
 * 剥离注释（保留字符串与换行）。从 `check-i18n.cjs` 移植。
 *
 * **必须做这一步**：提取字符串字面量靠的是「成对引号」，而注释里一个撇号
 * （`// don't`）就能让配对整体错位，把中间大段真实字面量吞掉 —— 结果是**误报孤儿**，
 * 而误报的方向很危险（删掉还在用的 key，界面会直接显示中文原文）。
 */
function stripComments(src) {
  let out = "";
  let mode = "code";
  let quote = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") {
        mode = "line";
        i += 2;
        continue;
      }
      if (c === "/" && n === "*") {
        mode = "block";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        mode = "str";
        quote = c;
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        out += c;
      }
      i++;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && n === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c;
      i++;
      continue;
    }
    if (c === "\\") {
      out += c + (n ?? "");
      i += 2;
      continue;
    }
    if (c === quote) {
      mode = "code";
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
    continue;
  }
  return out;
}

// 收集 src 下（i18n 目录除外）出现过的**全部字符串字面量**。按字面量精确匹配，
// 不用子串匹配 —— 理由见文件头的注释。
const literals = new Set();
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n") continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const text = stripComments(fs.readFileSync(p, "utf8"));
      for (const m of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/gs)) literals.add(m[2]);
    }
  }
})(path.join(ROOT, "src"));

const orphans = [];
for (const dict of DICT_FILES) {
  for (const key of loadDictKeys(dict)) {
    if (!literals.has(key)) orphans.push({ dict, key });
  }
}

if (orphans.length === 0) {
  console.log("✅ 没有孤儿词条");
  process.exit(0);
}

console.log(`发现 ${orphans.length} 条孤儿词条（词典里有、src/ 里再没人引用）：\n`);
for (const dict of DICT_FILES) {
  const group = orphans.filter((o) => o.dict === dict);
  if (group.length === 0) continue;
  console.log(`${dict}  ${group.length} 条`);
  for (const o of group) console.log(`   ${JSON.stringify(o.key)}`);
  console.log("");
}
console.log("确认没人用之后再手工删 —— 这个脚本不自动改文件。");
process.exit(1);
