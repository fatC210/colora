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
export function hitStroke(stroke: Stroke, point: Point) {
  const points = renderPoints(stroke),
    threshold = stroke.width / 2 + 8;
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
