// 沿路径弧长的渐变：颜色属于路径本身，而不是一条不可见的坐标轴。
// 参考 brainfunctioncollapse.com/projects/gradients 的理念：
// "colour belongs to the drawing" —— 色标沿绘画的弧长分布，可拖动、可微调、可键入精确百分比。
//
// 本模块为 CanvasTool 使用的纯函数库（沿路径弧长的渐变渲染）：
//   - 弧长数学（累计弧长、按弧长取点、把任意点投影回路径百分比）
//   - 在指定百分比处按插值空间（rgb/lab/lch）求色
//   - 沿路径分段描边：canvas 逐小段 stroke + SVG 逐小段 <line>
//
// 渲染思路：把路径细分为密折线，逐小段以"段中点弧长百分比"处的插值色描边，
// lineCap=round 让相邻段在关节处自然衔接；混色（multiply）模式下由调用方
// 用离屏 canvas 先在 source-over 内画完整条笔画再贴回，避免段间接缝变暗。

import { interpolateAlpha, interpolateStop, type InterpSpace } from "./color";

export type Point = { x: number; y: number };

/** 路径色标：pos 为沿弧长的百分比 0..100；alpha 为透明度百分比 0..100（100=不透明） */
export type PathStop = { id: string; hex: string; pos: number; alpha: number };

export type { InterpSpace };

export type ShapeType =
  | "circle"
  | "roundedRect"
  | "rect"
  | "diamond"
  | "arrow"
  | "triangle"
  | "pentagon"
  | "star"
  | "heart"
  | "wave"
  | "curve"
  | "spiral";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** 累计弧长数组，length = points.length，首项为 0 */
export function arcLengths(points: Point[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distance(points[i - 1], points[i]));
  return cum;
}

export function totalLength(points: Point[]): number {
  return arcLengths(points).at(-1) ?? 0;
}

export const lengthToPercent = (len: number, total: number) =>
  total > 0 ? clamp((len / total) * 100, 0, 100) : 0;
export const percentToLength = (percent: number, total: number) =>
  (clamp(percent, 0, 100) / 100) * total;

/** 沿路径走到指定弧长的坐标；len 超出总长时夹到端点 */
export function pointAtLength(points: Point[], len: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const cum = arcLengths(points);
  const total = cum.at(-1) ?? 0;
  if (len <= 0) return { ...points[0] };
  if (len >= total) return { ...points[points.length - 1] };
  // 二分找所在段
  let lo = 0,
    hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= len) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen > 0 ? (len - cum[lo]) / segLen : 0;
  const a = points[lo],
    b = points[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 把任意点投影到路径，返回最近点的弧长百分比（用于拖动色标、点击新增色标） */
export function nearestPercentOnPath(points: Point[], p: Point): number {
  if (points.length < 2) return 0;
  const cum = arcLengths(points);
  const total = cum.at(-1) ?? 0;
  let bestLen = 0,
    bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
    t = clamp(t, 0, 1);
    const px = a.x + dx * t,
      py = a.y + dy * t;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bestDist) {
      bestDist = d;
      bestLen = cum[i] + Math.hypot(px - a.x, py - a.y);
    }
  }
  return lengthToPercent(bestLen, total);
}

/** 把 stops 按 pos 排序后在指定百分比处插值出颜色；超出首尾夹取端点色。返回 rgba() 字符串（含 alpha） */
export function colorAtPercent(stops: PathStop[], percent: number, space: InterpSpace): string {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (sorted.length === 0) return "rgba(0,0,0,1)";
  if (sorted.length === 1) return hexAlpha(sorted[0]);
  const p = clamp(percent, 0, 100);
  if (p <= sorted[0].pos) return hexAlpha(sorted[0]);
  if (p >= sorted[sorted.length - 1].pos) return hexAlpha(sorted[sorted.length - 1]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i],
      b = sorted[i + 1];
    if (p >= a.pos && p <= b.pos) {
      const span = b.pos - a.pos;
      const t = span > 0 ? (p - a.pos) / span : 0;
      return interpolateAlpha(
        { hex: a.hex, alpha: a.alpha },
        { hex: b.hex, alpha: b.alpha },
        t,
        space,
      );
    }
  }
  return hexAlpha(sorted[sorted.length - 1]);
}

/** 把单个 PathStop 的 hex+alpha 转成 rgba() 字符串 */
function hexAlpha(stop: PathStop): string {
  return interpolateAlpha(
    { hex: stop.hex, alpha: stop.alpha },
    { hex: stop.hex, alpha: stop.alpha },
    0,
    "rgb",
  );
}

