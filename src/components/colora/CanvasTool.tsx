import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
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
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Ungroup,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ColorPicker } from "./primitives";
import { cn } from "@/lib/utils";
import { useColora } from "@/lib/colora-store";
import {
  createStopId,
  drawGradientStroke,
  type InterpSpace,
  nearestPercentOnPath,
  type PathStop,
  pointAtLength,
  percentToLength,
  shapePoints as makeShapePoints,
  stopAtPercent,
  svgGradientStroke,
  totalLength,
  type Point,
  type ShapeType,
} from "@/lib/path-gradient";
import { bestTextOn, relativeLuminance, hexToRgb, hslToRgb, rgbToHex, rgbToHsl, hexAlphaToCss } from "@/lib/color";

type Mode = "select" | "brush" | "line" | "shape";
type StrokeKind = "brush" | "line" | "shape";
type PaintMode = "solid" | "gradient";
type OverlapMode = "mix" | "cover";
type CanvasLayout = "grid" | "blank" | "dots";
type InspectorTab = "line" | "canvas";
type StrokePaint = { mode: PaintMode; solid: string; stops: PathStop[]; space: InterpSpace };
type Stroke = {
  id: string;
  name: string;
  kind: StrokeKind;
  shape?: ShapeType;
  points: Point[];
  width: number;
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
  { id: "stop-a", hex: "#8B5CF6", pos: 0, alpha: 100 },
  { id: "stop-b", hex: "#06B6D4", pos: 50, alpha: 100 },
  { id: "stop-c", hex: "#F97316", pos: 100, alpha: 100 },
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
 * Build shared colors for the inspector trigger and floating panel.
 */
function inspectorTone(bg: string): { surface: string; icon: string; border: string; shade: string } {
  const rgb = hexToRgb(bg);
  const lum = relativeLuminance(rgb);
  const dark = lum < 0.5;

  if (dark) {
    return {
      surface: "rgb(10 10 10 / 0.96)",
      icon: "rgb(229 229 229)",
      border: "rgb(255 255 255 / 0.10)",
      shade: "rgb(0 0 0 / 0.38)",
    };
  }

  return {
    surface: "rgb(250 250 250 / 0.96)",
    icon: "rgb(24 24 27)",
    border: "rgb(0 0 0 / 0.12)",
    shade: "rgb(0 0 0 / 0.18)",
  };
}

// 适合用作画布背景的常用色（线条颜色不受其影响）
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
    paint: {
      mode: "gradient",
      solid: "#06B6D4",
      stops: [
        { id: "demo-2-a", hex: "#06B6D4", pos: 0, alpha: 100 },
        { id: "demo-2-b", hex: "#22C55E", pos: 100, alpha: 100 },
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
 * 单笔实际渲染几何的包围盒。渲染为原始折线（直线段），故直接取 points 的 min/max。
 */
function renderBounds(stroke: Stroke): Bounds {
  const points = renderPoints(stroke);
  return getBounds(points);
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
  return stroke.points;
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
// 始终输出原始折线（直线段），不二次贝塞尔平滑——与画布渲染及沿路径渐变几何一致。
function toPathData(points: Point[]) {
  if (!points.length) return "";
  return points
    .map(
      (point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
}
// 始终以原始折线（直线段）描边，不二次贝塞尔平滑——与沿路径渐变的直线细分几何一致，
// 切换"纯色/沿路径"只改颜色，不改线条形状与走向（转角保持原样）。
function drawPath(ctx: CanvasRenderingContext2D, points: Point[], closed = false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
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
  showBackground = true,
  showSelection = true,
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
  showBackground?: boolean;
  showSelection?: boolean;
}) {
  const { w, h } = size;
  if (w === 0 || h === 0) return;
  ctx.clearRect(0, 0, w, h);
  if (showBackground) drawBackground(ctx, size, bgLayout, bgColor);

  const drawStroke = (target: CanvasRenderingContext2D, stroke: Stroke) => {
    const points = renderPoints(stroke);
    if (points.length < 2) return;
    const source = paintSource(stroke, groups);
    const closed = isClosedShape(stroke);
    if (source.mode === "solid") {
      drawPath(target, points, closed);
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
    drawPath(ctx, points, draft.type === "shape");
    ctx.stroke();
    ctx.restore();
  }
  if (showSelection && selectedIds.length) {
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
  includeBackground = true,
) {
  const groupsXml: string[] = [];
  const mix = overlapMode === "mix";
  strokes.forEach((stroke) => {
    const points = renderPoints(stroke);
    if (points.length < 2) return;
    const source = paintSource(stroke, groups);
    const closed = isClosedShape(stroke);
    if (source.mode === "solid") {
      const d = toPathData(points) + (closed ? " Z" : "");
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
  const dragRef = useRef<DragState | null>(null);
  const scaledRef = useRef(false);
  const stopDragRafRef = useRef(0);
  const stopDragInfoRef = useRef<{ stopId: string; x: number; y: number } | null>(null);

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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("canvas");

  const openCanvasInspector = useCallback(() => {
    setInspectorTab("canvas");
    setInspectorOpen((open) => !(open && inspectorTab === "canvas"));
  }, [inspectorTab]);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

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

  useEffect(() => {
    if (mode !== "select") return;
    if (!selectedStrokes.length) return;
    setInspectorTab("line");
    setInspectorOpen(true);
  }, [mode, selectedStrokes.length]);

  useEffect(() => {
    if (mode !== "select" || selectedStrokes.length || inspectorTab !== "line") return;
    setInspectorOpen(false);
  }, [inspectorTab, mode, selectedStrokes.length]);

  // 选中笔画的联合包围盒（用于显示变换手柄）。框选/拖动中不显示。
  const selBounds = useMemo(() => selectionBounds(selectedStrokes), [selectedStrokes]);

  // Shared colors for the inspector trigger and panel
  const cornerStyle = useMemo<React.CSSProperties>(() => {
    const c = inspectorTone(bgColor);
    return {
      "--inspector-surface": c.surface,
      "--inspector-icon": c.icon,
      "--inspector-border": c.border,
      "--inspector-shade": c.shade,
    } as React.CSSProperties;
  }, [bgColor]);

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
    closeInspector();
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
    const picked = stopAtPercent(source.stops, pos, source.space);
    const newStop: PathStop = {
      id: createStopId("stop"),
      hex: picked.hex,
      alpha: picked.alpha,
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
  const updateSelectedStrokes = (updater: (stroke: Stroke) => Stroke) => {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    commitStrokes(strokes.map((stroke) => (ids.has(stroke.id) ? updater(stroke) : stroke)));
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
          { id: createStopId("stop"), hex: stopAtPercent(source.stops, pos, source.space).hex, alpha: 100, pos },
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
  const selectedExportBounds = () => {
    const bounds = unionRenderBounds(selectedStrokes);
    if (!bounds) return undefined;
    const padding = Math.max(16, Math.max(...selectedStrokes.map((stroke) => stroke.width)) / 2 + 12);
    const minX = clamp(Math.floor(bounds.minX - padding), 0, viewSize.w);
    const minY = clamp(Math.floor(bounds.minY - padding), 0, viewSize.h);
    const maxX = clamp(Math.ceil(bounds.maxX + padding), 0, viewSize.w);
    const maxY = clamp(Math.ceil(bounds.maxY + padding), 0, viewSize.h);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  };
  const selectedScene = () => {
    const ids = new Set(selectedIds);
    const selected = strokes.filter((stroke) => ids.has(stroke.id));
    const selectedStrokeIds = new Set(selected.map((stroke) => stroke.id));
    const selectedGroups = groups
      .map((groupItem) => ({
        ...groupItem,
        strokeIds: groupItem.strokeIds.filter((id) => selectedStrokeIds.has(id)),
      }))
      .filter((groupItem) => groupItem.strokeIds.length > 1);
    return { selected, selectedGroups };
  };
  const exportSelectedPng = (includeBackground: boolean) => {
    const bounds = selectedExportBounds();
    if (!bounds) return;
    const { selected, selectedGroups } = selectedScene();
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(-bounds.minX, -bounds.minY);
    const off = document.createElement("canvas");
    off.width = viewSize.w;
    off.height = viewSize.h;
    renderScene({
      ctx,
      size: viewSize,
      strokes: selected,
      groups: selectedGroups,
      overlapMode,
      offscreen: off,
      bgLayout,
      bgColor,
      showBackground: includeBackground,
      showSelection: false,
    });
    const link = document.createElement("a");
    link.download = includeBackground ? "colora-selection-bg.png" : "colora-selection.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const selectedSvgCode = (includeBackground: boolean) => {
    const bounds = selectedExportBounds();
    if (!bounds) return "";
    const { selected, selectedGroups } = selectedScene();
    const shifted = selected.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY })),
    }));
    return createSvg(
      { w: bounds.width, h: bounds.height },
      shifted,
      selectedGroups,
      overlapMode,
      bgLayout,
      bgColor,
      includeBackground,
    );
  };
  const exportSelectedSvg = (includeBackground: boolean) => {
    const code = selectedSvgCode(includeBackground);
    if (!code) return;
    downloadText(
      includeBackground ? "colora-selection-bg.svg" : "colora-selection.svg",
      code,
      "image/svg+xml",
    );
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

  const selectionPaint = selectedGroup
    ? {
        mode: "gradient" as PaintMode,
        solid: selectedStroke?.paint.solid ?? "#7C3AED",
        stops: selectedGroup.stops,
        space: selectedGroup.space,
      }
    : selectedStrokes[0]?.paint;
  const updateSelectionPaint = (updater: (paint: StrokePaint) => StrokePaint) => {
    if (selectedGroup) {
      updateSelectedGroup((groupItem) => {
        const next = updater({
          mode: "gradient",
          solid: selectedStroke?.paint.solid ?? "#7C3AED",
          stops: cloneStops(groupItem.stops),
          space: groupItem.space,
        });
        return { ...groupItem, stops: cloneStops(next.stops), space: next.space };
      });
      return;
    }
    updateSelectedStrokes((stroke) => ({ ...stroke, paint: updater(clonePaint(stroke.paint)) }));
  };
  const setSelectionStopPos = (stopId: string, pos: number) => {
    if (!selectionPaint) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop, i) =>
        i === index ? { ...stop, pos: clamp(Math.round(pos), 0, 100) } : stop,
      ),
    }));
  };
  const setSelectionStopHex = (stopId: string, hex: string) => {
    if (!selectionPaint) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop, i) => (i === index ? { ...stop, hex } : stop)),
    }));
  };
  const setSelectionStopAlpha = (stopId: string, alpha: number) => {
    if (!selectionPaint) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop, i) =>
        i === index ? { ...stop, alpha: clamp(Math.round(alpha), 0, 100) } : stop,
      ),
    }));
  };
  // 复制色标：在 sorted 中该色标之后插入同色同 alpha 的新色标，pos 比原值 +1（夹到 100）
  const duplicateSelectionStop = (stopId: string) => {
    if (!selectionPaint) return;
    const sorted = [...selectionPaint.stops].sort((a, b) => a.pos - b.pos);
    const idx = sorted.findIndex((stop) => stop.id === stopId);
    if (idx < 0) return;
    const src = sorted[idx];
    const newStop: PathStop = {
      id: createStopId("stop"),
      hex: src.hex,
      alpha: src.alpha,
      pos: clamp(src.pos + 1, 0, 100),
    };
    updateSelectionPaint((paint) => ({ ...paint, stops: [...paint.stops, newStop] }));
  };
  const addSelectionStop = () => {
    if (!selectionPaint) return;
    const pos = getNextStopPosition(selectionPaint.stops);
    const newStop = {
      id: createStopId("stop"),
      hex: stopAtPercent(selectionPaint.stops, pos, selectionPaint.space).hex,
      alpha: 100,
      pos,
    };
    updateSelectionPaint((paint) => ({ ...paint, stops: [...paint.stops, newStop] }));
  };
  const removeSelectionStop = (stopId: string) => {
    if (!selectionPaint || selectionPaint.stops.length <= 2) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.filter((_, i) => i !== index),
    }));
  };
  // 翻转色标顺序：把每个色标的位置镜像翻转（pos → 100 - pos），从而把颜色排列反过来
  const reverseSelectionStops = () => {
    if (!selectionPaint) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop) => ({ ...stop, pos: clamp(100 - stop.pos, 0, 100) })),
    }));
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
              style={{ left: `${left}%`, top: `${top}%`, backgroundColor: hexAlphaToCss(stop.hex, stop.alpha) }}
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

      <div
        className="pointer-events-none absolute right-3 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2"
        style={cornerStyle}
      >
        <button
          type="button"
          aria-label="打开画布设置"
          aria-expanded={inspectorOpen}
          onClick={openCanvasInspector}
          className="colora-inspector-trigger pointer-events-auto inline-flex size-9 items-center justify-center overflow-hidden rounded-md border shadow-lg backdrop-blur-md"
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={2.2} />
        </button>
        {inspectorOpen && (
          <div
            className="colora-inspector-panel pointer-events-auto flex w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md animate-inspector-open"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
              <div className="grid flex-1 grid-cols-2 rounded-xl bg-background/45 p-1">
                <button
                  type="button"
                  onClick={() => setInspectorTab("line")}
                  disabled={!selectedStrokes.length}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                    inspectorTab === "line"
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  线条
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("canvas")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    inspectorTab === "canvas"
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  画布
                </button>
              </div>
            </div>

            <div className="max-h-[min(70dvh,560px)] overflow-y-auto overflow-x-hidden p-3">
              {inspectorTab === "line" ? (
                selectedStrokes.length ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedStrokes.length === 1 ? "线条" : `已选中 ${selectedStrokes.length} 条线条`}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        调整颜色、粗细、重叠方式，并导出当前选中线条。
                      </p>
                    </div>

                    <SliderRow
                      label="线宽"
                      value={selectedStrokes[0]?.width ?? brushWidth}
                      unit="px"
                      min={1}
                      max={100}
                      onChange={(value) => updateSelectedStrokes((stroke) => ({ ...stroke, width: value }))}
                    />

                    {selectionPaint && (
                      <ColorEditor
                        title={selectedGroup ? "组合渐变" : "颜色"}
                        subtitle={selectedGroup ? "统一色阶沿组内每条线条分布" : undefined}
                        paint={selectionPaint}
                        onStopPos={setSelectionStopPos}
                        onStopHex={setSelectionStopHex}
                        onStopAlpha={setSelectionStopAlpha}
                        onRemoveStop={removeSelectionStop}
                        onDuplicateStop={duplicateSelectionStop}
                        onCopyHex={(stopId) => {
                          const stop = selectionPaint.stops.find((s) => s.id === stopId);
                          if (stop) copyText(stop.hex.toUpperCase(), "已复制 hex 值");
                        }}
                        onAddStop={addSelectionStop}
                        onSetSpace={(space) => updateSelectionPaint((paint) => ({ ...paint, space }))}
                        onSetMode={(paintMode) => updateSelectionPaint((paint) => ({ ...paint, mode: paintMode }))}
                        onSetSolid={(hex) => updateSelectionPaint((paint) => ({ ...paint, solid: hex }))}
                        onReverse={reverseSelectionStops}
                      />
                    )}

                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <div className="text-[11px] font-medium text-muted-foreground">重叠处理</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button type="button" size="sm" variant={overlapMode === "mix" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setOverlapMode("mix")}>自动混色</Button>
                        <Button type="button" size="sm" variant={overlapMode === "cover" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setOverlapMode("cover")}>前层覆盖</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 border-t border-border/60 pt-3">
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={createGroup} disabled={selectedIds.length < 2}><Group className="size-3.5" /> 组合</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={ungroup} disabled={!selectedGroup}><Ungroup className="size-3.5" /> 取消</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => moveLayer("front")}>上移顶层</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => moveLayer("back")}>下移底层</Button>
                      <Button type="button" size="sm" variant="destructive" className="col-span-2 h-8 gap-1 text-xs" onClick={deleteSelected}><Trash2 className="size-3.5" /> 删除选中</Button>
                    </div>

                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Download className="size-3.5" /> 导出选中</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => exportSelectedPng(false)}>透明 PNG</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => exportSelectedPng(true)}>背景 PNG</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => exportSelectedSvg(false)}>透明 SVG</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => exportSelectedSvg(true)}>背景 SVG</Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                    选择线条后可编辑颜色、粗细与导出选中内容。
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">画布</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">编辑背景，并导出整张画布。</p>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="text-[11px] font-medium text-muted-foreground">画布背景</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {CANVAS_LAYOUTS.map((item) => (
                        <Button key={item.value} type="button" size="sm" variant={bgLayout === item.value ? "default" : "outline"} className="h-8 text-xs" onClick={() => setBgLayout(item.value)}>{item.label}</Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-medium text-muted-foreground">画布颜色</div>
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
                            "flex h-9 items-center justify-center rounded-md border text-[10px]",
                            bgColor.toUpperCase() === item.hex ? "border-foreground ring-2 ring-ring" : "border-border/60",
                          )}
                          style={{ backgroundColor: item.hex, color: bestTextOn(item.hex) }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Download className="size-3.5" /> 导出整张画布</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, 3].map((scale) => (
                        <Button key={scale} type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => exportPng(scale)}>PNG {scale}×</Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadText("colora-canvas.svg", svgCode, "image/svg+xml")}>SVG</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadText("colora-canvas.json", jsonCode, "application/json")}>JSON</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button type="button" size="sm" variant="secondary" className="h-8 gap-1 text-xs" onClick={() => copyText(svgCode, "SVG 代码已复制")}><Code2 className="size-3.5" /> SVG</Button>
                      <Button type="button" size="sm" variant="secondary" className="h-8 gap-1 text-xs" onClick={() => copyText(jsonCode, "JSON 已复制")}><Copy className="size-3.5" /> JSON</Button>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={saveLocal} className="h-8 w-full gap-1 text-xs"><Save className="size-3.5" /> 保存到我的方案</Button>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">颜色随路径弯曲分布，CSS 无法表达任意路径渐变，故不提供 CSS 导出。</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </section>
  );
}

