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
  // 先等几何量测完：首次渲染用的是保守值（cols=1、默认行距），量测后才会切成 4 列。
  // 443 组的首次渲染比 120 组慢，固定 sleep 会拍到「9 张卡 + 一大片空白」。
  let counts = { rendered: 0 };
  for (let i = 0; i < 40; i++) {
    counts = await cdp.eval(`(() => {
      const cards = document.querySelectorAll('[data-palette-card]');
      const grid = cards[0]?.parentElement;
      return {
        rendered: cards.length,
        gridChildren: grid ? grid.children.length : 0,
        gridHeight: grid ? Math.round(grid.getBoundingClientRect().height) : 0,
      };
    })()`);
    if (counts.rendered > 20) break;
    await sleep(250);
  }
  check(
    "虚拟滚动生效（只渲染视口附近的几行）",
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

  // 6) 卡片外观：无边框、色带圆角（照 coolors 重做后的契约）
  const shell = await cdp.eval(`(() => {
    const card = document.querySelector('[data-palette-card]');
    const cs = getComputedStyle(card);
    const band = card.firstElementChild;
    const bs = getComputedStyle(band);
    return {
      cardBorder: cs.borderTopWidth,
      cardBg: cs.backgroundColor,
      radius: parseFloat(bs.borderTopLeftRadius) || 0,
      bandH: Math.round(band.getBoundingClientRect().height),
    };
  })()`);
  check(
    "卡片无边框、色带圆角",
    shell.cardBorder === "0px" && shell.radius >= 8 && shell.bandH >= 80,
    `边框 ${shell.cardBorder}，色带圆角 ${shell.radius}px、高 ${shell.bandH}px`,
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
  // 等计数**真的**变化（最多 4s）。`useDeferredValue` + 180+ 组过滤 + 重开窗要点时间，
  // 固定 sleep 在慢机器上偶发读到旧值（实测遇到过 183 → 183 的假失败，
  // 同一次运行的旁证是网格高还停在未量测的 26214px）。
  const READ_COUNT = `(() => { const el = [...document.querySelectorAll('span')].find(s => /\\d+\\s*(组|palettes)/.test(s.textContent||'')); return el ? el.textContent.trim() : null; })()`;
  let afterSearch = countText;
  for (let i = 0; i < 20 && afterSearch === countText; i++) {
    await sleep(200);
    afterSearch = await cdp.eval(READ_COUNT);
  }
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

  // 8) 按颜色搜索：搜「绿」要出**绿色系的方案**，不只是名字里带「绿」的那几组。
  //    名字匹配最多命中五六组，颜色匹配会命中几十组 —— 用这个差值当判据。
  const colorSearched = await cdp.eval(`(() => {
    const input = document.querySelector('input[aria-label="搜索配色方案"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '绿');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(800);
  let afterColor = afterSearch;
  for (let i = 0; i < 20 && afterColor === afterSearch; i++) {
    await sleep(200);
    afterColor = await cdp.eval(READ_COUNT);
  }
  const colorCount = Number(/(\d+)/.exec(afterColor ?? "")?.[1] ?? 0);
  check(
    "按颜色搜索生效（搜「绿」出的远多于名字匹配）",
    colorSearched && colorCount > 20,
    `${countText} → ${afterColor}`,
  );
  // 清空搜索
  await cdp.eval(`(() => {
    const input = document.querySelector('input[aria-label="搜索配色方案"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(600);

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

  // 10) hover 色块 → 该色块放大 + 色号显示在它中间；且卡片高度不变
  const beforeH = await cdp.eval(
    `(() => document.querySelector('[data-palette-card]').getBoundingClientRect().height)()`,
  );
  // hover **第二个**色块，不是第一个 —— 上一步刚点过第一个，它的 ✓ 反馈会压住色号层
  // （那是卡片刻意的设计：刚复制的那一格让位给 ✓）。1.4s 内 hover 同一格必然读到 opacity 0。
  const swatchBox = await cdp.eval(`(() => {
    const sw = document.querySelector('[data-palette-card]').querySelectorAll('button')[1];
    const r = sw.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width };
  })()`);
  // hover 必须走 CDP 的真实鼠标事件：`el.click()` 只派发 click，`:hover` 样式不会生效。
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: swatchBox.x,
    y: swatchBox.y,
  });
  await sleep(500);
  const hoverState = await cdp.eval(`(() => {
    const sw = document.querySelector('[data-palette-card]').querySelectorAll('button')[1];
    const span = sw.querySelector('span');
    const label = span ? span.textContent.trim() : '';
    const cs = span ? getComputedStyle(span) : null;
    return {
      hex: /^#[0-9A-F]{6}$/i.test(label) ? label : null,
      opacity: cs ? parseFloat(cs.opacity) : 0,
      w: sw.getBoundingClientRect().width,
    };
  })()`);
  check(
    "hover 色块显示色号",
    hoverState.hex !== null && hoverState.opacity > 0.9,
    hoverState.hex ? `${hoverState.hex}（opacity ${hoverState.opacity}）` : "没读到 hex",
  );
  check(
    "hover 的色块被放大",
    hoverState.w > swatchBox.w * 1.2,
    `${Math.round(swatchBox.w)}px → ${Math.round(hoverState.w)}px`,
  );
  const afterH = await cdp.eval(
    `(() => document.querySelector('[data-palette-card]').getBoundingClientRect().height)()`,
  );
  check("hover 显示色号不改变卡片高度", Math.abs(beforeH - afterH) < 0.5, `${beforeH} → ${afterH}`);
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
  // 总数从工具栏文案里读，**别再硬编码** —— 配色库会长大（120 → 183 → …）。
  const TOTAL = Number(/(\d+)/.exec(countText ?? "")?.[1] ?? 120);
  const geomCheck = await cdp.eval(`(() => {
    const total = ${TOTAL};
    const grid = document.querySelector('[data-palette-card]').parentElement;
    const cards = [...grid.querySelectorAll('[data-palette-card]')];
    const styles = getComputedStyle(grid);
    const cols = styles.gridTemplateColumns.split(' ').filter(Boolean).length;
    const gap = parseFloat(styles.rowGap) || 0;
    const stride = cards[0].getBoundingClientRect().height + gap;
    const rows = Math.ceil(total / cols);
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
    `(() => document.querySelectorAll('[data-palette-card] > .ring-2').length)()`,
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