/** 在指定百分比处取插值后的 {hex, alpha}，用于在该位置新增一个色标 */
export function stopAtPercent(
  stops: PathStop[],
  percent: number,
  space: InterpSpace,
): { hex: string; alpha: number } {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (sorted.length === 0) return { hex: "#000000", alpha: 100 };
  if (sorted.length === 1) return { hex: sorted[0].hex, alpha: sorted[0].alpha };
  const p = clamp(percent, 0, 100);
  if (p <= sorted[0].pos) return { hex: sorted[0].hex, alpha: sorted[0].alpha };
  if (p >= sorted[sorted.length - 1].pos)
    return { hex: sorted[sorted.length - 1].hex, alpha: sorted[sorted.length - 1].alpha };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i],
      b = sorted[i + 1];
    if (p >= a.pos && p <= b.pos) {
      const span = b.pos - a.pos;
      const t = span > 0 ? (p - a.pos) / span : 0;
      return interpolateStop(
        { hex: a.hex, alpha: a.alpha },
        { hex: b.hex, alpha: b.alpha },
        t,
        space,
      );
    }
  }
  const last = sorted[sorted.length - 1];
  return { hex: last.hex, alpha: last.alpha };
}

/**
 * 把折线细分为密折线（段长 ≤ maxSeg），用于沿弧长逐段着色。
 * 直线细分只在直线段上插点，不改变折线形状与走向——与纯色描边的原始折线几何一致，
 * 切换"纯色/沿路径"时只改颜色，不变形状。
 * 闭合形状（circle/star 等）传入 closed=true 时在首尾补一段，保证环绕处也有着色。
 */
export function tessellate(points: Point[], maxSeg = 3, closed = false): Point[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const d = distance(a, b);
    const n = Math.max(1, Math.ceil(d / maxSeg));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (closed && (out[0].x !== out[out.length - 1].x || out[0].y !== out[out.length - 1].y)) {
    const last = out[out.length - 1],
      first = out[0];
    const d = distance(last, first);
    const n = Math.max(1, Math.ceil(d / maxSeg));
    for (let j = 1; j < n; j++) {
      const t = j / n;
      out.push({ x: last.x + (first.x - last.x) * t, y: last.y + (first.y - last.y) * t });
    }
    out.push({ ...first });
  }
  return out;
}

/** 沿密折线逐小段以插值色描边。调用方负责设置 globalCompositeOperation（mix 模式应先画到离屏） */
export function drawGradientStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  stops: PathStop[],
  space: InterpSpace,
  width: number,
  closed = false,
) {
  if (points.length < 2) return;
  const dense = tessellate(points, 1.5, closed);
  const cum = arcLengths(dense);
  const total = cum.at(-1) ?? 0;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < dense.length - 1; i++) {
    const a = dense[i],
      b = dense[i + 1];
    const midLen = cum[i] + distance(a, b) / 2;
    ctx.strokeStyle = colorAtPercent(stops, lengthToPercent(midLen, total), space);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

const escapeAttr = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** 生成沿路径分段着色的 SVG 片段（一组 <line>）。mixBlend=true 时外层包 mix-blend-mode:multiply 的 <g>。 */
export function svgGradientStroke(
  points: Point[],
  stops: PathStop[],
  space: InterpSpace,
  width: number,
  closed = false,
  mixBlend = false,
): string {
  if (points.length < 2) return "";
  const dense = tessellate(points, 1.5, closed);
  const cum = arcLengths(dense);
  const total = cum.at(-1) ?? 0;
  const lines: string[] = [];
  for (let i = 0; i < dense.length - 1; i++) {
    const a = dense[i],
      b = dense[i + 1];
    const midLen = cum[i] + distance(a, b) / 2;
    const color = escapeAttr(colorAtPercent(stops, lengthToPercent(midLen, total), space));
    lines.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" />`,
    );
  }
  const body = lines.join("\n    ");
  return mixBlend ? `<g style="mix-blend-mode:multiply">\n    ${body}\n  </g>` : body;
}

// ---- 形状点生成（供 CanvasTool 的形状工具与预设路径复用）----

