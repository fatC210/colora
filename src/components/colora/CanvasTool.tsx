import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  Copy,
  Download,
  Group,
  MousePointer2,
  Paintbrush,
  Plus,
  Redo2,
  Save,
  Shapes,
  Slash,
  Sparkles,
  Trash2,
  Undo2,
  Ungroup,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "./primitives";
import { cn } from "@/lib/utils";
import { useColora } from "@/lib/colora-store";
import {
  colorAtPercent,
  createStopId,
  drawGradientStroke,
  type InterpSpace,
  nearestPercentOnPath,
  type PathStop,
  pointAtLength,
  percentToLength,
  shapePoints as makeShapePoints,
  smoothPoints,
  svgGradientStroke,
  totalLength,
  type Point,
  type ShapeType,
} from "@/lib/path-gradient";
import { bestTextOn, relativeLuminance, hexToRgb } from "@/lib/color";

type Mode = "select" | "brush" | "line" | "shape";
type StrokeKind = "brush" | "line" | "shape";
type PaintMode = "solid" | "gradient";
type OverlapMode = "mix" | "cover";
type CanvasLayout = "grid" | "blank" | "dots";
type StrokePaint = { mode: PaintMode; solid: string; stops: PathStop[]; space: InterpSpace };
type Stroke = {
  id: string;
  name: string;
  kind: StrokeKind;
  shape?: ShapeType;
  points: Point[];
  width: number;
  smooth: boolean;
  smoothing: number;
  paint: StrokePaint;
  groupId?: string;
};
type StrokeGroup = {
  id: string;
  name: string;
  strokeIds: string[];
  stops: PathStop[];
  space: InterpSpace;
};
type SelectionBox = { start: Point; end: Point };
type SceneSnapshot = { strokes: Stroke[]; groups: StrokeGroup[] };
type Draft =
  { type: "brush"; points: Point[] } | { type: "line" | "shape"; start: Point; end: Point };
type DragState =
  | { type: "move"; last: Point; startStrokes: Stroke[]; startGroups: StrokeGroup[] }
  | { type: "marquee"; start: Point }
  | {
      type: "resize";
      handle: ResizeHandle;
      origin: Point; // 按下时指针位置（画布坐标）
      box: Bounds; // 按下时选中笔画的联合包围盒（含 padding）
      startStrokes: Stroke[]; // 按下时选中笔画快照
      startGroups: StrokeGroup[];
    };
type Size = { w: number; h: number };
type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};
// 八个变换手柄：四角 + 四边中点。n/s/e/w 表示固定方向（拖动时该边不动）。
type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

// 演示笔画的原始坐标系（首次测量画布尺寸后按比例缩放入场）
const INITIAL_W = 1120;
const INITIAL_H = 720;
const DEFAULT_STOPS: PathStop[] = [
  { id: "stop-a", hex: "#8B5CF6", pos: 0 },
  { id: "stop-b", hex: "#06B6D4", pos: 50 },
  { id: "stop-c", hex: "#F97316", pos: 100 },
];
const SHAPES: { value: ShapeType; label: string }[] = [
  { value: "circle", label: "圆形" },
  { value: "roundedRect", label: "圆角矩形" },
  { value: "triangle", label: "三角形" },
  { value: "pentagon", label: "五边形" },
  { value: "star", label: "六角星" },
  { value: "heart", label: "爱心" },
  { value: "wave", label: "波浪线" },
  { value: "curve", label: "曲线" },
  { value: "spiral", label: "螺旋" },
];
const PRESETS: { value: ShapeType; label: string }[] = [
  { value: "curve", label: "曲线" },
  { value: "wave", label: "波浪" },
  { value: "circle", label: "圆" },
  { value: "spiral", label: "螺旋" },
  { value: "heart", label: "心形" },
];
const INTERP_SPACES: InterpSpace[] = ["rgb", "lab", "lch"];

const CANVAS_LAYOUTS: { value: CanvasLayout; label: string }[] = [
  { value: "grid", label: "方格" },
  { value: "blank", label: "空白" },
  { value: "dots", label: "点状" },
];
const CANVAS_BG_LIGHT = "#ffffff";
const CANVAS_BG_DARK = "#0a0a0a";
const defaultCanvasBg = (isDark: boolean) => (isDark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT);
const GRID_STEP = 40;

/**
 * 根据画布背景色的实际明度计算方格线 / 点状的颜色。
 * 背景越亮用半透明黑，越暗用半透明白；明度越接近中间值，透明度越低（前景越实），
 * 以保证牛皮纸黄、中灰等中间明度背景上方格/点状仍有足够对比度。
 */
function gridColors(bg: string): { line: string; dot: string } {
  const rgb = hexToRgb(bg);
  if (!rgb) return { line: "rgba(15,23,42,0.08)", dot: "rgba(15,23,42,0.20)" };
  const lum = relativeLuminance(rgb); // 0~1
  const dark = lum < 0.5;
  // 距两端的最大距离：0=纯黑或纯白，0.5=中灰。中灰时 alpha 拉满。
  const midness = 1 - Math.abs(lum - 0.5) * 2; // 0(端点) ~ 1(中点)
  const lineAlpha = 0.06 + midness * 0.12; // 0.06 ~ 0.18
  const dotAlpha = 0.16 + midness * 0.16; // 0.16 ~ 0.32
  const base = dark ? "255,255,255" : "15,23,42";
  return { line: `rgba(${base},${lineAlpha})`, dot: `rgba(${base},${dotAlpha})` };
}

/**
 * 根据画布背景明度生成卷角的一组协调对比色（同灰阶、非生硬黑白）。
 * 背景亮 → 卷角用深纸；背景暗 → 用浅纸；中灰背景拉大明度差保证可辨。
 * 返回：fold 纸面、back 卷背面、edge 纸缘高光、shade 卷曲投影。
 */
function cornerTone(bg: string): { fold: string; back: string; edge: string; shade: string } {
  const rgb = hexToRgb(bg);
  if (!rgb) return { fold: "#3f3f46", back: "#18181b", edge: "#9ca3af", shade: "#00000066" };
  const lum = relativeLuminance(rgb); // 0~1
  const dark = lum < 0.5;
  // 距中性点（0.5）的距离 → 反相强度。越接近中灰越需要极端反相保证对比
  const pull = 0.5 + Math.abs(lum - 0.5) * 1.4; // 0.5(中性) ~ 1.2(端点)
  const gray = (v: number) => `rgb(${v},${v},${v})`;
  if (dark) {
    // 暗背景 → 浅纸（高对比），卷背略暗，纸缘更高光
    const f = Math.min(250, Math.round(205 + pull * 40)); // 235~250
    return {
      fold: gray(f),
      back: gray(Math.max(150, f - 58)),
      edge: gray(Math.min(255, f + 5)),
      shade: "rgb(0 0 0 / 0.30)",
    };
  }
  // 亮背景 → 深纸（高对比），卷背更暗，纸缘略亮
  const f = Math.max(22, Math.round(180 - pull * 130)); // 24~58
  return {
    fold: gray(Math.round(f * 0.78)),
    back: gray(Math.max(16, Math.round(f * 0.5))),
    edge: gray(f),
    shade: "rgb(0 0 0 / 0.22)",
  };
}

// 适合作为画布背景的常用色（线条颜色不受其影响）
const CANVAS_BG_PRESETS: { hex: string; label: string }[] = [
  { hex: "#FFFFFF", label: "纯白" },
  { hex: "#F5F1E8", label: "茶白" },
  { hex: "#E8DCC4", label: "牛皮纸黄" },
  { hex: "#D9C9A8", label: "米麻" },
  { hex: "#C9C2B6", label: "浅灰麻" },
  { hex: "#9B9B9B", label: "中灰" },
  { hex: "#4A4A4A", label: "墨灰" },
  { hex: "#2B2B2B", label: "深墨" },
  { hex: "#0A0A0A", label: "近黑" },
];

const cloneStops = (stops: PathStop[]) => stops.map((stop) => ({ ...stop }));
const clonePaint = (paint: StrokePaint): StrokePaint => ({
  ...paint,
  stops: cloneStops(paint.stops),
});
const cloneStrokes = (strokes: Stroke[]) =>
  strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
    paint: clonePaint(stroke.paint),
  }));
