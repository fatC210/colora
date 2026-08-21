import type { Point } from "@/lib/path-gradient";
import type { PaintMode, OverlapMode, Stroke, StrokeGroup } from "./types";

export function renderPoints(stroke: Stroke): Point[] {
  return stroke.points;
}
export function isClosedShape(stroke: Stroke) {
  return Boolean(
    stroke.shape &&
    stroke.shape !== "wave" &&
    stroke.shape !== "curve" &&
    stroke.shape !== "spiral" &&
    stroke.shape !== "arrow",
  );
}
/**
 * 取笔画绘制用色。
 * 组合内线条：仅 mix 模式用组合渐变（统一色阶沿组内分布）；cover 模式用各自原色，
 * 使重叠处呈现"组合时的默认样式"（上层覆盖下层、不混色）。
 */
export function paintSource(stroke: Stroke, groups: StrokeGroup[], overlapMode: OverlapMode) {
  const group = stroke.groupId ? groups.find((item) => item.id === stroke.groupId) : undefined;
  if (group && overlapMode === "mix")
    return {
      mode: "gradient" as PaintMode,
      solid: stroke.paint.solid,
      stops: group.stops,
      space: group.space,
    };
  return stroke.paint;
}
// 始终输出原始折线（直线段），不二次贝塞尔平滑——与画布渲染及沿路径渐变几何一致。
export function toPathData(points: Point[]) {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}
// 始终以原始折线（直线段）描边，不二次贝塞尔平滑——与沿路径渐变的直线细分几何一致，
// 切换"纯色/沿路径"只改颜色，不改线条形状与走向（转角保持原样）。
export function drawPath(ctx: CanvasRenderingContext2D, points: Point[], closed = false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  if (closed) ctx.closePath();
}
