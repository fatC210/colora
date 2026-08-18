import type { Point, SelectionBox, Stroke } from "./types";
import { clamp, distance } from "./utils";
import { renderPoints } from "./path";
import { renderBounds } from "./geometry";

export function pointToSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * 本体命中阈值：严格贴线条本体，阈值 = 线宽半宽。
 * +0.1 仅防极细线零宽导致永远点不中，不产生任何可见空白带。
 * 对标 Excalidraw：点击线条本身才选中，线条附近的空白不算选中。
 */
const hitThreshold = (stroke: Stroke) => stroke.width / 2 + 0.1;

/**
 * 线条本体命中：只看点到线条中心线的最近距离是否 ≤ 线宽半宽，
 * 与包围盒/外框无关。点在线条外的空白处一律不命中。
 */
export function hitStroke(stroke: Stroke, point: Point) {
  const points = renderPoints(stroke),
    threshold = hitThreshold(stroke);
  for (let index = 0; index < points.length - 1; index++)
    if (pointToSegmentDistance(point, points[index], points[index + 1]) <= threshold) return true;
  return false;
}
export function boxIntersectsStroke(box: SelectionBox, stroke: Stroke) {
  const left = Math.min(box.start.x, box.end.x),
    right = Math.max(box.start.x, box.end.x),
    top = Math.min(box.start.y, box.end.y),
    bottom = Math.max(box.start.y, box.end.y);
  const bounds = renderBounds(stroke);
  return bounds.maxX >= left && bounds.minX <= right && bounds.maxY >= top && bounds.minY <= bottom;
}