const cloneGroups = (groups: StrokeGroup[]) =>
  groups.map((group) => ({
    ...group,
    strokeIds: [...group.strokeIds],
    stops: cloneStops(group.stops),
  }));
const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const defaultPaint = (solid = "#7C3AED"): StrokePaint => ({
  mode: "gradient",
  solid,
  stops: cloneStops(DEFAULT_STOPS),
  space: "rgb",
});

const initialStrokes: Stroke[] = [
  {
    id: "demo-1",
    name: "演示曲线 1",
    kind: "brush",
    points: [
      { x: 178, y: 438 },
      { x: 285, y: 222 },
      { x: 430, y: 389 },
      { x: 568, y: 170 },
      { x: 742, y: 318 },
      { x: 930, y: 222 },
    ],
    width: 24,
    smooth: true,
    smoothing: 72,
    paint: defaultPaint("#8B5CF6"),
  },
  {
    id: "demo-2",
    name: "演示波浪",
    kind: "shape",
    shape: "wave",
    points: [
      { x: 190, y: 535 },
      { x: 301, y: 483 },
      { x: 413, y: 535 },
      { x: 525, y: 587 },
      { x: 636, y: 535 },
      { x: 748, y: 483 },
      { x: 860, y: 535 },
      { x: 972, y: 587 },
    ],
    width: 16,
    smooth: true,
    smoothing: 90,
    paint: {
      mode: "gradient",
      solid: "#06B6D4",
      stops: [
        { id: "demo-2-a", hex: "#06B6D4", pos: 0 },
        { id: "demo-2-b", hex: "#22C55E", pos: 100 },
      ],
      space: "rgb",
    },
  },
];

