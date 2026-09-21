/**
 * i18n 残留中文自检。
 *
 * 判据：一个中文字符串 / JSX 文本，只要满足下面**任一条**就算已处理：
 *   1. 它被 `t(...)` 或 `translate(...)` 直接包裹（调用点的词典 key）
 *   2. 它本身出现在词典里（说明它是某个表里的 key，由渲染处 t() 取值）
 * 两者都不满足的，才是真正「漏翻、会直接显示给用户」的中文。
 *
 * 注释里的中文不算 —— 本项目刻意保留中文注释。词典文件自身跳过。
 * 同时检查 en.ts 与 en.canvas.ts 的**跨文件重复 key**（合并时会静默覆盖）。
 *
 * 用法: node check-i18n.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const CJK = /[一-鿿]/;
const DICT_FILES = [
  "src/lib/i18n/en.ts",
  "src/lib/i18n/en.canvas.ts",
  "src/lib/i18n/en.palettes.ts",
];
const SENTINEL = "";

/**
 * 把 JSX 里的顶层 `{...}` 表达式替换成哨兵，嵌套内容一并丢弃。
 * 不能用正则 —— `t("色相 {hue}° · 饱和度 {sat}%", { hue })` 这种嵌套括号
 * 会被非嵌套正则切碎，漏出 `° · 饱和度` 之类的伪片段。
 */
function stripJsxExprs(text) {
  let out = "";
  let depth = 0;
  for (const c of text) {
    if (c === "{") {
      depth++;
      if (depth === 1) out += SENTINEL;
      continue;
    }
    if (c === "}") {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) out += c;
  }
  return out;
}

/** 剥离注释，保留字符串与 JSX 文本，并保留换行以维持行号。 */
function stripComments(src) {
  let out = "";
  let mode = "code";
  let quote = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { mode = "str"; quote = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } i++; continue; }
    if (mode === "block") {
      if (c === "*" && n === "/") { mode = "code"; i += 2; continue; }
      if (c === "\n") out += c;
      i++; continue;
    }
    if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
    if (c === quote) { mode = "code"; out += c; i++; continue; }
    out += c; i++; continue;
  }
  return out;
}

/** 从词典文件里取出所有 key（带引号形式与裸标识符形式都认，含中文标识符）。 */
function loadDictKeys(file) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const keys = new Set();
  for (const line of src.split("\n")) {
    // 带引号的必须先判，否则下面的裸 key 分支会把 `"首页"` 连引号一起吞掉。
    const quoted = line.match(/^\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1\s*:\s*(?:["'`]|$)/);
    if (quoted) { keys.add(quoted[2]); continue; }
    // 裸 key 可能是中文标识符；末尾的 `(?:["'`]|$)` 是为了认下 prettier 折行的多行条目，
    // 同时避免把 `"Note: ..."` 这种「值里带冒号」的英文长句误当成 key。
    const bare = line.match(/^\s*([^\s:{}()[\].,"']+)\s*:\s*(?:["'`]|$)/);
    if (bare) keys.add(bare[1]);
  }
  return keys;
}

/** 收集所有 t(...) / translate(...) 调用里出现的字符串字面量。 */
function collectKeyArgs(src) {
  const keys = new Set();
  const callRe = /\b(?:t|translate)\s*\(/g;
  let m;
  while ((m = callRe.exec(src)) !== null) {
    let depth = 0;
    let seg = "";
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) break; }
      seg += c;
    }
    for (const sm of seg.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/gs)) keys.add(sm[2]);
  }
  return keys;
}

// ---- 词典：合并 + 跨文件重复检查 ----
const owner = new Map();
const dupes = [];
for (const file of DICT_FILES) {
  for (const key of loadDictKeys(file)) {
    if (owner.has(key)) dupes.push([key, owner.get(key), file]);
    else owner.set(key, file);
  }
}
if (dupes.length) {
  console.log("⚠️  词典跨文件重复 key（后者会静默覆盖前者）：");
  for (const [key, a, b] of dupes) console.log(`   ${JSON.stringify(key)}  ${a} ↔ ${b}`);
  console.log("");
}
const DICT = new Set(owner.keys());

// ---- 扫描源码 ----
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})("src");

const findings = [];
for (const f of files) {
  if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
  const src = stripComments(fs.readFileSync(f, "utf8"));
  const callKeys = collectKeyArgs(src);
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;
  const hits = [];

  const known = (s) => callKeys.has(s) || DICT.has(s);
  // 扫描器会被 `=>`、比较运算符、不成对的引号骗到，把代码碎片当成文案。
  // 这类伪匹配里必然出现 ASCII 代码符号，而中文 UI 文案不会（全角括号不算）。
  const isArtifact = (s) => /[;()"'={}\n]/.test(s);

  for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/gs)) {
    const s = m[2];
    if (!CJK.test(s) || known(s) || isArtifact(s)) continue;
    hits.push([lineOf(m.index), s]);
  }

  // JSX 文本节点。含 `{...}` 插值的要**先剥掉插值再判**，否则
  // 「团块 X {x}%」这种「中文 + 插值」会被整段跳过（这里曾漏掉 4 处 mesh 标签）。
  for (const m of src.matchAll(/>([^<>]*?)</gs)) {
    const withoutExpr = stripJsxExprs(m[1]);
    if (!CJK.test(withoutExpr)) continue;
    for (const part of withoutExpr.split(SENTINEL)) {
      const s = part.replace(/\s+/g, " ").trim();
      if (!s || !CJK.test(s) || known(s) || isArtifact(s)) continue;
      hits.push([lineOf(m.index), s]);
    }
  }

  if (hits.length) findings.push([f, hits]);
}

const stats = DICT_FILES.map((f) => `${path.basename(f)} ${loadDictKeys(f).size} 条`).join("，");
if (!findings.length) {
  console.log(`词典：${stats}，跨文件重复 ${dupes.length} 条`);
  console.log(`✅ 没有发现漏翻的中文（合计 ${DICT.size} 条）`);
  process.exit(dupes.length ? 1 : 0);
}

let total = 0;
for (const [f, hits] of findings) {
  console.log(`\n${f}`);
  for (const [line, s] of hits.sort((a, b) => a[0] - b[0])) {
    console.log(`  ${line}\t${JSON.stringify(s)}`);
    total++;
  }
}
console.log(`\n共 ${total} 处漏翻（词典 ${DICT.size} 条，跨文件重复 ${dupes.length} 条）`);
process.exit(1);