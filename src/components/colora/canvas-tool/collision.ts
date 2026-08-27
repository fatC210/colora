import type { Point, SelectionBox, Stroke } from "./types";
import { clamp, distance } from "./utils";
import { renderPoints } from "./path";
import { textMetrics, isLinearStroke, toLocalPoint, worldBounds } from "./geometry";
import { arrowHeadPoints, curvePoints } from "@/lib/path-gradient";

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
  // 旋转态：指针逆旋转到 angle=0 局部坐标系再测（points/文本框都在局部轴对齐）。
  const lp = toLocalPoint(stroke, point);
  const points = renderPoints(stroke);
  // 文本笔画：包围盒命中（点落在文本框内即命中）。
  if (stroke.kind === "text") {
    const p = points[0];
    if (!p || !stroke.text) return false;
    const { width, height } = textMetrics(stroke);
    return lp.x >= p.x && lp.x <= p.x + width && lp.y >= p.y && lp.y <= p.y + height;
  }
  const threshold = hitThreshold(stroke);
  // 圆角线性元素：沿平滑曲线密分点逐段命中（与渲染几何一致），原控制点仅用于编辑手柄。
  const hitPts =
    stroke.roundness === "round" && isLinearStroke(stroke) && points.length >= 3
      ? curvePoints(points)
      : points;
  for (let index = 0; index < hitPts.length - 1; index++)
    if (pointToSegmentDistance(lp, hitPts[index], hitPts[index + 1]) <= threshold) return true;
  // 箭头头部：杆两端点之外，头部两条边也参与命中，使点中箭头头部能选中。
  if (stroke.shape === "arrow" && points.length >= 2) {
    const [s, e] = points;
    const head = arrowHeadPoints(s, e, stroke.width);
    for (let i = 0; i < head.length - 1; i++)
      if (pointToSegmentDistance(lp, head[i], head[i + 1]) <= threshold) return true;
  }
  return false;
}
export function boxIntersectsStroke(box: SelectionBox, stroke: Stroke) {
  const left = Math.min(box.start.x, box.end.x),
    right = Math.max(box.start.x, box.end.x),
    top = Math.min(box.start.y, box.end.y),
    bottom = Math.max(box.start.y, box.end.y);
  const bounds = worldBounds(stroke);
  return bounds.maxX >= left && bounds.minX <= right && bounds.maxY >= top && bounds.minY <= bottom;
}
