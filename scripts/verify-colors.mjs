/**
 * 颜色库工具的浏览器实测（CDP + headless Chrome，无第三方依赖）。
 *
 *   node scripts/verify-colors.mjs [url]
 *
 * 和 `verify-home.mjs` 同一套骨架。两个坑沿用那边的结论：
 * - **等 hydration 才点得动**（轮询 `__reactProps$`），dev 模式下 React 要 6s 以上；
 * - **切工具要点侧栏按钮**，而且 Radix 那类组件只认真实鼠标事件。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL_ = process.argv[2] ?? "http://localhost:8081/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9340;
const SHOT_DIR = path.resolve(".output/verify");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "colora-colors-"))}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,900",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expression);
    return r.result.value;
  }
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
};

/** 真实鼠标点一下坐标（Radix / 侧栏都要这个）。 */
async function clickAt(cdp, box) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
  }
}

/** 按文本找按钮并点它。 */
async function clickButtonByText(cdp, text) {
  const box = await cdp.eval(`(() => {
    const el = [...document.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === ${JSON.stringify(text)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (box) await clickAt(cdp, box);
  return !!box;
}

try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      wsUrl = (await res.json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    if (!wsUrl) await sleep(300);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: URL_ });

  // 1) 等 hydration
  let hydrated = false;
  for (let i = 0; i < 80; i++) {
    hydrated = await cdp.eval(
      `(() => { const b = document.querySelector('.colora-sidebar button'); return !!b && Object.keys(b).some(k => k.startsWith('__reactProps$')); })()`,
    );
    if (hydrated) break;
    await sleep(500);
  }
  check("hydration 完成", hydrated);
  if (!hydrated) throw new Error("hydration 超时");

  // 2) 侧栏有「颜色库」入口
  const hasEntry = await cdp.eval(
    `(() => [...document.querySelectorAll('.colora-sidebar button')].some(b => (b.textContent||'').trim() === '颜色库'))()`,
  );
  check("侧栏有「颜色库」入口", hasEntry);

  // 3) 点进去
  await clickButtonByText(cdp, "颜色库");
  await sleep(1500);

  // 等虚拟滚动的几何量测完（首次渲染用的是保守值，会先渲染很少几张）
  let grid = { rendered: 0, cols: 0 };
  for (let i = 0; i < 40; i++) {
    grid = await cdp.eval(`(() => {
      const cards = document.querySelectorAll('[data-color-card]');
      const g = cards[0]?.parentElement;
      const cols = g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      return { rendered: cards.length, cols };
    })()`);
    if (grid.rendered > 20 && grid.cols > 1) break;
    await sleep(250);
  }
  check(
    "网格渲染 + 虚拟滚动生效（远小于 484）",
    grid.rendered > 0 && grid.rendered < 200,
    `已渲染 ${grid.rendered} 张，${grid.cols} 列`,
  );

  // 4) 卡片等高（虚拟滚动契约）
  const heights = await cdp.eval(`(() => {
    const hs = [...document.querySelectorAll('[data-color-card]')].map(c => c.getBoundingClientRect().height);
    return { min: Math.min(...hs), max: Math.max(...hs) };
  })()`);
  check("色块等高", heights.max - heights.min < 0.5, `min ${heights.min} / max ${heights.max}`);

  const shotGrid = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SHOT_DIR, "colors-grid.png"), Buffer.from(shotGrid.data, "base64"));

  // 5) 点色块 → 复制（出现 ✓ 反馈），**不跳转**
  const firstHex = await cdp.eval(
    `(() => { const c = document.querySelector('[data-color-card]'); return c ? c.textContent.trim() : null; })()`,
  );
  const cardBox = await cdp.eval(`(() => {
    const c = document.querySelector('[data-color-card]');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  await clickAt(cdp, cardBox);
  await sleep(350);

  const afterClick = await cdp.eval(`(() => {
    const cards = document.querySelectorAll('[data-color-card]');
    return {
      gridStillThere: cards.length > 0,
      checkIcons: document.querySelectorAll('[data-color-card] svg.lucide-check').length,
    };
  })()`);
  check(
    "点色块后出现复制反馈",
    afterClick.checkIcons >= 1,
    `色号 ${firstHex}，✓ ${afterClick.checkIcons} 个`,
  );
  check("点色块不跳转（网格还在）", afterClick.gridStillThere);

  const shotCopied = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(SHOT_DIR, "colors-copied.png"),
    Buffer.from(shotCopied.data, "base64"),
  );

  // 6) 色系筛选（右栏）
  const filtered = await cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '绿');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (filtered) {
    await clickAt(cdp, filtered);
    await sleep(800);
    const countText = await cdp.eval(
      `(() => { const el = [...document.querySelectorAll('span')].find(s => /个颜色/.test(s.textContent||'')); return el ? el.textContent.trim() : null; })()`,
    );
    check("色系筛选生效", !!countText && !countText.includes("484"), countText ?? "没找到计数");
  } else {
    check("色系筛选生效", false, "右栏没找到「绿」按钮");
  }
} finally {
  chrome.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
console.log(`截图在 ${SHOT_DIR}`);
process.exit(failed.length ? 1 : 0);