export function shapePoints(shape: ShapeType, start: Point, end: Point): Point[] {
  const minX = Math.min(start.x, end.x),
    maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y),
    maxY = Math.max(start.y, end.y);
  const width = Math.max(8, maxX - minX),
    height = Math.max(8, maxY - minY);
  const cx = minX + width / 2,
    cy = minY + height / 2;
  if (shape === "circle")
    return Array.from({ length: 80 }, (_, i) => ({
      x: cx + Math.cos((i / 80) * Math.PI * 2) * width * 0.5,
      y: cy + Math.sin((i / 80) * Math.PI * 2) * height * 0.5,
    }));
  if (shape === "roundedRect") {
    const radius = Math.min(width, height) * 0.22;
    const corners = [
      { x: maxX - radius, y: minY + radius, start: -Math.PI / 2 },
      { x: maxX - radius, y: maxY - radius, start: 0 },
      { x: minX + radius, y: maxY - radius, start: Math.PI / 2 },
      { x: minX + radius, y: minY + radius, start: Math.PI },
    ];
    return corners.flatMap((corner) =>
      Array.from({ length: 9 }, (_, i) => {
        const angle = corner.start + (i / 8) * (Math.PI / 2);
        return { x: corner.x + Math.cos(angle) * radius, y: corner.y + Math.sin(angle) * radius };
      }),
    );
  }
  if (shape === "rect")
    // 直角矩形四点（顺时针）。
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  if (shape === "diamond")
    // 四点菱形：上下左右四个顶点。
    return [
      { x: cx, y: minY },
      { x: maxX, y: cy },
      { x: cx, y: maxY },
      { x: minX, y: cy },
    ];
  if (shape === "arrow") {
    // 箭头：从 start 中心方向画杆到 end，末端加两条翼。
    const sx = minX + width / 2,
      sy = minY + height / 2;
    const dx = end.x - sx,
      dy = end.y - sy,
      len = Math.hypot(dx, dy) || 1;
    const ux = dx / len,
      uy = dy / len;
    const headLen = Math.min(len * 0.3, Math.max(12, len * 0.18));
    const wing = headLen * Math.tan((25 * Math.PI) / 180);
    // 杆起点略后退，使箭头视觉从 start 出发
    const base = { x: sx - ux * 0, y: sy - uy * 0 };
    const tip = { x: end.x, y: end.y };
    const wingAngle = Math.PI - (25 * Math.PI) / 180;
    const cos = Math.cos(wingAngle),
      sin = Math.sin(wingAngle);
    const w1 = {
      x: tip.x + (ux * cos - uy * sin) * headLen,
      y: tip.y + (ux * sin + uy * cos) * headLen,
    };
    const cos2 = Math.cos(-wingAngle),
      sin2 = Math.sin(-wingAngle);
    const w2 = {
      x: tip.x + (ux * cos2 - uy * sin2) * headLen,
      y: tip.y + (ux * sin2 + uy * cos2) * headLen,
    };
    return [base, tip, w1, tip, w2];
  }
  if (shape === "triangle" || shape === "pentagon" || shape === "star") {
    const sides = shape === "triangle" ? 3 : shape === "pentagon" ? 5 : 12;
    return Array.from({ length: sides }, (_, index) => {
      const starRadius = shape === "star" && index % 2 === 1 ? 0.52 : 1;
      const angle = -Math.PI / 2 + (index / sides) * Math.PI * 2;
      return {
        x: cx + Math.cos(angle) * width * 0.5 * starRadius,
        y: cy + Math.sin(angle) * height * 0.5 * starRadius,
      };
    });
  }
  if (shape === "heart")
    return Array.from({ length: 90 }, (_, index) => {
      const t = (index / 90) * Math.PI * 2,
        x = 16 * Math.sin(t) ** 3,
        y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return { x: cx + (x / 34) * width, y: cy + (y / 32) * height };
    });
  if (shape === "curve")
    return Array.from({ length: 60 }, (_, index) => {
      const t = index / 59;
      return { x: minX + t * width, y: cy + (height / 2) * Math.sin(t * Math.PI * 2) };
    });
  if (shape === "spiral") {
    const maxR = Math.min(width, height) / 2;
    return Array.from({ length: 160 }, (_, index) => {
      const t = index / 159;
      const angle = t * Math.PI * 5;
      const r = maxR * t;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
  }
  // wave
  return Array.from({ length: 72 }, (_, index) => {
    const progress = index / 71;
    return { x: minX + progress * width, y: cy + Math.sin(progress * Math.PI * 4) * height * 0.42 };
  });
}

export const createStopId = (prefix = "stop") =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
