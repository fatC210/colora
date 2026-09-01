import type { Point, Stroke } from "./types";
import { worldBounds } from "./geometry";
import { GRID_STEP } from "./constants";

/** 一条吸附辅助线：沿某轴在 canvas 空间某坐标处的全视口线。 */
export type SnapGuide = { axis: "x" | "y"; pos: number };

export type SnapResult = {
  /** 吸附后的偏移量（加到原始 delta/坐标上）。 */
  dx: number;
  dy: number;
  guides: SnapGuide[];
};

/** 收集所有非选中元素的吸附候选坐标（边 + 中心，x/y 各一组）。 */
export function collectSnapPoints(
  strokes: Stroke[],
  excludeIds: Set<string>,
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of strokes) {
    if (excludeIds.has(s.id)) continue;
    const b = worldBounds(s);
    if (b.width === 0 && b.height === 0) continue;
    xs.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    ys.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  return { xs, ys };
}

/** 收集选中元素联合框的边/中心候选（用于"选中框边对齐到目标边"）。 */
export function collectMovingEdges(bounds: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): {
  xs: number[];
  ys: number[];
} {
  return {
    xs: [bounds.minX, (bounds.minX + bounds.maxX) / 2, bounds.maxX],
    ys: [bounds.minY, (bounds.minY + bounds.maxY) / 2, bounds.maxY],
  };
}

/** 在候选值中找与 target 最近的、距离 ≤ threshold 的吸附值。返回吸附值（canvas 空间）。 */
function snapAxis(target: number, candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - target);
    if (d <= bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * 对一次移动做吸附：给定选中框在移动后的目标 bounds（canvas 空间），
 * 与其它元素的边/中心比对，吸附最近的对齐，返回偏移 dx/dy 与应画的辅助线。
 * @param targetBounds 选中元素平移后的世界 AABB（未吸附）
 * @param strokes 全部笔画
 * @param excludeIds 选中的 id（不作为吸附目标）
 * @param threshold canvas 空间吸附阈值（如 6/zoom）
 * @param gridSnap 是否吸附到网格
 */
export function snapMove(
  targetBounds: { minX: number; minY: number; maxX: number; maxY: number },
  strokes: Stroke[],
  excludeIds: Set<string>,
  threshold: number,
  gridSnap: boolean,
): SnapResult {
  const others = collectSnapPoints(strokes, excludeIds);
  const moving = collectMovingEdges(targetBounds);
  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;
  // x 轴：选中框的左/中/右 与 其它元素的左/中/右 对齐。
  let bestX: { moving: number; snap: number; dist: number } | null = null;
  for (const mx of moving.xs) {
    for (const ox of others.xs) {
      const d = Math.abs(mx - ox);
      if (d <= threshold && (!bestX || d < bestX.dist)) bestX = { moving: mx, snap: ox, dist: d };
    }
  }
  if (bestX) {
    dx = bestX.snap - bestX.moving;
    guides.push({ axis: "x", pos: bestX.snap });
  }
  let bestY: { moving: number; snap: number; dist: number } | null = null;
  for (const my of moving.ys) {
    for (const oy of others.ys) {
      const d = Math.abs(my - oy);
      if (d <= threshold && (!bestY || d < bestY.dist)) bestY = { moving: my, snap: oy, dist: d };
    }
  }
  if (bestY) {
    dy = bestY.snap - bestY.moving;
    guides.push({ axis: "y", pos: bestY.snap });
  }
  // 网格吸附（无元素吸附时）：把选中框左上角吸附到 GRID_STEP 倍数。
  if (gridSnap && !bestX) {
    const gx = Math.round(targetBounds.minX / GRID_STEP) * GRID_STEP;
    const d = Math.abs(gx - targetBounds.minX);
    if (d <= threshold) {
      dx += gx - targetBounds.minX;
      guides.push({ axis: "x", pos: gx });
    }
  }
  if (gridSnap && !bestY) {
    const gy = Math.round(targetBounds.minY / GRID_STEP) * GRID_STEP;
    const d = Math.abs(gy - targetBounds.minY);
    if (d <= threshold) {
      dy += gy - targetBounds.minY;
      guides.push({ axis: "y", pos: gy });
    }
  }
  return { dx, dy, guides };
}

/** 单点吸附（绘制 draft 时，把单个端点/指针吸附到其它元素的边/中心或网格）。 */
export function snapPoint(
  point: Point,
  strokes: Stroke[],
  excludeIds: Set<string>,
  threshold: number,
  gridSnap: boolean,
): { point: Point; guides: SnapGuide[] } {
  const others = collectSnapPoints(strokes, excludeIds);
  const guides: SnapGuide[] = [];
  let x = point.x;
  let y = point.y;
  const sx = snapAxis(point.x, others.xs, threshold);
  if (sx !== null) {
    x = sx;
    guides.push({ axis: "x", pos: sx });
  } else if (gridSnap) {
    const gx = Math.round(point.x / GRID_STEP) * GRID_STEP;
    if (Math.abs(gx - point.x) <= threshold) {
      x = gx;
      guides.push({ axis: "x", pos: gx });
    }
  }
  const sy = snapAxis(point.y, others.ys, threshold);
  if (sy !== null) {
    y = sy;
    guides.push({ axis: "y", pos: sy });
  } else if (gridSnap) {
    const gy = Math.round(point.y / GRID_STEP) * GRID_STEP;
    if (Math.abs(gy - point.y) <= threshold) {
      y = gy;
      guides.push({ axis: "y", pos: gy });
    }
  }
  return { point: { x, y }, guides };
}
