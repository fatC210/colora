import type { Bounds, Point, ResizeHandle, SelectionBox, Stroke } from "./types";
import { isClosedShape, renderPoints } from "./path";

/** 线性笔画：开放线条（画笔/直线/箭头/波浪/曲线/螺旋），即非闭合且非文本。 */
export function isLinearStroke(stroke: Stroke): boolean {
  return !isClosedShape(stroke) && stroke.kind !== "text";
}

/** 线性元素每段的中点列表（用于编辑态插入折点手柄）。长度 = points.length - 1。 */
export function getMidPoints(points: Point[]): Point[] {
  const mids: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    mids.push({ x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 });
  }
  return mids;
}

// 文本度量用的共享 canvas（measureText 需 canvas 上下文）。
let measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}
/** 精确测量文本笔画的宽高（用 measureText，与 canvas fillText 渲染一致）。 */
export function textMetrics(stroke: Stroke): { width: number; height: number } {
  const fs = stroke.fontSize ?? 28;
  const ff = stroke.fontFamily ?? "sans-serif";
  const lines = (stroke.text ?? "").split("\n");
  const ctx = getMeasureCtx();
  let widest = 0;
  if (ctx) {
    ctx.font = `${fs}px ${ff}`;
    widest = Math.max(...lines.map((l) => ctx.measureText(l || " ").width));
  } else {
    widest = Math.max(...lines.map((l) => (l || " ").length)) * fs * 0.6;
  }
  // 高度：单行 = fs；多行 = 行间距 1.2*fs × (行数-1) + 末行高 fs（末行不额外加行间距）。
  const height = lines.length <= 1 ? fs : (lines.length - 1) * fs * 1.2 + fs;
  return { width: Math.max(widest, fs * 0.5), height };
}