function getBounds(points: Point[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 单条二次贝塞尔曲线段 (p0→p2, 控制点 p1) 的包围盒。
 * 渲染时 drawPath(curved) 用 quadraticCurveTo，曲线会凸出控制多边形，
 * 直接取端点 min/max 会漏掉外凸部分，因此对 t 参数采样以包含真实弧线范围。
 */
function quadraticBounds(
  p0: Point,
  p1: Point,
  p2: Point,
  into: { minX: number; minY: number; maxX: number; maxY: number },
) {
  // 先纳入两端点与控制点（控制点本身不在曲线上，但若 t 极值落在 (0,1) 外则端点已是极值）
  for (const p of [p0, p2]) {
    if (p.x < into.minX) into.minX = p.x;
    if (p.x > into.maxX) into.maxX = p.x;
    if (p.y < into.minY) into.minY = p.y;
    if (p.y > into.maxY) into.maxY = p.y;
  }
  // B(t) = (1-t)^2 p0 + 2(1-t)t p1 + t^2 p2，极值点 t = (p0 - p1) / (p0 - 2 p1 + p2)
  for (const axis of ["x", "y"] as const) {
    const denom = p0[axis] - 2 * p1[axis] + p2[axis];
    if (denom === 0) continue;
    const t = (p0[axis] - p1[axis]) / denom;
    if (t > 0 && t < 1) {
      const v = (1 - t) * (1 - t) * p0[axis] + 2 * (1 - t) * t * p1[axis] + t * t * p2[axis];
      if (v < into.minX && axis === "x") into.minX = v;
      if (v > into.maxX && axis === "x") into.maxX = v;
      if (v < into.minY && axis === "y") into.minY = v;
      if (v > into.maxY && axis === "y") into.maxY = v;
    }
  }
}

/**
 * 单笔实际渲染几何的包围盒（与 drawPath / drawGradientStroke 口径一致）。
 * 平滑笔触与曲线模式都会让真实弧线超出原始 points 的 min/max，这里按渲染路径计算。
 */
function renderBounds(stroke: Stroke): Bounds {
  const points = renderPoints(stroke);
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  if (points.length === 1) {
    return {
      minX: points[0].x,
      minY: points[0].y,
      maxX: points[0].x,
      maxY: points[0].y,
      width: 0,
      height: 0,
    };
  }
  const curved = stroke.kind === "brush" || stroke.shape === "wave";
  const acc = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  if (!curved || points.length < 3) {
    for (const p of points) {
      if (p.x < acc.minX) acc.minX = p.x;
      if (p.x > acc.maxX) acc.maxX = p.x;
      if (p.y < acc.minY) acc.minY = p.y;
      if (p.y > acc.maxY) acc.maxY = p.y;
    }
  } else {
    // 与 drawPath 的二次贝塞尔分段一致：Q points[i] midpoint(i,i+1)，末段 lineTo(last)
    for (let i = 1; i < points.length - 1; i++) {
      const cur = points[i],
        next = points[i + 1];
      const mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
      const prev =
        i === 1
          ? points[0]
          : { x: (points[i - 1].x + cur.x) / 2, y: (points[i - 1].y + cur.y) / 2 };
      quadraticBounds(prev, cur, mid, acc);
    }
    const last = points[points.length - 1],
      prevLast = points[points.length - 2];
    // drawPath 末段为直线 lineTo(last)：从上一段终点 midpoint(prevLast,last) 直连 last。
    // （toPathData 的 SVG 导出用 T 命令，但画布渲染以 drawPath 为准，故按直线计算。）
    const endStart = { x: (prevLast.x + last.x) / 2, y: (prevLast.y + last.y) / 2 };
    if (endStart.x < acc.minX) acc.minX = endStart.x;
    if (endStart.x > acc.maxX) acc.maxX = endStart.x;
    if (endStart.y < acc.minY) acc.minY = endStart.y;
    if (endStart.y > acc.maxY) acc.maxY = endStart.y;
    if (last.x < acc.minX) acc.minX = last.x;
    if (last.x > acc.maxX) acc.maxX = last.x;
    if (last.y < acc.minY) acc.minY = last.y;
    if (last.y > acc.maxY) acc.maxY = last.y;
  }
  if (!Number.isFinite(acc.minX)) return getBounds(points);
  return {
    minX: acc.minX,
    minY: acc.minY,
    maxX: acc.maxX,
    maxY: acc.maxY,
    width: acc.maxX - acc.minX,
    height: acc.maxY - acc.minY,
  };
}

/** 选中笔画的联合包围盒（含线宽 padding）。returns null 表示无选中或无几何。 */
function selectionBounds(strokes: Stroke[]): Bounds | null {
  if (!strokes.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes) {
    if (!s.points.length) continue;
    const b = renderBounds(s);
    const pad = s.width / 2 + 8;
    if (b.minX - pad < minX) minX = b.minX - pad;
    if (b.minY - pad < minY) minY = b.minY - pad;
    if (b.maxX + pad > maxX) maxX = b.maxX + pad;
    if (b.maxY + pad > maxY) maxY = b.maxY + pad;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 选中笔画点的联合真实包围盒（不含 padding）。
 * 供 resize 缩放使用：以点的真实范围作为缩放基准，避免 padding 参与缩放造成杠杆放大。
 */
function unionRenderBounds(strokes: Stroke[]): Bounds | null {
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
function handlePoint(box: Bounds, handle: ResizeHandle): Point {
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
function resizeTransform(box: Bounds, handle: ResizeHandle, origin: Point, current: Point) {
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
function renderPoints(stroke: Stroke) {
  return stroke.kind === "brush" || stroke.shape === "wave"
    ? stroke.smooth
      ? smoothPoints(stroke.points, stroke.smoothing)
      : stroke.points
    : stroke.points;
}
function isClosedShape(stroke: Stroke) {
  return Boolean(
    stroke.shape &&
    stroke.shape !== "wave" &&
    stroke.shape !== "curve" &&
    stroke.shape !== "spiral",
  );
}
function paintSource(stroke: Stroke, groups: StrokeGroup[]) {
  const group = stroke.groupId ? groups.find((item) => item.id === stroke.groupId) : undefined;
  if (group)
    return {
      mode: "gradient" as PaintMode,
      solid: stroke.paint.solid,
      stops: group.stops,
      space: group.space,
    };
  return stroke.paint;
}
function toPathData(points: Point[], curved: boolean) {
  if (!points.length) return "";
  if (!curved || points.length < 3)
    return points
      .map(
        (point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      )
      .join(" ");
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 1; index < points.length - 1; index++) {
    const current = points[index],
      next = points[index + 1];
    d += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${((current.x + next.x) / 2).toFixed(1)} ${((current.y + next.y) / 2).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${d} T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
}
function drawPath(ctx: CanvasRenderingContext2D, points: Point[], curved: boolean, closed = false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (!curved || points.length < 3)
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  else {
    for (let index = 1; index < points.length - 1; index++) {
      const current = points[index],
        next = points[index + 1];
      ctx.quadraticCurveTo(
        current.x,
        current.y,
        (current.x + next.x) / 2,
        (current.y + next.y) / 2,
      );
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  if (closed) ctx.closePath();
}
function pointToSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}
function hitStroke(stroke: Stroke, point: Point) {
  const points = renderPoints(stroke),
    threshold = stroke.width / 2 + 8;
  for (let index = 0; index < points.length - 1; index++)
    if (pointToSegmentDistance(point, points[index], points[index + 1]) <= threshold) return true;
  return false;
}
function boxIntersectsStroke(box: SelectionBox, stroke: Stroke) {
  const left = Math.min(box.start.x, box.end.x),
    right = Math.max(box.start.x, box.end.x),
    top = Math.min(box.start.y, box.end.y),
    bottom = Math.max(box.start.y, box.end.y);
  const bounds = renderBounds(stroke);
  return bounds.maxX >= left && bounds.minX <= right && bounds.maxY >= top && bounds.minY <= bottom;
}
function escapeAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function getNextStopPosition(stops: PathStop[]) {
  if (stops.length === 0) return 50;
  const positions = stops.map((s) => clamp(s.pos, 0, 100)).sort((a, b) => a - b);
  let gapStart = 0,
    gapEnd = positions[0],
    largest = gapEnd - gapStart;
  for (let i = 0; i < positions.length - 1; i++) {
    const g = positions[i + 1] - positions[i];
    if (g > largest) {
      largest = g;
      gapStart = positions[i];
      gapEnd = positions[i + 1];
    }
  }
  const trailing = 100 - positions[positions.length - 1];
  if (trailing > largest) {
    gapStart = positions[positions.length - 1];
    gapEnd = 100;
  }
  return Math.round((gapStart + gapEnd) / 2);
}
/** 把按 pos 排序的 stops 拼成 CSS 线性渐变字符串（面板斜坡条预览用，rgb 插值） */
function rampCss(stops: PathStop[]) {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (!sorted.length) return "#000000";
  return `linear-gradient(to right, ${sorted.map((s) => `${s.hex} ${s.pos}%`).join(", ")})`;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  size: Size,
  layout: CanvasLayout,
  bg: string,
) {
  const { w, h } = size;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (layout === "blank") return;
  const { line, dot } = gridColors(bg);
  ctx.save();
  ctx.strokeStyle = line;
  ctx.fillStyle = dot;
  if (layout === "grid") {
    ctx.lineWidth = 1;
    for (let x = GRID_STEP; x < w; x += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = GRID_STEP; y < h; y += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (layout === "dots") {
    for (let x = GRID_STEP; x < w; x += GRID_STEP)
      for (let y = GRID_STEP; y < h; y += GRID_STEP) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();
}

function renderScene({
  ctx,
  size,
  strokes,
  groups,
  selectedIds = [],
  overlapMode,
  draft,
  offscreen,
  bgLayout = "grid",
  bgColor,
}: {
  ctx: CanvasRenderingContext2D;
  size: Size;
  strokes: Stroke[];
  groups: StrokeGroup[];
  selectedIds?: string[];
  overlapMode: OverlapMode;
  draft?: Draft | null;
  offscreen?: HTMLCanvasElement | null;
  bgLayout?: CanvasLayout;
  bgColor: string;
}) {
  const { w, h } = size;
  if (w === 0 || h === 0) return;
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, size, bgLayout, bgColor);

  const drawStroke = (target: CanvasRenderingContext2D, stroke: Stroke) => {
    const points = renderPoints(stroke);
    if (points.length < 2) return;
    const source = paintSource(stroke, groups);
    const closed = isClosedShape(stroke);
    if (source.mode === "solid") {
      drawPath(target, points, stroke.kind === "brush" || stroke.shape === "wave", closed);
      target.strokeStyle = source.solid;
      target.lineWidth = stroke.width;
      target.lineCap = "round";
      target.lineJoin = "round";
      target.stroke();
    } else {
      drawGradientStroke(target, points, source.stops, source.space, stroke.width, closed);
    }
  };

  ctx.save();
  if (overlapMode === "mix" && offscreen) {
    const octx = offscreen.getContext("2d");
    if (octx) {
      // 笔画层在透明离屏画布上相互 multiply 混色，最后以 source-over 盖到背景上，
      // 这样背景色不会参与混色计算——线条颜色不受背景色影响。
      octx.clearRect(0, 0, w, h);
      octx.globalCompositeOperation = "source-over";
      if (strokes.length) drawStroke(octx, strokes[0]);
      octx.globalCompositeOperation = "multiply";
      for (let i = 1; i < strokes.length; i++) drawStroke(octx, strokes[i]);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(offscreen, 0, 0, w, h);
    }
  } else {
    ctx.globalCompositeOperation = "source-over";
    for (const stroke of strokes) drawStroke(ctx, stroke);
  }
  ctx.restore();

  if (draft) {
    const points =
      draft.type === "brush"
        ? draft.points
        : draft.type === "line"
          ? [draft.start, draft.end]
          : makeShapePoints("circle", draft.start, draft.end);
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "rgba(2, 132, 199, 0.9)";
    ctx.lineWidth = 3;
    drawPath(ctx, points, draft.type !== "line", draft.type === "shape");
    ctx.stroke();
    ctx.restore();
  }
  if (selectedIds.length) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(37, 99, 235, 0.92)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    strokes
      .filter((stroke) => selectedIds.includes(stroke.id))
      .forEach((stroke) => {
        const bounds = renderBounds(stroke),
          padding = stroke.width / 2 + 8;
        ctx.strokeRect(
          bounds.minX - padding,
          bounds.minY - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2,
        );
      });
    ctx.restore();
  }
}
function svgBackground(size: Size, layout: CanvasLayout, bg: string) {
  if (layout === "blank") return `<rect width="100%" height="100%" fill="${escapeAttr(bg)}" />`;
  const { line, dot } = gridColors(bg);
  if (layout === "dots") {
    const dots: string[] = [];
    for (let x = GRID_STEP; x < size.w; x += GRID_STEP)
      for (let y = GRID_STEP; y < size.h; y += GRID_STEP)
        dots.push(`<circle cx="${x}" cy="${y}" r="1.2" fill="${dot}" />`);
    return `<rect width="100%" height="100%" fill="${escapeAttr(bg)}" />\n  ${dots.join("\n  ")}`;
  }
  const lines: string[] = [];
  for (let x = GRID_STEP; x < size.w; x += GRID_STEP)
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${size.h}" stroke="${line}" stroke-width="1" />`,
    );
  for (let y = GRID_STEP; y < size.h; y += GRID_STEP)
    lines.push(
      `<line x1="0" y1="${y}" x2="${size.w}" y2="${y}" stroke="${line}" stroke-width="1" />`,
    );
  return `<rect width="100%" height="100%" fill="${escapeAttr(bg)}" />\n  ${lines.join("\n  ")}`;
}

function createSvg(
  size: Size,
  strokes: Stroke[],
  groups: StrokeGroup[],
  overlapMode: OverlapMode,
  bgLayout: CanvasLayout,
  bgColor: string,
) {
  const groupsXml: string[] = [];
  const mix = overlapMode === "mix";
  strokes.forEach((stroke) => {
    const points = renderPoints(stroke);
    if (points.length < 2) return;
    const source = paintSource(stroke, groups);
    const closed = isClosedShape(stroke);
    if (source.mode === "solid") {
      const d =
        toPathData(points, stroke.kind === "brush" || stroke.shape === "wave") +
        (closed ? " Z" : "");
      groupsXml.push(
        `<path d="${d}" fill="none" stroke="${escapeAttr(source.solid)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"${mix ? ' style="mix-blend-mode:multiply"' : ""} />`,
      );
    } else {
      groupsXml.push(
        svgGradientStroke(points, source.stops, source.space, stroke.width, closed, mix),
      );
    }
  });
  // mix 模式下笔画之间互相 multiply，但用 isolate 隔离组，使背景色不参与混色
  const body = mix
    ? `<g style="isolation:isolate">\n  ${groupsXml.join("\n  ")}\n  </g>`
    : groupsXml.join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">\n  ${svgBackground(size, bgLayout, bgColor)}\n  ${body}\n</svg>`;
}

export function CanvasTool() {
  const { theme } = useColora();
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rampRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const scaledRef = useRef(false);
  const stopDragRafRef = useRef(0);
  const stopDragInfoRef = useRef<{ stopId: string; x: number; y: number } | null>(null);
  const rampDragRef = useRef<{ stopId: string; moved: boolean } | null>(null);

  const [mode, setMode] = useState<Mode>("select");
  const [shape, setShape] = useState<ShapeType>("circle");
  const [presetShape, setPresetShape] = useState<ShapeType>("curve");
  const [viewSize, setViewSize] = useState<Size>({ w: 0, h: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>(() => cloneStrokes(initialStrokes));
  const [groups, setGroups] = useState<StrokeGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["demo-1"]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [brushWidth, setBrushWidth] = useState(18);
  const [overlapMode, setOverlapMode] = useState<OverlapMode>("mix");
  const [bgLayout, setBgLayout] = useState<CanvasLayout>("grid");
  const [bgColor, setBgColor] = useState<string>(() => defaultCanvasBg(theme === "dark"));
  const bgColorAutoRef = useRef(true); // 是否仍为自动跟随主题的默认色（用户未手动改色）
  const [undoStack, setUndoStack] = useState<SceneSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SceneSnapshot[]>([]);
  // 面板动画状态机：closed（卸载，只显示卷角）→ opening（翻开中）→ open（展开）→ closing（翻回中）→ closed
  const [panelAnim, setPanelAnim] = useState<"closed" | "opening" | "open" | "closing">("closed");

  const openPanel = useCallback(() => setPanelAnim("opening"), []);
  const closePanel = useCallback(() => setPanelAnim((s) => (s === "open" ? "closing" : s)), []);
  const onPanelAnimationEnd = useCallback((event: React.AnimationEvent) => {
    // 只响应翻页动画自身，避免子元素动画冒泡误触发状态转换
    if (event.animationName !== "colora-page-open" && event.animationName !== "colora-page-close")
      return;
    setPanelAnim((s) => (s === "opening" ? "open" : s === "closing" ? "closed" : s));
  }, []);

  const selectedStrokes = useMemo(
    () => strokes.filter((stroke) => selectedIds.includes(stroke.id)),
    [selectedIds, strokes],
  );
  const selectedStroke = selectedStrokes.length === 1 ? selectedStrokes[0] : undefined;
  const selectedGroup = useMemo(() => {
    const groupId = selectedStrokes[0]?.groupId;
    if (!groupId || selectedStrokes.some((strokeItem) => strokeItem.groupId !== groupId))
      return undefined;
    return groups.find((groupItem) => groupItem.id === groupId);
  }, [groups, selectedStrokes]);

  // 选中笔画的联合包围盒（用于显示变换手柄）。框选/拖动中不显示。
  const selBounds = useMemo(() => selectionBounds(selectedStrokes), [selectedStrokes]);

  // 主题变化时，若用户未手动改过画布背景色，则跟随主题切换默认色
  useEffect(() => {
    if (bgColorAutoRef.current) setBgColor(defaultCanvasBg(theme === "dark"));
  }, [theme]);

  // 测量容器尺寸 → 动态坐标系
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 首次测得画布尺寸后，把演示笔画从 1120×720 一次性缩放入场
  useEffect(() => {
    if (scaledRef.current) return;
    if (viewSize.w === 0 || viewSize.h === 0) return;
    scaledRef.current = true;
    setStrokes((current) =>
      current.map((s) => ({
        ...s,
        points: s.points.map((p) => ({
          x: (p.x / INITIAL_W) * viewSize.w,
          y: (p.y / INITIAL_H) * viewSize.h,
        })),
      })),
    );
  }, [viewSize]);

  const commitStrokes = useCallback(
    (next: Stroke[]) => {
      setUndoStack((stack) => [
        ...stack,
        { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
      ]);
      setRedoStack([]);
      setStrokes(next);
    },
    [groups, strokes],
  );
  const commitGroups = useCallback(
    (nextStrokes: Stroke[], nextGroups: StrokeGroup[]) => {
      setUndoStack((stack) => [
        ...stack,
        { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
      ]);
      setRedoStack([]);
      setStrokes(nextStrokes);
      setGroups(nextGroups);
    },
    [groups, strokes],
  );
  const canvasPoint = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * viewSize.w,
        y: ((event.clientY - rect.top) / rect.height) * viewSize.h,
      };
    },
    [viewSize],
  );

  // 渲染
  useEffect(() => {
    const canvas = canvasRef.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (viewSize.w === 0 || viewSize.h === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = viewSize.w * ratio;
    canvas.height = viewSize.h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    off.width = viewSize.w * ratio;
    off.height = viewSize.h * ratio;
    off.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    renderScene({
      ctx,
      size: viewSize,
      strokes,
      groups,
      selectedIds,
      overlapMode,
      draft,
      offscreen: off,
      bgLayout,
      bgColor,
    });
    if (selectionBox) {
      const left = Math.min(selectionBox.start.x, selectionBox.end.x),
        top = Math.min(selectionBox.start.y, selectionBox.end.y);
      const w = Math.abs(selectionBox.end.x - selectionBox.start.x),
        h = Math.abs(selectionBox.end.y - selectionBox.start.y);
      ctx.save();
      ctx.fillStyle = "rgba(59, 130, 246, 0.10)";
      ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
      ctx.setLineDash([8, 6]);
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.restore();
    }
  }, [bgColor, bgLayout, draft, groups, overlapMode, selectedIds, selectionBox, strokes, viewSize]);

  const addStroke = useCallback(
    (stroke: Stroke) => {
      commitStrokes([...strokes, stroke]);
      setSelectedIds([stroke.id]);
    },
    [commitStrokes, strokes],
  );
  const hitTopStroke = useCallback(
    (point: Point) => {
      for (let index = strokes.length - 1; index >= 0; index--)
        if (hitStroke(strokes[index], point)) return strokes[index];
      return undefined;
    },
    [strokes],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    if (mode === "brush") {
      setDraft({ type: "brush", points: [point] });
      return;
    }
    if (mode === "line" || mode === "shape") {
      setDraft({ type: mode, start: point, end: point });
      return;
    }
    const hit = hitTopStroke(point);
    if (hit) {
      if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id]);
      dragRef.current = {
        type: "move",
        last: point,
        startStrokes: cloneStrokes(strokes),
        startGroups: cloneGroups(groups),
      };
      return;
    }
    setSelectedIds([]);
    setSelectionBox({ start: point, end: point });
    dragRef.current = { type: "marquee", start: point };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (draft?.type === "brush") {
      setDraft({ type: "brush", points: [...draft.points, point] });
      return;
    }
    if (draft?.type === "line" || draft?.type === "shape") {
      setDraft({ ...draft, end: point });
      return;
    }
    if (dragRef.current?.type === "move") {
      const dx = point.x - dragRef.current.last.x,
        dy = point.y - dragRef.current.last.y;
      dragRef.current.last = point;
      setStrokes((current) =>
        current.map((stroke) =>
          selectedIds.includes(stroke.id)
            ? {
                ...stroke,
                points: stroke.points.map((item) => ({ x: item.x + dx, y: item.y + dy })),
              }
            : stroke,
        ),
      );
    }
    if (dragRef.current?.type === "marquee")
      setSelectionBox({ start: dragRef.current.start, end: point });
    if (dragRef.current?.type === "resize") applyResizeMove(point);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (draft?.type === "brush") {
      if (draft.points.length > 2)
        addStroke({
          id: createId("stroke"),
          name: `画笔 ${strokes.length + 1}`,
          kind: "brush",
          points: [...draft.points, point],
          width: brushWidth,
          smooth: false,
          smoothing: 55,
          paint: defaultPaint("#7C3AED"),
        });
      setDraft(null);
      return;
    }
    if (draft?.type === "line" || draft?.type === "shape") {
      if (distance(draft.start, point) > 8) {
        const isLine = draft.type === "line";
        addStroke({
          id: createId("stroke"),
          name: `${isLine ? "直线" : SHAPES.find((item) => item.value === shape)?.label} ${strokes.length + 1}`,
          kind: isLine ? "line" : "shape",
          shape: isLine ? undefined : shape,
          points: isLine ? [draft.start, point] : makeShapePoints(shape, draft.start, point),
          width: brushWidth,
          smooth: true,
          smoothing: 70,
          paint: defaultPaint(isLine ? "#0EA5E9" : "#F97316"),
        });
      }
      setDraft(null);
      return;
    }
    if (dragRef.current?.type === "marquee" && selectionBox) {
      setSelectedIds(
        strokes
          .filter((stroke) => boxIntersectsStroke(selectionBox, stroke))
          .map((stroke) => stroke.id),
      );
      setSelectionBox(null);
    }
    if (dragRef.current?.type === "move") {
      const drag = dragRef.current;
      const before = drag.startStrokes;
      if (JSON.stringify(before) !== JSON.stringify(strokes)) {
        setUndoStack((stack) => [
          ...stack,
          { strokes: before, groups: cloneGroups(drag.startGroups) },
        ]);
        setRedoStack([]);
      }
    }
    if (dragRef.current?.type === "resize") {
      applyResizeEnd();
    }
    dragRef.current = null;
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "select" || !selectedStroke || selectedGroup) return;
    const point = canvasPoint(event);
    if (!hitStroke(selectedStroke, point)) return;
    const points = renderPoints(selectedStroke);
    const pos = nearestPercentOnPath(points, point);
    const source = selectedStroke.paint;
    const newStop: PathStop = {
      id: createStopId("stop"),
      hex: colorAtPercent(source.stops, pos, source.space),
      pos: Math.round(pos),
    };
    commitStrokes(
      strokes.map((stroke) =>
        stroke.id === selectedStroke.id
          ? { ...stroke, paint: { ...stroke.paint, stops: [...stroke.paint.stops, newStop] } }
          : stroke,
      ),
    );
  };

  const updateSelectedStroke = (updater: (stroke: Stroke) => Stroke) => {
    if (!selectedStroke) return;
    commitStrokes(
      strokes.map((stroke) => (stroke.id === selectedStroke.id ? updater(stroke) : stroke)),
    );
  };
  const updateSelectedGroup = (updater: (group: StrokeGroup) => StrokeGroup) => {
    if (!selectedGroup) return;
    commitGroups(
      strokes,
      groups.map((groupItem) =>
        groupItem.id === selectedGroup.id ? updater(groupItem) : groupItem,
      ),
    );
  };

  const flushStopDrag = useCallback(() => {
    stopDragRafRef.current = 0;
    const info = stopDragInfoRef.current;
    if (!info || !selectedStroke || selectedGroup) return;
    const points = renderPoints(selectedStroke);
    const point = canvasPoint({ clientX: info.x, clientY: info.y });
    const pos = nearestPercentOnPath(points, point);
    const stopId = info.stopId;
    setStrokes((current) =>
      current.map((stroke) =>
        stroke.id === selectedStroke.id
          ? {
              ...stroke,
              paint: {
                ...stroke.paint,
                stops: stroke.paint.stops.map((stop) =>
                  stop.id === stopId ? { ...stop, pos: Math.round(pos) } : stop,
                ),
              },
            }
          : stroke,
      ),
    );
  }, [canvasPoint, selectedGroup, selectedStroke]);
  const scheduleStopDrag = () => {
    if (stopDragRafRef.current) return;
    stopDragRafRef.current = requestAnimationFrame(flushStopDrag);
  };
  useEffect(
    () => () => {
      if (stopDragRafRef.current) cancelAnimationFrame(stopDragRafRef.current);
    },
    [],
  );

  const setStopPos = (stopId: string, pos: number) =>
    updateSelectedStroke((stroke) => ({
      ...stroke,
      paint: {
        ...stroke.paint,
        stops: stroke.paint.stops.map((stop) =>
          stop.id === stopId ? { ...stop, pos: clamp(Math.round(pos), 0, 100) } : stop,
        ),
      },
    }));
  const setSelectedPaintStop = (stopId: string, hex: string) =>
    updateSelectedStroke((stroke) => ({
      ...stroke,
      paint: {
        ...stroke.paint,
        stops: stroke.paint.stops.map((stop) => (stop.id === stopId ? { ...stop, hex } : stop)),
      },
    }));
  const addStopToSelected = () => {
    if (!selectedStroke || selectedGroup) return;
    const source = selectedStroke.paint;
    const pos = getNextStopPosition(source.stops);
    updateSelectedStroke((stroke) => ({
      ...stroke,
      paint: {
        ...stroke.paint,
        stops: [
          ...stroke.paint.stops,
          { id: createStopId("stop"), hex: colorAtPercent(source.stops, pos, source.space), pos },
        ],
      },
    }));
  };
  const removeStopFromSelected = (stopId: string) =>
    updateSelectedStroke((stroke) =>
      stroke.paint.stops.length <= 2
        ? stroke
        : {
            ...stroke,
            paint: {
              ...stroke.paint,
              stops: stroke.paint.stops.filter((stop) => stop.id !== stopId),
            },
          },
    );
  const setGroupStop = (stopId: string, hex: string) =>
    updateSelectedGroup((groupItem) => ({
      ...groupItem,
      stops: groupItem.stops.map((stop) => (stop.id === stopId ? { ...stop, hex } : stop)),
    }));
  const setGroupStopPos = (stopId: string, pos: number) =>
    updateSelectedGroup((groupItem) => ({
      ...groupItem,
      stops: groupItem.stops.map((stop) =>
        stop.id === stopId ? { ...stop, pos: clamp(Math.round(pos), 0, 100) } : stop,
      ),
    }));

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    commitGroups(
      strokes.filter((stroke) => !selectedIds.includes(stroke.id)),
      groups
        .map((groupItem) => ({
          ...groupItem,
          strokeIds: groupItem.strokeIds.filter((id) => !selectedIds.includes(id)),
        }))
        .filter((groupItem) => groupItem.strokeIds.length > 1),
    );
    setSelectedIds([]);
  }, [commitGroups, groups, selectedIds, strokes]);
  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const copies = selectedStrokes.map((stroke, index) => ({
      ...stroke,
      id: createId("stroke"),
      name: `${stroke.name} 副本`,
      groupId: undefined,
      points: stroke.points.map((point) => ({
        x: point.x + 28 + index * 8,
        y: point.y + 28 + index * 8,
      })),
      paint: clonePaint(stroke.paint),
    }));
    commitStrokes([...strokes, ...copies]);
    setSelectedIds(copies.map((copyItem) => copyItem.id));
  }, [commitStrokes, selectedIds.length, selectedStrokes, strokes]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, duplicateSelected]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((stack) => [
      ...stack,
      { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
    ]);
    setStrokes(cloneStrokes(previous.strokes));
    setGroups(cloneGroups(previous.groups));
    setUndoStack((stack) => stack.slice(0, -1));
    setSelectedIds([]);
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((stack) => [
      ...stack,
      { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
    ]);
    setStrokes(cloneStrokes(next.strokes));
    setGroups(cloneGroups(next.groups));
    setRedoStack((stack) => stack.slice(0, -1));
    setSelectedIds([]);
  };
  const createGroup = () => {
    if (selectedIds.length < 2) return;
    const id = createId("group");
    commitGroups(
      strokes.map((stroke) =>
        selectedIds.includes(stroke.id) ? { ...stroke, groupId: id } : stroke,
      ),
      [
        ...groups,
        {
          id,
          name: `组合 ${groups.length + 1}`,
          strokeIds: [...selectedIds],
          stops: cloneStops(DEFAULT_STOPS),
          space: "rgb",
        },
      ],
    );
    toast.success("已创建组合渐变");
  };
  const ungroup = () => {
    if (!selectedGroup) return;
    commitGroups(
      strokes.map((stroke) =>
        stroke.groupId === selectedGroup.id ? { ...stroke, groupId: undefined } : stroke,
      ),
      groups.filter((groupItem) => groupItem.id !== selectedGroup.id),
    );
  };
  const moveLayer = (direction: "front" | "back") => {
    if (!selectedIds.length) return;
    const selected = strokes.filter((stroke) => selectedIds.includes(stroke.id));
    const rest = strokes.filter((stroke) => !selectedIds.includes(stroke.id));
    commitStrokes(direction === "front" ? [...rest, ...selected] : [...selected, ...rest]);
  };
  const clearCanvas = () => {
    if (!window.confirm("确定清空画布？此操作可用撤销恢复。")) return;
    commitGroups([], []);
    setSelectedIds([]);
  };
  const addPresetStroke = () => {
    if (viewSize.w === 0) return;
    const cx = viewSize.w / 2,
      cy = viewSize.h / 2,
      halfW = 220,
      halfH = 150;
    addStroke({
      id: createId("stroke"),
      name: `${PRESETS.find((item) => item.value === presetShape)?.label} ${strokes.length + 1}`,
      kind: "shape",
      shape: presetShape,
      points: makeShapePoints(
        presetShape,
        { x: cx - halfW, y: cy - halfH },
        { x: cx + halfW, y: cy + halfH },
      ),
      width: brushWidth,
      smooth: true,
      smoothing: 70,
      paint: defaultPaint("#8B5CF6"),
    });
    setMode("select");
  };
  const exportPng = (scale: number) => {
    if (viewSize.w === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = viewSize.w * scale;
    canvas.height = viewSize.h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const off = document.createElement("canvas");
    off.width = viewSize.w * scale;
    off.height = viewSize.h * scale;
    off.getContext("2d")?.setTransform(scale, 0, 0, scale, 0, 0);
    renderScene({
      ctx,
      size: viewSize,
      strokes,
      groups,
      overlapMode,
      offscreen: off,
      bgLayout,
      bgColor,
    });
    const link = document.createElement("a");
    link.download = `colora-canvas-${scale}x.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const svgCode = useMemo(
    () => createSvg(viewSize, strokes, groups, overlapMode, bgLayout, bgColor),
    [bgColor, bgLayout, groups, overlapMode, strokes, viewSize],
  );
  const jsonCode = useMemo(
    () =>
      JSON.stringify(
        {
          type: "canvas",
          version: 2,
          size: viewSize,
          overlapMode,
          background: { layout: bgLayout, color: bgColor },
          strokes,
          groups,
        },
        null,
        2,
      ),
    [bgColor, bgLayout, groups, overlapMode, strokes, viewSize],
  );
  const saveLocal = () => {
    localStorage.setItem("colora.canvas.latest", jsonCode);
    toast.success("已保存到本地画布方案");
  };
  const copyText = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  };
  const toolButtons: { id: Mode; label: string; icon: typeof MousePointer2 }[] = [
    { id: "select", label: "选择", icon: MousePointer2 },
    { id: "brush", label: "画笔", icon: Paintbrush },
    { id: "line", label: "直线", icon: Slash },
    { id: "shape", label: "形状", icon: Shapes },
  ];

  // 画布上的路径色标手柄（仅选中单笔画、渐变模式、非组）
  const stopHandles = useMemo(() => {
    if (!selectedStroke || selectedGroup) return [];
    if (selectedStroke.paint.mode !== "gradient") return [];
    if (viewSize.w === 0) return [];
    const points = renderPoints(selectedStroke);
    const total = totalLength(points);
    if (total <= 0) return [];
    return selectedStroke.paint.stops.map((stop) => {
      const p = pointAtLength(points, percentToLength(stop.pos, total));
      return { stop, left: (p.x / viewSize.w) * 100, top: (p.y / viewSize.h) * 100 };
    });
  }, [selectedStroke, selectedGroup, viewSize]);

  // 选中笔画的变换手柄（八向缩放）。框选/拖动草稿中不显示。
  const resizeHandles = useMemo(() => {
    if (!selBounds || viewSize.w === 0 || viewSize.h === 0) return [];
    if (draft || selectionBox) return [];
    const cursors: Record<ResizeHandle, string> = {
      nw: "nwse-resize",
      n: "ns-resize",
      ne: "nesw-resize",
      e: "ew-resize",
      se: "nwse-resize",
      s: "ns-resize",
      sw: "nesw-resize",
      w: "ew-resize",
    };
    return (Object.keys(cursors) as ResizeHandle[]).map((handle) => {
      const p = handlePoint(selBounds, handle);
      return {
        handle,
        cursor: cursors[handle],
        left: (p.x / viewSize.w) * 100,
        top: (p.y / viewSize.h) * 100,
      };
    });
  }, [draft, selBounds, selectionBox, viewSize]);

  const onResizeHandlePointerDown = (event: React.PointerEvent, handle: ResizeHandle) => {
    if (!selBounds) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = canvasPoint(event);
    // box 用点的真实包围盒（无 padding），缩放以点的真实范围为基准，
    // 避免外框 padding 参与缩放导致"鼠标动一点、线条大幅变动"的杠杆放大。
    const box = unionRenderBounds(selectedStrokes) ?? { ...selBounds };
    dragRef.current = {
      type: "resize",
      handle,
      origin,
      box,
      startStrokes: cloneStrokes(selectedStrokes),
      startGroups: cloneGroups(groups),
    };
  };
  // 把 resize 拖动逻辑抽出来，手柄 button（已 capture 指针）和 canvas 都可调用
  const applyResizeMove = useCallback(
    (point: Point) => {
      const drag = dragRef.current;
      if (drag?.type !== "resize") return;
      const { mapPoint } = resizeTransform(drag.box, drag.handle, drag.origin, point);
      const ids = new Set(selectedIds);
      const snapshot = drag.startStrokes; // 始终从按下时的原始点快照映射，避免在已缩放点上重复应用导致指数累积
      setStrokes((current) =>
        current.map((stroke) => {
          if (!ids.has(stroke.id)) return stroke;
          const original = snapshot.find((s) => s.id === stroke.id);
          if (!original) return stroke;
          return { ...stroke, points: original.points.map((p) => mapPoint(p)) };
        }),
      );
    },
    [selectedIds],
  );
  const applyResizeEnd = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.type !== "resize") return;
    const before = drag.startStrokes;
    if (JSON.stringify(before) !== JSON.stringify(strokes)) {
      setUndoStack((stack) => [
        ...stack,
        { strokes: before, groups: cloneGroups(drag.startGroups) },
      ]);
      setRedoStack([]);
    }
    dragRef.current = null;
  }, [strokes]);

  // ---- 面板内斜坡条手柄拖动（改 pos） ----
  const onRampHandlePointerDown = (event: React.PointerEvent, stopId: string) => {
    event.stopPropagation();
    rampDragRef.current = { stopId, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onRampHandlePointerMove = (event: React.PointerEvent) => {
    const d = rampDragRef.current;
    if (!d) return;
    const ramp = rampRef.current;
    if (!ramp) return;
    const rect = ramp.getBoundingClientRect();
    const pos = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    if (selectedGroup) setGroupStopPos(d.stopId, pos);
    else setStopPos(d.stopId, pos);
  };
  const onRampHandlePointerUp = (event: React.PointerEvent) => {
    rampDragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  // 当前编辑的色标来源（组或选中笔画）
  const setEditingSpace = (s: InterpSpace) => {
    if (selectedGroup) updateSelectedGroup((g) => ({ ...g, space: s }));
    else if (selectedStroke)
      updateSelectedStroke((st) => ({ ...st, paint: { ...st.paint, space: s } }));
  };
  const setEditingStopPos = (stopId: string, pos: number) => {
    if (selectedGroup) setGroupStopPos(stopId, pos);
    else setStopPos(stopId, pos);
  };
  const setEditingStopHex = (stopId: string, hex: string) => {
    if (selectedGroup) setGroupStop(stopId, hex);
    else setSelectedPaintStop(stopId, hex);
  };
  const removeEditingStop = (stopId: string) => {
    if (selectedGroup) {
      if (selectedGroup.stops.length > 2)
        updateSelectedGroup((g) => ({ ...g, stops: g.stops.filter((s) => s.id !== stopId) }));
    } else removeStopFromSelected(stopId);
  };

  return (
    <section
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-white dark:bg-neutral-950"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Colora 画布工作区"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        className={cn(
          "absolute inset-0 h-full w-full touch-none",
          mode === "select" ? "cursor-default" : "cursor-crosshair",
        )}
      />

      {/* 画布上的路径色标手柄 */}
      {stopHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 touch-none">
          {stopHandles.map(({ stop, left, top }) => (
            <button
              key={stop.id}
              type="button"
              aria-label={`色标 ${Math.round(stop.pos)}%`}
              className="pointer-events-auto absolute size-5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white shadow-[0_0_0_1px_var(--color-border),0_6px_18px_rgb(0_0_0/0.30)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${left}%`, top: `${top}%`, backgroundColor: stop.hex }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                stopDragInfoRef.current = { stopId: stop.id, x: event.clientX, y: event.clientY };
                flushStopDrag();
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                stopDragInfoRef.current = { stopId: stop.id, x: event.clientX, y: event.clientY };
                scheduleStopDrag();
              }}
              onPointerUp={() => {
                stopDragInfoRef.current = null;
              }}
              onPointerCancel={() => {
                stopDragInfoRef.current = null;
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  const step = event.shiftKey ? 5 : 1;
                  setStopPos(stop.id, stop.pos + (event.key === "ArrowLeft" ? -step : step));
                }
              }}
            />
          ))}
        </div>
      )}

      {/* 选中笔画变换手柄（八向缩放） */}
      {resizeHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 touch-none">
          {resizeHandles.map(({ handle, cursor, left, top }) => (
            <button
              key={handle}
              type="button"
              aria-label={`缩放手柄 ${handle}`}
              className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-sm border border-blue-500 bg-white shadow-[0_0_0_1px_rgb(255_255_255)] outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${left}%`, top: `${top}%`, cursor }}
              onPointerDown={(event) => onResizeHandlePointerDown(event, handle)}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                applyResizeMove(canvasPoint(event));
              }}
              onPointerUp={() => applyResizeEnd()}
              onPointerCancel={() => applyResizeEnd()}
            />
          ))}
        </div>
      )}

      {/* 悬浮工具栏 */}
      <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-border/60 bg-background/80 p-1.5 shadow-lg backdrop-blur-md">
        {toolButtons.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              type="button"
              variant={mode === item.id ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => setMode(item.id)}
            >
              <Icon className="size-4" />
              <span className="hidden text-xs sm:inline">{item.label}</span>
            </Button>
          );
        })}
        <select
          value={shape}
          onChange={(event) => setShape(event.target.value as ShapeType)}
          disabled={mode !== "shape"}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs outline-none disabled:opacity-50"
          aria-label="预设形状"
        >
          {SHAPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <select
          value={presetShape}
          onChange={(event) => setPresetShape(event.target.value as ShapeType)}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs outline-none"
          aria-label="预设路径"
        >
          {PRESETS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-1 px-2.5"
          onClick={addPresetStroke}
        >
          <Plus className="size-3.5" /> <span className="text-xs">添加</span>
        </Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={undo}
          disabled={!undoStack.length}
          aria-label="撤销"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={redo}
          disabled={!redoStack.length}
          aria-label="重做"
        >
          <Redo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={clearCanvas}
          aria-label="清空画布"
        >
          <Trash2 className="size-4" />
        </Button>
        <div className="ml-1 hidden items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
          <Sparkles className="size-3" />
          {strokes.length} 线 · {groups.length} 组
        </div>
      </div>

      {/* 右上角书页卷角：hover 卷边，点击翻页展开编辑面板 */}
      <div className="page-3d absolute right-0 top-0 z-30">
        {panelAnim === "closed" && (
          <button
            type="button"
            aria-label="展开编辑面板"
            onClick={openPanel}
            className="colora-corner absolute right-0 top-0 size-16 cursor-pointer backdrop-blur-md"
          />
        )}
        {panelAnim !== "closed" && (
          <div
            onAnimationEnd={onPanelAnimationEnd}
            className={cn(
              "absolute right-0 top-0 flex max-h-[70dvh] w-80 flex-col overflow-hidden rounded-b-2xl rounded-l-2xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-md",
              panelAnim === "opening" && "animate-page-open",
              panelAnim === "closing" && "animate-page-close",
            )}
          >
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-3 py-2">
              <span className="flex-1 text-xs font-medium tracking-wide text-muted-foreground">
                编辑
              </span>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={closePanel}
                aria-label="收起面板"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-[11px] text-muted-foreground">
                {selectedStrokes.length
                  ? `已选中 ${selectedStrokes.length} 条线条`
                  : "选择线条后可编辑颜色、粗细与平滑。"}
              </p>

              <SliderRow
                label="默认线宽"
                value={brushWidth}
                unit="px"
                min={1}
                max={100}
                onChange={setBrushWidth}
              />

              {selectedStroke && !selectedGroup && (
                <ColorEditor
                  title={selectedStroke.name}
                  paint={selectedStroke.paint}
                  rampRef={rampRef}
                  onRampHandlePointerDown={onRampHandlePointerDown}
                  onRampHandlePointerMove={onRampHandlePointerMove}
                  onRampHandlePointerUp={onRampHandlePointerUp}
                  onStopPos={setEditingStopPos}
                  onStopHex={setEditingStopHex}
                  onRemoveStop={removeEditingStop}
                  onAddStop={addStopToSelected}
                  onSetSpace={setEditingSpace}
                  onSetMode={(m) =>
                    updateSelectedStroke((stroke) => ({
                      ...stroke,
                      paint: { ...stroke.paint, mode: m },
                    }))
                  }
                  onSetSolid={(hex) =>
                    updateSelectedStroke((stroke) => ({
                      ...stroke,
                      paint: { ...stroke.paint, solid: hex },
                    }))
                  }
                  extra={
                    selectedStroke.kind === "brush" ? (
                      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                        <label className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">平滑</span>
                          <input
                            type="checkbox"
                            checked={selectedStroke.smooth}
                            onChange={(event) =>
                              updateSelectedStroke((stroke) => ({
                                ...stroke,
                                smooth: event.target.checked,
                              }))
                            }
                          />
                        </label>
                        <SliderRow
                          label="平滑度"
                          value={selectedStroke.smoothing}
                          unit="%"
                          min={0}
                          max={100}
                          onChange={(v) =>
                            updateSelectedStroke((stroke) => ({ ...stroke, smoothing: v }))
                          }
                        />
                      </div>
                    ) : null
                  }
                />
              )}

              {selectedGroup && (
                <ColorEditor
                  title="组合渐变"
                  subtitle="统一色阶沿组内每条线条各自的路径分布"
                  paint={{
                    mode: "gradient",
                    solid: selectedStroke?.paint.solid ?? "#7C3AED",
                    stops: selectedGroup.stops,
                    space: selectedGroup.space,
                  }}
                  rampRef={rampRef}
                  onRampHandlePointerDown={onRampHandlePointerDown}
                  onRampHandlePointerMove={onRampHandlePointerMove}
                  onRampHandlePointerUp={onRampHandlePointerUp}
                  onStopPos={setEditingStopPos}
                  onStopHex={setEditingStopHex}
                  onRemoveStop={removeEditingStop}
                  onAddStop={addStopToSelected}
                  onSetSpace={setEditingSpace}
                  hideModeToggle
                />
              )}

              <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium text-muted-foreground">画布背景</div>
                  <button
                    type="button"
                    onClick={() => {
                      bgColorAutoRef.current = true;
                      setBgColor(defaultCanvasBg(isDark));
                    }}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    跟随主题
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CANVAS_LAYOUTS.map((item) => (
                    <Button
                      key={item.value}
                      type="button"
                      size="sm"
                      variant={bgLayout === item.value ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setBgLayout(item.value)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CANVAS_BG_PRESETS.map((item) => (
                    <button
                      key={item.hex}
                      type="button"
                      title={`${item.label} ${item.hex}`}
                      aria-label={`${item.label} ${item.hex}`}
                      onClick={() => {
                        bgColorAutoRef.current = false;
                        setBgColor(item.hex);
                      }}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-md border text-[10px] transition-transform hover:scale-[1.03]",
                        bgColor.toUpperCase() === item.hex
                          ? "border-foreground ring-2 ring-ring"
                          : "border-border/60",
                      )}
                      style={{ backgroundColor: item.hex, color: bestTextOn(item.hex) }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                <div className="text-[11px] font-medium text-muted-foreground">重叠处理</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={overlapMode === "mix" ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setOverlapMode("mix")}
                  >
                    自动混色
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={overlapMode === "cover" ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setOverlapMode("cover")}
                  >
                    前层覆盖
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-border/60 pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={createGroup}
                  disabled={selectedIds.length < 2}
                >
                  <Group className="size-3.5" /> 组合
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={ungroup}
                  disabled={!selectedGroup}
                >
                  <Ungroup className="size-3.5" /> 取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => moveLayer("front")}
                  disabled={!selectedIds.length}
                >
                  上移顶层
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => moveLayer("back")}
                  disabled={!selectedIds.length}
                >
                  下移底层
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="col-span-2 h-7 gap-1 text-xs"
                  onClick={deleteSelected}
                  disabled={!selectedIds.length}
                >
                  <Trash2 className="size-3.5" /> 删除选中
                </Button>
              </div>

              <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Download className="size-3.5" /> 导出
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3].map((scale) => (
                    <Button
                      key={scale}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => exportPng(scale)}
                    >
                      PNG {scale}×
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => downloadText("colora-canvas.svg", svgCode, "image/svg+xml")}
                  >
                    SVG
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => downloadText("colora-canvas.json", jsonCode, "application/json")}
                  >
                    JSON
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 text-xs"
                    onClick={() => copyText(svgCode, "SVG 代码已复制")}
                  >
                    <Code2 className="size-3.5" /> SVG
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 text-xs"
                    onClick={() => copyText(jsonCode, "JSON 已复制")}
                  >
                    <Copy className="size-3.5" /> JSON
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={saveLocal}
                  className="h-7 w-full gap-1 text-xs"
                >
                  <Save className="size-3.5" /> 保存到我的方案
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  颜色随路径弯曲分布，CSS 无法表达任意路径渐变，故不提供 CSS 导出。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 右上角书页卷角（SVG）。
 * 画一个被掀起且向后翻卷的纸角：主体纸面 + 翻卷的背面(弧形) + 纸缘高光 + 投影。
 * 颜色随画布背景明度自动取对比色，保证任意背景上都清晰可辨。
 */
function CornerFold({ bg }: { bg: string }) {
  const t = useMemo(() => cornerTone(bg), [bg]);
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {/* 投影：卷背在画布上的柔和投影 */}
      <ellipse cx="44" cy="54" rx="26" ry="9" fill={t.shade} />
      {/* 纸面：右上角的主体三角形 */}
      <path
        d="M2 2 L62 2 L62 62 Z"
        fill={t.fold}
      />
      {/* 纸面上淡淡的斜向高光，模拟纸面质感 */}
      <path
        d="M2 2 L62 2 L62 62 Z"
        fill="none"
        stroke={t.edge}
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      {/* 卷背面：从斜边向右下翻卷的弧形纸背 */}
      <path
        d="M3 3 C20 20 44 46 62 61 C50 44 30 20 3 3 Z"
        fill={t.back}
      />
      {/* 纸缘高光：卷背的卷曲边缘亮线 */}
      <path
        d="M3 3 C20 20 44 46 62 61"
        fill="none"
        stroke={t.edge}
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      {/* 卷背内缘的过渡暗面 */}
      <path
        d="M3 3 C20 20 44 46 62 61 C44 40 20 16 3 3 Z"
        fill="rgb(0 0 0 / 0.06)"
      />
    </svg>
  );
}

/** 极简单色风颜色编辑器：斜坡条 + 细色标行 + mono 数字 + 插值空间分段 */
function ColorEditor({
  title,
  subtitle,
  paint,
  rampRef,
  onRampHandlePointerDown,
  onRampHandlePointerMove,
  onRampHandlePointerUp,
  onStopPos,
  onStopHex,
  onRemoveStop,
  onAddStop,
  onSetSpace,
  onSetMode,
  onSetSolid,
  hideModeToggle,
  extra,
}: {
  title: string;
  subtitle?: string;
  paint: StrokePaint;
  rampRef: React.RefObject<HTMLDivElement | null>;
  onRampHandlePointerDown: (e: React.PointerEvent, stopId: string) => void;
  onRampHandlePointerMove: (e: React.PointerEvent) => void;
  onRampHandlePointerUp: (e: React.PointerEvent) => void;
  onStopPos: (stopId: string, pos: number) => void;
  onStopHex: (stopId: string, hex: string) => void;
  onRemoveStop: (stopId: string) => void;
  onAddStop: () => void;
  onSetSpace: (space: InterpSpace) => void;
  onSetMode?: (mode: PaintMode) => void;
  onSetSolid?: (hex: string) => void;
  hideModeToggle?: boolean;
  extra?: React.ReactNode;
}) {
  const stops = paint.stops;
  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-xs font-medium">{title}</div>
        {subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>

      {!hideModeToggle && onSetMode && (
        <div className="flex gap-1">
          {(["solid", "gradient"] as PaintMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onSetMode(m)}
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[11px] uppercase",
                paint.mode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {m === "solid" ? "纯色" : "渐变"}
            </button>
          ))}
        </div>
      )}

      {paint.mode === "solid" ? (
        onSetSolid && (
          <div className="rounded-lg border border-border/60 p-2">
            <ColorPicker compact value={paint.solid} onChange={onSetSolid} />
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {/* 斜坡条 + 手柄 */}
          <div ref={rampRef} className="relative h-7 w-full rounded-md border border-border/60">
            <div className="absolute inset-0 rounded-md" style={{ background: rampCss(stops) }} />
            {[...stops]
              .sort((a, b) => a.pos - b.pos)
              .map((stop) => (
                <div
                  key={stop.id}
                  onPointerDown={(e) => onRampHandlePointerDown(e, stop.id)}
                  onPointerMove={onRampHandlePointerMove}
                  onPointerUp={onRampHandlePointerUp}
                  onPointerCancel={onRampHandlePointerUp}
                  className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-[4px] border border-foreground/70 shadow active:cursor-grabbing"
                  style={{ left: `${clamp(stop.pos, 0, 100)}%`, backgroundColor: stop.hex }}
                  aria-label={`色标 ${Math.round(stop.pos)}%`}
                />
              ))}
          </div>

          {/* 插值空间 */}
          <div className="flex gap-1">
            {INTERP_SPACES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSetSpace(s)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-mono text-[11px] uppercase",
                  paint.space === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* 色标列表 */}
          <div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
            {[...stops]
              .sort((a, b) => a.pos - b.pos)
              .map((stop) => (
                <div key={stop.id} className="flex items-center gap-2 bg-background/60 px-2 py-1.5">
                  <SwatchPopover hex={stop.hex} onChange={(hex) => onStopHex(stop.id, hex)} />
                  <span className="flex-1 truncate font-mono text-xs">
                    {stop.hex.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(stop.pos)}
                    onChange={(event) => onStopPos(stop.id, Number(event.target.value))}
                    className="h-6 w-14 rounded border border-input bg-background px-1 text-right font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
                    aria-label="色标位置百分比"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">%</span>
                  <button
                    type="button"
                    aria-label="删除色标"
                    disabled={stops.length <= 2}
                    onClick={() => onRemoveStop(stop.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
          </div>

          <button
            type="button"
            onClick={onAddStop}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border/70 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3" /> 添加色标
          </button>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            拖动画布上的圆点可沿路径移动色标，选中后按 ←/→ 微调（Shift 加速）。
          </p>
        </div>
      )}

      {extra}
    </div>
  );
}

function SwatchPopover({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="编辑颜色"
        className="size-6 rounded-md border border-border/80 shadow-sm"
        style={{ backgroundColor: hex }}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-lg border border-border bg-background p-2 shadow-xl">
            <ColorPicker value={hex} onChange={onChange} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-1 w-full rounded-md py-1 text-[11px] text-muted-foreground hover:bg-accent"
            >
              完成
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full"
      />
    </div>
  );
}