/** 极简单色风颜色编辑器：HSL 拾色 + 色标行（圆点连线 / 位置% / 颜色方块 / 透明度%）+ 插值空间分段 */
function ColorEditor({
  title,
  subtitle,
  paint,
  onStopPos,
  onStopHex,
  onStopAlpha,
  onRemoveStop,
  onDuplicateStop,
  onCopyHex,
  onAddStop,
  onSetSpace,
  onSetMode,
  onSetSolid,
  onReverse,
  hideModeToggle,
  extra,
}: {
  title: string;
  subtitle?: string;
  paint: StrokePaint;
  onStopPos: (stopId: string, pos: number) => void;
  onStopHex: (stopId: string, hex: string) => void;
  onStopAlpha: (stopId: string, alpha: number) => void;
  onRemoveStop: (stopId: string) => void;
  onDuplicateStop: (stopId: string) => void;
  onCopyHex: (stopId: string) => void;
  onAddStop: () => void;
  onSetSpace: (space: InterpSpace) => void;
  onSetMode?: (mode: PaintMode) => void;
  onSetSolid?: (hex: string) => void;
  onReverse?: () => void;
  hideModeToggle?: boolean;
  extra?: React.ReactNode;
}) {
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editingAlphaId, setEditingAlphaId] = useState<string | null>(null);
  const stops = paint.stops;
  const sortedStops = useMemo(() => [...stops].sort((a, b) => a.pos - b.pos), [stops]);
  const activeStop = sortedStops.find((stop) => stop.id === activeStopId) ?? sortedStops[0];
  const activeHex = paint.mode === "solid" ? paint.solid : activeStop?.hex ?? paint.solid;
  const activeHsl = rgbToHsl(hexToRgb(activeHex));
  const hueColor = rgbToHex(hslToRgb({ h: activeHsl.h, s: 100, l: 50 }));
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortedStops.length) return;
    if (!activeStopId || !sortedStops.some((stop) => stop.id === activeStopId)) {
      setActiveStopId(sortedStops[0].id);
    }
  }, [activeStopId, sortedStops]);

  const setActiveHex = (hex: string) => {
    if (paint.mode === "solid") onSetSolid?.(hex);
    else if (activeStop) onStopHex(activeStop.id, hex);
  };
  const setActiveHsl = (next: { h?: number; s?: number; l?: number }) => {
    setActiveHex(
      rgbToHex(
        hslToRgb({
          h: next.h ?? activeHsl.h,
          s: clamp(next.s ?? activeHsl.s, 0, 100),
          l: clamp(next.l ?? activeHsl.l, 0, 100),
        }),
      ),
    );
  };
  const pickFromSquare = (clientX: number, clientY: number) => {
    const picker = pickerRef.current;
    if (!picker) return;
    const rect = picker.getBoundingClientRect();
    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const l = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
    setActiveHsl({ s, l });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-neutral-100 shadow-2xl shadow-black/30">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-neutral-100">{title}</div>
            {subtitle && <div className="mt-1 text-[11px] text-neutral-500">{subtitle}</div>}
          </div>
          {onReverse && (
            <button
              type="button"
              onClick={onReverse}
              title="翻转颜色顺序"
              aria-label="翻转颜色顺序"
              className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100"
            >
              <ArrowUpDown className="size-3.5" />
            </button>
          )}
        </div>

        {!hideModeToggle && onSetMode && (
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-neutral-900 p-1">
            {(["solid", "gradient"] as PaintMode[]).map((modeOption) => (
              <button
                key={modeOption}
                type="button"
                onClick={() => onSetMode(modeOption)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  paint.mode === modeOption
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-500 hover:text-neutral-200",
                )}
              >
                {modeOption === "solid" ? "纯色" : "沿路径"}
              </button>
            ))}
          </div>
        )}

        <div
          ref={pickerRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pickFromSquare(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 1) return;
            pickFromSquare(event.clientX, event.clientY);
          }}
          className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-md border border-neutral-700/70 shadow-inner"
          style={{
            background: `linear-gradient(to top, #000 0%, rgba(0,0,0,0) 54%, rgba(255,255,255,0.92) 100%), linear-gradient(to right, #ffffff 0%, ${hueColor} 100%)`,
          }}
        >
          <span
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.75)]"
            style={{ left: `${clamp(activeHsl.s, 0, 100)}%`, top: `${100 - clamp(activeHsl.l, 0, 100)}%`, backgroundColor: activeHex }}
          />
        </div>

        <div className="mt-3 space-y-2">
          <ColorSlider
            label="H"
            value={Math.round(activeHsl.h)}
            max={360}
            unit="°"
            markerColor={activeHex}
            track="linear-gradient(to right, #f00 0%, #ff0 16.6%, #0f0 33.3%, #0ff 50%, #00f 66.6%, #f0f 83.3%, #f00 100%)"
            onChange={(value) => setActiveHsl({ h: value })}
          />
          <ColorSlider
            label="S"
            value={Math.round(activeHsl.s)}
            max={100}
            unit="%"
            track={`linear-gradient(to right, ${rgbToHex(hslToRgb({ h: activeHsl.h, s: 0, l: activeHsl.l }))}, ${rgbToHex(hslToRgb({ h: activeHsl.h, s: 100, l: activeHsl.l }))})`}
            onChange={(value) => setActiveHsl({ s: value })}
          />
          <ColorSlider
            label="L"
            value={Math.round(activeHsl.l)}
            max={100}
            unit="%"
            track={`linear-gradient(to right, #000 0%, ${hueColor} 50%, #fff 100%)`}
            onChange={(value) => setActiveHsl({ l: value })}
          />
        </div>

        {paint.mode === "gradient" ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
              <span>混合</span>
              <div className="flex rounded-md bg-black/50 p-0.5 tracking-normal">
                {INTERP_SPACES.map((space) => (
                  <button
                    key={space}
                    type="button"
                    onClick={() => onSetSpace(space)}
                    className={cn(
                      "rounded px-2 py-1 font-mono text-[10px] uppercase transition-colors",
                      paint.space === space
                        ? "bg-neutral-700 text-neutral-100"
                        : "text-neutral-500 hover:text-neutral-200",
                    )}
                  >
                    {space === "rgb" ? "RGB" : space.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-3 rounded-lg border border-neutral-800 bg-neutral-950/70 py-2">
              {sortedStops.map((stop, i) => {
                const isActive = activeStop?.id === stop.id;
                const editingPos = editingPosId === stop.id;
                const editingAlpha = editingAlphaId === stop.id;
                return (
                  <ContextMenu key={stop.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        onContextMenu={(e) => setActiveStopId(stop.id)}
                        className={cn(
                          "relative grid grid-cols-[20px_minmax(54px,1fr)_20px_minmax(54px,1fr)] items-center gap-2 px-2 py-1.5 text-xs transition-colors cursor-default",
                          isActive ? "bg-neutral-900/80" : "hover:bg-neutral-900/50",
                        )}
                      >
                        {/* 选择圆点 + 连接相邻圆点的竖线 */}
                        <div className="relative mx-auto h-6 w-5">
                          {i > 0 && (
                            <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-neutral-700" />
                          )}
                          {i < sortedStops.length - 1 && (
                            <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-neutral-700" />
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveStopId(stop.id)}
                            className={cn(
                              "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                              isActive
                                ? "size-3 border-white bg-white"
                                : "size-2.5 border-neutral-400 bg-neutral-950",
                            )}
                            aria-label="选择色标"
                          />
                        </div>

                        {/* 位置 % */}
                        {editingPos ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            autoFocus
                            defaultValue={Math.round(stop.pos)}
                            ref={(el) => {
                              el?.focus();
                              el?.select();
                            }}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) onStopPos(stop.id, v);
                              setEditingPosId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = Number(e.currentTarget.value);
                                if (Number.isFinite(v)) onStopPos(stop.id, v);
                                setEditingPosId(null);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingPosId(null);
                              }
                            }}
                            className="h-7 w-full appearance-none rounded-md border border-neutral-700 bg-black/30 px-1 text-right font-mono text-sm font-semibold text-neutral-100 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="色标位置百分比"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveStopId(stop.id);
                              setEditingPosId(stop.id);
                            }}
                            className="flex items-baseline justify-end gap-0.5 rounded px-0.5 py-0.5 text-right font-mono text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
                            aria-label="编辑位置"
                          >
                            <span>{Math.round(stop.pos)}</span>
                            <span className="text-[9px] text-neutral-500">%</span>
                          </button>
                        )}

                        {/* 颜色方块（选中白框） */}
                        <button
                          type="button"
                          onClick={() => setActiveStopId(stop.id)}
                          className={cn(
                            "size-4 rounded-none border",
                            isActive ? "border-white ring-2 ring-white" : "border-neutral-700",
                          )}
                          style={{ backgroundColor: hexAlphaToCss(stop.hex, stop.alpha) }}
                          aria-label="选择色标"
                        />

                        {/* 透明度 % */}
                        {editingAlpha ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            autoFocus
                            defaultValue={Math.round(stop.alpha)}
                            ref={(el) => {
                              el?.focus();
                              el?.select();
                            }}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) onStopAlpha(stop.id, v);
                              setEditingAlphaId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = Number(e.currentTarget.value);
                                if (Number.isFinite(v)) onStopAlpha(stop.id, v);
                                setEditingAlphaId(null);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingAlphaId(null);
                              }
                            }}
                            className="h-7 w-full appearance-none rounded-md border border-neutral-700 bg-black/30 px-1 text-right font-mono text-sm font-semibold text-neutral-100 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="色标透明度百分比"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveStopId(stop.id);
                              setEditingAlphaId(stop.id);
                            }}
                            className="flex items-baseline justify-end gap-0.5 rounded px-0.5 py-0.5 text-right font-mono text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
                            aria-label="编辑透明度"
                          >
                            <span>{Math.round(stop.alpha)}</span>
                            <span className="text-[9px] text-neutral-500">%</span>
                          </button>
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => onDuplicateStop(stop.id)}>
                        复制
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => onCopyHex(stop.id)}>
                        复制 hex 值
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        disabled={stops.length <= 2}
                        onSelect={() => onRemoveStop(stop.id)}
                      >
                        删除
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onAddStop}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-800 py-1.5 text-[11px] text-neutral-500 hover:border-neutral-600 hover:text-neutral-200"
            >
              <Plus className="size-3" /> 添加
            </button>
          </>
        ) : (
          onSetSolid && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-2">
              <span className="size-8 rounded-md border border-neutral-700" style={{ backgroundColor: paint.solid }} />
              <input
                value={paint.solid.toUpperCase()}
                onChange={(event) => {
                  const normalized = normalizeHex(event.target.value);
                  if (normalized) onSetSolid(normalized);
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-neutral-800 bg-black/30 px-2 font-mono text-xs text-neutral-100 outline-none focus:border-neutral-500"
                aria-label="HEX 颜色值"
              />
            </div>
          )
        )}
      </div>

      {extra}
    </div>
  );
}

function ColorSlider({
  label,
  value,
  max,
  unit,
  track,
  markerColor,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  track: string;
  markerColor?: string;
  onChange: (value: number) => void;
}) {
  const pct = (value / max) * 100;
  return (
    <label className="grid grid-cols-[18px_minmax(0,1fr)_48px] items-center gap-2 text-[11px] text-neutral-500">
      <span className="font-mono">{label}:</span>
      <div className="relative h-3">
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full"
          style={{ background: track }}
        />
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
        />
        {/* 自定义手柄：色标作为其居中子元素，永远处于手柄正中心、无位移 */}
        <span
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-neutral-100 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${pct}%` }}
        >
          {markerColor && (
            <span
              className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: markerColor }}
            />
          )}
        </span>
      </div>
      <span className="flex items-baseline justify-end gap-0.5 font-mono">
        <span className="text-neutral-200">{value}</span>
        <span className="text-[9px] text-neutral-500">{unit}</span>
      </span>
    </label>
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
