import type { Point, Stroke } from "./types";
import { worldBounds } from "./geometry";

type AABB = { minX: number; minY: number; maxX: number; maxY: number };

/** 对齐模式：左/中(水平)/右/顶/中(垂直)/底。 */
export type AlignMode = "left" | "center-h" | "right" | "top" | "middle-v" | "bottom";
/** 分布模式：水平/垂直等距。 */
export type DistributeMode = "horizontal" | "vertical";
/** 翻转模式：水平/垂直。 */
export type FlipMode = "horizontal" | "vertical";

function strokeCenter(stroke: Stroke): Point {
  const b = worldBounds(stroke);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** 把 stroke 平移 (dx, dy)（仅改 points）。 */
function translate(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/**
 * 对齐选中元素到它们的联合 AABB 的某条边/中线。
 * 返回新的 strokes 数组（仅选中元素被平移，points 改变；angle/形状不变）。
 */
export function alignStrokes(strokes: Stroke[], selected: Stroke[], mode: AlignMode): Stroke[] {
  if (selected.length < 2) return strokes;
  // 联合 AABB（世界坐标，含旋转）。
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of selected) {
    const b = worldBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  const ref: AABB = { minX, minY, maxX, maxY };
  const ids = new Set(selected.map((s) => s.id));
  return strokes.map((stroke) => {
    if (!ids.has(stroke.id)) return stroke;
    const b = worldBounds(stroke);
    const c = strokeCenter(stroke);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left":
        dx = ref.minX - b.minX;
        break;
      case "right":
        dx = ref.maxX - b.maxX;
        break;
      case "center-h":
        dx = (ref.minX + ref.maxX) / 2 - c.x;
        break;
      case "top":
        dy = ref.minY - b.minY;
        break;
      case "bottom":
        dy = ref.maxY - b.maxY;
        break;
      case "middle-v":
        dy = (ref.minY + ref.maxY) / 2 - c.y;
        break;
    }
    return translate(stroke, dx, dy);
  });
}

/**
 * 分布选中元素：沿指定轴在联合 AABB 内等距排列（按中心间距均匀）。
 * 至少 3 个元素才有意义；2 个等价于两端对齐。返回新 strokes。
 */
export function distributeStrokes(
  strokes: Stroke[],
  selected: Stroke[],
  mode: DistributeMode,
): Stroke[] {
  if (selected.length < 3) return strokes;
  const horiz = mode === "horizontal";
  // 按中心在轴上的顺序排序。
  const sorted = [...selected].sort((a, b) => {
    const ca = strokeCenter(a),
      cb = strokeCenter(b);
    return horiz ? ca.x - cb.x : ca.y - cb.y;
  });
  // 联合 AABB 首末中心。
  const first = strokeCenter(sorted[0]);
  const last = strokeCenter(sorted[sorted.length - 1]);
  const span = horiz ? last.x - first.x : last.y - first.y;
  const step = span / (sorted.length - 1);
  const ids = new Set(selected.map((s) => s.id));
  // 计算每个选中元素的目标中心位移。
  const moves = new Map<string, number>();
  sorted.forEach((s, i) => {
    const c = strokeCenter(s);
    const target = horiz ? first.x + step * i : first.y + step * i;
    moves.set(s.id, target - (horiz ? c.x : c.y));
  });
  return strokes.map((stroke) => {
    if (!ids.has(stroke.id)) return stroke;
    const d = moves.get(stroke.id) ?? 0;
    return horiz ? translate(stroke, d, 0) : translate(stroke, 0, d);
  });
}

/**
 * 翻转选中元素：关于自身中心（单选）或选区中心（多选）镜像 points。
 * 返回新 strokes。对线性/箭头镜像控制点；对闭合形状镜像后形状翻转。
 */
export function flipStrokes(strokes: Stroke[], selected: Stroke[], mode: FlipMode): Stroke[] {
  if (!selected.length) return strokes;
  const horiz = mode === "horizontal";
  // 选区中心 = 联合 AABB 中心。
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of selected) {
    const b = worldBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ids = new Set(selected.map((s) => s.id));
  return strokes.map((stroke) => {
    if (!ids.has(stroke.id)) return stroke;
    // 单元素翻转用自身中心（更直觉），多选用选区中心。
    const center = selected.length === 1 ? strokeCenter(stroke) : { x: cx, y: cy };
    const points = stroke.points.map((p) =>
      horiz ? { x: 2 * center.x - p.x, y: p.y } : { x: p.x, y: 2 * center.y - p.y },
    );
    return { ...stroke, points };
  });
}
