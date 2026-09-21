/**
 * 首页配色墙的浏览器实测（CDP + headless Chrome，无第三方依赖）。
 *
 *   node scripts/verify-home.mjs [url]
 *
 * 为什么不用固定 sleep：dev 模式下 SSR HTML 很快返回，但 React hydration 要 6s 以上。
 * 在 hydration 完成前 `btn.click()` 是**彻底的空操作** —— DOM 看着正常、样式也在
 * （那都是 SSR 产物），但按钮上还没有 `__reactProps$`。所以一律轮询这个 key。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL_ = process.argv[2] ?? "http://localhost:8081/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const SHOT_DIR = path.resolve(".output/verify");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "colora-verify-"));
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,900",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return child;
}

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(300);
  }
  throw new Error("Chrome 调试端口没起来");
}

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

/**
 * 用真实鼠标事件点一个元素。
 *
 * Radix 的 TabsTrigger 只听 `mousedown`/`keydown`，`el.click()` 只派发 click，
 * 切不动 tab —— 必须走 CDP 的 Input.dispatchMouseEvent。
 */
async function clickByText(cdp, text) {
  const box = await cdp.eval(`(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim().includes(${JSON.stringify(text)}));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!box) return false;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
  }
  return true;
}

const chrome = launchChrome();
let cdp;
try {
  const wsUrl = await targetUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: URL_ });

  // 1) 等 hydration：首页不是默认工具，但侧栏按钮已经在了，用它当探针。
  let hydrated = false;
  for (let i = 0; i < 80; i++) {
    hydrated = await cdp.eval(
      `(() => { const b = document.querySelector('.colora-sidebar button'); return !!b && Object.keys(b).some(k => k.startsWith('__reactProps$')); })()`,
    );
    if (hydrated) break;
    await sleep(500);
  }
  check("hydration 完成", hydrated);
  if (!hydrated) throw new Error("hydration 超时，后续点击都会是空操作");

  // 2) 首屏默认就是配色墙（不需要点侧栏）
  const byDefault = await cdp.eval(
    `(() => document.querySelectorAll('[data-palette-card]').length)()`,
  );
  check("首屏默认就是配色墙", byDefault > 0, `默认渲染 ${byDefault} 张卡`);
  if (byDefault === 0) {
    // 兜底：万一默认工具又被改回去，至少点一下侧栏继续跑后面的检查
    await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('.colora-sidebar button')];
      btns.find(b => (b.textContent || '').trim() === '首页')?.click();
    })()`);
    await sleep(1200);
  }

  // 3) 卡片数量 vs 虚拟滚动
  const counts = await cdp.eval(`(() => {
    const cards = document.querySelectorAll('[data-palette-card]');
    const grid = cards[0]?.parentElement;
    return {
      rendered: cards.length,
      gridChildren: grid ? grid.children.length : 0,
      gridHeight: grid ? Math.round(grid.getBoundingClientRect().height) : 0,
      total: document.querySelectorAll('[data-palette-card]').length,
    };
  })()`);
  check(
    "虚拟滚动生效（渲染数远小于 120）",
    counts.rendered > 0 && counts.rendered < 60,
    `已渲染 ${counts.rendered} 张，网格高 ${counts.gridHeight}px`,
  );

  // 4) 卡片等高（虚拟滚动正确性的前提）
  const heights = await cdp.eval(`(() => {
    const hs = [...document.querySelectorAll('[data-palette-card]')].map(c => c.getBoundingClientRect().height);
    return { min: Math.min(...hs), max: Math.max(...hs), n: hs.length };
  })()`);
  check("所有卡片等高", heights.max - heights.min < 0.5, `min ${heights.min} / max ${heights.max}`);

  // 5) 计数文案
  const countText = await cdp.eval(
    `(() => { const el = [...document.querySelectorAll('span')].find(s => /\\d+\\s*(组|palettes)/.test(s.textContent||'')); return el ? el.textContent.trim() : null; })()`,
  );
  check("工具栏显示总数", countText !== null, countText ?? "");

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SHOT_DIR, "home-desktop.png"), Buffer.from(shot.data, "base64"));

  // 6) 融合条：色带下面那条连续渐变
  const bar = await cdp.eval(`(() => {
    const card = document.querySelector('[data-palette-card]');
    const el = card.querySelector('[aria-hidden="true"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, bg: cs.backgroundImage.slice(0, 60) };
  })()`);
  check(
    "色带下方有渐变融合条",
    !!bar && bar.h >= 3 && bar.bg.includes("linear-gradient"),
    bar ? `高 ${bar.h}px` : "没找到",
  );

  // 7) 搜索过滤
  const searched = await cdp.eval(`(() => {
    const input = document.querySelector('input[aria-label="搜索配色方案"]');
    if (!input) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '海');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(800);
  const afterSearch = await cdp.eval(`(() => {
    const el = [...document.querySelectorAll('span')].find(s => /\\d+\\s*(组|palettes)/.test(s.textContent||''));
    return el ? el.textContent.trim() : null;
  })()`);
  check(
    "搜索「海」后计数变化",
    searched === true && afterSearch !== countText,
    `${countText} → ${afterSearch}`,
  );

  // 搜索时滚动位置应归零
  const scrolledTop = await cdp.eval(
    `(() => { const s = document.querySelector('.colora-surface-card'); return s ? s.scrollTop : window.scrollY; })()`,
  );
  check("筛选后滚动位置归零", scrolledTop === 0, `scrollTop=${scrolledTop}`);

  // 清空搜索
  await cdp.eval(`(() => {
    const input = document.querySelector('input[aria-label="搜索配色方案"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(600);

  // 8) 标签筛选
  const tagClicked = await cdp.eval(`(() => {
    const chip = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '霓虹');
    if (!chip) return false;
    chip.click();
    return true;
  })()`);
  await sleep(700);
  const afterTag = await cdp.eval(`(() => {
    const el = [...document.querySelectorAll('span')].find(s => /\\d+\\s*(组|palettes)/.test(s.textContent||''));
    return el ? el.textContent.trim() : null;
  })()`);
  check("标签筛选生效", tagClicked && afterTag !== countText, `→ ${afterTag}`);
  // 复位
  await cdp.eval(`(() => {
    const chip = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '霓虹');
    chip?.click();
  })()`);
  await sleep(700);

  // 9) 点色块复制 → 出现 ✓ 反馈
  const copied = await cdp.eval(`(() => {
    const card = document.querySelector('[data-palette-card]');
    const swatch = card?.querySelector('button');
    if (!swatch) return false;
    swatch.click();
    return true;
  })()`);
  await sleep(250);
  const hasCheck = await cdp.eval(
    `(() => !!document.querySelector('[data-palette-card] svg.lucide-check'))()`,
  );
  check("点色块后出现复制反馈", copied && hasCheck);

  // 10) 「查看色号」揭示层，且卡片高度不变
  const beforeH = await cdp.eval(
    `(() => document.querySelector('[data-palette-card]').getBoundingClientRect().height)()`,
  );
  const revealed = await cdp.eval(`(() => {
    const card = document.querySelector('[data-palette-card]');
    const btn = [...card.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('色号'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(250);
  const hexShown = await cdp.eval(
    `(() => { const c = document.querySelector('[data-palette-card]'); return /#[0-9A-F]{6}/i.test(c.textContent || ''); })()`,
  );
  const afterH = await cdp.eval(
    `(() => document.querySelector('[data-palette-card]').getBoundingClientRect().height)()`,
  );
  check("色号揭示层显示 hex", revealed && hexShown);
  check("揭示色号不改变卡片高度", Math.abs(beforeH - afterH) < 0.5, `${beforeH} → ${afterH}`);
  const shotHex = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(SHOT_DIR, "home-hex-revealed.png"),
    Buffer.from(shotHex.data, "base64"),
  );

  // 11) 未登录点收藏 → 提示
  await cdp.eval(`(() => {
    const card = document.querySelector('[data-palette-card]');
    const btn = [...card.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('收藏'));
    btn?.click();
  })()`);
  await sleep(900);
  const toast = await cdp.eval(`(() => document.body.innerText.includes('请先登录'))()`);
  check("未登录收藏会弹登录提示", toast);

  // 12) 滚到底部不露白：网格总高应等于 行数 × 行距 - gap
  const geomCheck = await cdp.eval(`(() => {
    const grid = document.querySelector('[data-palette-card]').parentElement;
    const cards = [...grid.querySelectorAll('[data-palette-card]')];
    const styles = getComputedStyle(grid);
    const cols = styles.gridTemplateColumns.split(' ').filter(Boolean).length;
    const gap = parseFloat(styles.rowGap) || 0;
    const stride = cards[0].getBoundingClientRect().height + gap;
    const rows = Math.ceil(120 / cols);
    return { expected: Math.round(rows * stride - gap), actual: Math.round(grid.getBoundingClientRect().height), cols, rows };
  })()`);
  check(
    "网格总高与不虚拟化时一致",
    Math.abs(geomCheck.expected - geomCheck.actual) <= 1,
    `${geomCheck.cols} 列 × ${geomCheck.rows} 行：期望 ${geomCheck.expected} / 实际 ${geomCheck.actual}`,
  );

  // 滚到底再看一眼
  await cdp.eval(`(() => {
    const s = document.querySelector('.colora-surface-card');
    if (s) s.scrollTop = s.scrollHeight; else window.scrollTo(0, document.body.scrollHeight);
  })()`);
  await sleep(600);
  const bottomInfo = await cdp.eval(`(() => {
    const grid = document.querySelector('[data-palette-card]').parentElement;
    const gridBottom = grid.getBoundingClientRect().bottom;
    const s = document.querySelector('.colora-surface-card');
    const boxBottom = (s ?? document.documentElement).getBoundingClientRect().bottom;
    return { gapBelow: Math.round(boxBottom - gridBottom), rendered: document.querySelectorAll('[data-palette-card]').length };
  })()`);
  check(
    "滚到底部没有多余空白",
    bottomInfo.gapBelow >= 0 && bottomInfo.gapBelow < 120,
    `底部间距 ${bottomInfo.gapBelow}px，仍渲染 ${bottomInfo.rendered} 张`,
  );

  // 13) 随机跳转
  await cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'') === '随机看一组');
    btn?.click();
  })()`);
  await sleep(700);
  const highlighted = await cdp.eval(
    `(() => document.querySelectorAll('[data-palette-card].ring-1').length)()`,
  );
  check("随机跳转有且只有一张高亮", highlighted === 1, `高亮 ${highlighted} 张`);

  const shot4 = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SHOT_DIR, "home-random-jump.png"), Buffer.from(shot4.data, "base64"));

  // 14) 移动端断点
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(1200);
  const mobile = await cdp.eval(`(() => {
    const grid = document.querySelector('[data-palette-card]').parentElement;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    const first = document.querySelector('[data-palette-card]').getBoundingClientRect();
    return { cols, width: Math.round(first.width) };
  })()`);
  check(
    "移动端降为 1 列且不塌",
    mobile.cols === 1 && mobile.width > 200,
    `${mobile.cols} 列，卡宽 ${mobile.width}px`,
  );
  const shot2 = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SHOT_DIR, "home-mobile.png"), Buffer.from(shot2.data, "base64"));

  await cdp.send("Emulation.clearDeviceMetricsOverride");

  // 15) 回归：对比度工具（虚拟滚动迁移后行为应不变）
  await cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('.colora-sidebar button')];
    btns.find(b => (b.textContent || '').trim().includes('对比度'))?.click();
  })()`);
  await sleep(1500);
  const contrast = await clickByText(cdp, "配色组合");
  await sleep(2000);
  const duoInfo = await cdp.eval(`(() => {
    const cards = document.querySelectorAll('[data-duo-card]');
    const grid = cards[0]?.parentElement;
    if (!grid) {
      return {
        debug: [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean).slice(0, 40),
      };
    }
    const styles = getComputedStyle(grid);
    const cols = styles.gridTemplateColumns.split(' ').filter(Boolean).length;
    const gap = parseFloat(styles.rowGap) || 0;
    const stride = cards[0].getBoundingClientRect().height + gap;
    const total = 173;
    const rows = Math.ceil(total / cols);
    return {
      rendered: cards.length,
      cols,
      expected: Math.round(rows * stride - gap),
      actual: Math.round(grid.getBoundingClientRect().height),
    };
  })()`);
  check(
    "对比度工具虚拟滚动仍正确（迁移无回归）",
    contrast && duoInfo && duoInfo.rendered > 0 && Math.abs(duoInfo.expected - duoInfo.actual) <= 1,
    duoInfo
      ? duoInfo.rendered
        ? `渲染 ${duoInfo.rendered} 张，网格高 期望 ${duoInfo.expected} / 实际 ${duoInfo.actual}`
        : `没找到网格，页面上的按钮：${JSON.stringify(duoInfo.debug)}`
      : "没找到网格",
  );
  const shot3 = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SHOT_DIR, "contrast-duos.png"), Buffer.from(shot3.data, "base64"));
} finally {
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
console.log(`截图在 ${SHOT_DIR}`);
process.exit(failed.length ? 1 : 0);