export function getBounds(points: Point[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** 点是否落在包围盒内（含边界）。用于"点击组合大框内任意处即可拖动整组"。 */
export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

/**
 * 单笔实际渲染几何的包围盒。渲染为原始折线（直线段），故直接取 points 的 min/max。
 */
export function renderBounds(stroke: Stroke): Bounds {
  const points = renderPoints(stroke);
  // 文本笔画：用 measureText 精确测量宽高，使选中框/手柄贴合文本。
  if (stroke.kind === "text") {
    const p = points[0];
    if (!p || !stroke.text) return getBounds(points);
    const { width, height } = textMetrics(stroke);
    return {
      minX: p.x,
      minY: p.y,
      maxX: p.x + width,
      maxY: p.y + height,
      width,
      height,
    };
  }
  return getBounds(points);
}

/** 绕 center 旋转 rad 弧度（顺时针，canvas 坐标系 y 向下）。 */
export function rotatePoint(p: Point, center: Point, rad: number): Point {
  const c = Math.cos(rad),
    s = Math.sin(rad);
  const dx = p.x - center.x,
    dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}
export function rotatePoints(ps: Point[], center: Point, rad: number): Point[] {
  return ps.map((p) => rotatePoint(p, center, rad));
}
/** 旋转中心 = renderBounds(stroke) 中心（angle=0 局部框中心，线性/闭合/文本统一）。 */
export function strokeCenter(stroke: Stroke): Point {
  const b = renderBounds(stroke);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
/** 指针（世界）→ angle=0 局部坐标系：绕中心逆旋转 -angle。统一逆旋转入口。 */
export function toLocalPoint(stroke: Stroke, point: Point): Point {
  const a = stroke.angle ?? 0;
  if (a === 0) return point;
  return rotatePoint(point, strokeCenter(stroke), -a);
}
/** angle=0 局部点 → 世界：绕中心正向旋转 angle。手柄显示用。 */
export function toWorldPoint(stroke: Stroke, point: Point): Point {
  const a = stroke.angle ?? 0;
  if (a === 0) return point;
  return rotatePoint(point, strokeCenter(stroke), a);
}
/** 旋转后形状的世界轴对齐包围盒（renderBounds 四角绕中心旋转 angle 后取 min/max）。 */
export function worldBounds(stroke: Stroke): Bounds {
  const b = renderBounds(stroke);
  const a = stroke.angle ?? 0;
  if (a === 0) return b;
  const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const corners = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ].map((p) => rotatePoint(p, c, a));
  const xs = corners.map((p) => p.x),
    ys = corners.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** 选中笔画的联合包围盒（含线宽 padding，基于旋转后世界 AABB）。returns null 表示无选中或无几何。 */
export function selectionBounds(strokes: Stroke[]): Bounds | null {
  if (!strokes.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes) {
    if (!s.points.length) continue;
    const b = worldBounds(s);
    // padding：线条用线宽半宽（紧贴本体）；文本给固定间距，使选中框不贴死文字。
    const pad = s.kind === "text" ? Math.max((s.fontSize ?? 28) * 0.12, 6) : s.width / 2;
    if (b.minX - pad < minX) minX = b.minX - pad;
    if (b.minY - pad < minY) minY = b.minY - pad;
    if (b.maxX + pad > maxX) maxX = b.maxX + pad;
    if (b.maxY + pad > maxY) maxY = b.maxY + pad;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 选中笔画点的联合真实包围盒（不含 padding，基于旋转后世界 AABB）。
 * 供 zoomToFit/导出用：以旋转后形状的实际可见范围为基准。
 */
export function unionWorldBounds(strokes: Stroke[]): Bounds | null {
  if (!strokes.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes) {
    if (!s.points.length) continue;
    const b = worldBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 选中笔画点的联合真实包围盒（不含 padding）。
 * 供 resize 缩放使用：以点的真实范围作为缩放基准，避免 padding 参与缩放造成杠杆放大。
 */
export function unionRenderBounds(strokes: Stroke[]): Bounds | null {
  if (!strokes.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes) {
    if (!s.points.length) continue;
    const b = renderBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** 各手柄在包围盒上的位置（画布坐标）。 */
export function handlePoint(box: Bounds, handle: ResizeHandle): Point {
  const { minX, minY, maxX, maxY } = box;
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const map: Record<ResizeHandle, Point> = {
    nw: { x: minX, y: minY },
    n: { x: cx, y: minY },
    ne: { x: maxX, y: minY },
    e: { x: maxX, y: cy },
    se: { x: maxX, y: maxY },
    s: { x: cx, y: maxY },
    sw: { x: minX, y: maxY },
    w: { x: minX, y: cy },
  };
  return map[handle];
}

/**
 * 给定原始包围盒（无 padding 的真实点范围）、手柄、按下指针与当前指针，
 * 计算把"旧坐标→新坐标"映射到任意点的函数。
 * 拖动某手柄时，其对角（或对边）固定不动；手柄边随鼠标位移精确跟随。
 * box 必须是笔画点的真实包围盒（不含 padding），否则 padding 会参与缩放造成杠杆放大。
 */
export function resizeTransform(box: Bounds, handle: ResizeHandle, origin: Point, current: Point) {
  // 对边手柄（n/s/e/w）只缩放一个轴，另一个轴保持
  const isVertical = handle === "n" || handle === "s"; // 上下拖动，固定 Y 对边，X 不变
  const isHorizontal = handle === "e" || handle === "w"; // 左右拖动，固定 X 对边，Y 不变

  // 手柄所在的边（按下时的坐标）；固定边为对边
  const handleIsEast = handle.includes("e");
  const handleIsSouth = handle.includes("s");
  const handleEdgeX = handleIsEast ? box.maxX : box.minX; // e/ne/se 取 maxX；w/nw/sw 取 minX；n/s 不用
  const handleEdgeY = handleIsSouth ? box.maxY : box.minY; // s/se/sw 取 maxY；n/ne/nw 取 minY；e/w 不用
  const fixedX = handleIsEast ? box.minX : box.maxX; // 东侧手柄固定西边(minX)，西侧固定东边(maxX)
  const fixedY = handleIsSouth ? box.minY : box.maxY; // 南侧手柄固定北边(minY)，北侧固定南边(maxY)

  // 鼠标位移 → 手柄边位移 → 新手柄边坐标
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  const newHandleEdgeX = handleEdgeX + dx;
  const newHandleEdgeY = handleEdgeY + dy;

  // 缩放比 = 新距离 / 原距离（以固定边为原点）
  const spanX = handleEdgeX - fixedX || 1;
  const spanY = handleEdgeY - fixedY || 1;
  const sx = isVertical ? 1 : (newHandleEdgeX - fixedX) / spanX;
  const sy = isHorizontal ? 1 : (newHandleEdgeY - fixedY) / spanY;

  const mapPoint = (p: Point): Point => {
    if (isVertical) return { x: p.x, y: fixedY + (p.y - fixedY) * sy };
    if (isHorizontal) return { x: fixedX + (p.x - fixedX) * sx, y: p.y };
    return { x: fixedX + (p.x - fixedX) * sx, y: fixedY + (p.y - fixedY) * sy };
  };
  return { mapPoint, sx, sy };
}
