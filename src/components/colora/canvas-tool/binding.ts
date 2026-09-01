import type { Binding, BindingAnchor, Bounds, Point, Stroke } from "./types";
import { renderBounds } from "./geometry";

/** 锚点在目标元素 renderBounds（angle=0 局部框）上的坐标。
 *  top/bottom/left/right = 对应边中点；center = 框中心。
 *  注意：renderBounds 是 angle=0 局部框，目标若已旋转，端点坐标应在世界坐标系——
 *  调用方需自行用 toWorldPoint 转换（见 anchorPointWorld）。 */
export function anchorPointLocal(target: Stroke, anchor: BindingAnchor): Point {
  const b = renderBounds(target);
  return anchorPointOnBounds(b, anchor);
}

export function anchorPointOnBounds(b: Bounds, anchor: BindingAnchor): Point {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  switch (anchor) {
    case "top":
      return { x: cx, y: b.minY };
    case "bottom":
      return { x: cx, y: b.maxY };
    case "left":
      return { x: b.minX, y: cy };
    case "right":
      return { x: b.maxX, y: cy };
    case "center":
      return { x: cx, y: cy };
  }
}

/**
 * 把被移动/缩放/旋转过的目标元素上绑定的箭头端点重新计算并写回。
 * 只重算端点坐标（points[0] / points[last]），不改 binding 偏好。
 * 这是派生更新：调用方应将其折叠进当前 commit（不单独入 undo）。
 * @param strokes 当前全部笔画（会被就地重写箭头端点）
 * @param movedIds 本次发生几何变化的目标元素 id 集合
 * @returns 新的 strokes 数组（箭头端点已重绑）
 */
export function rebindArrows(strokes: Stroke[], movedIds: Set<string>): Stroke[] {
  if (!movedIds.size) return strokes;
  // 只扫箭头（line/shape==="arrow"）且带 bindings 的。
  return strokes.map((stroke) => {
    if (!stroke.bindings) return stroke;
    const isArrow = stroke.kind === "line" || stroke.shape === "arrow";
    if (!isArrow) return stroke;
    const pts = stroke.points.map((p) => ({ ...p }));
    let changed = false;
    const apply = (side: "start" | "end", binding: Binding | undefined, idx: number) => {
      if (!binding || !movedIds.has(binding.strokeId)) return;
      const target = strokes.find((s) => s.id === binding.strokeId);
      if (!target) return;
      const local = anchorPointLocal(target, binding.anchor);
      // 目标若旋转，把局部锚点转到世界坐标。
      const a = target.angle ?? 0;
      if (a) {
        const c = {
          x: (renderBounds(target).minX + renderBounds(target).maxX) / 2,
          y: (renderBounds(target).minY + renderBounds(target).maxY) / 2,
        };
        const cos = Math.cos(a),
          sin = Math.sin(a);
        const dx = local.x - c.x,
          dy = local.y - c.y;
        pts[idx] = { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
      } else {
        pts[idx] = local;
      }
      changed = true;
    };
    apply("start", stroke.bindings.start, 0);
    apply("end", stroke.bindings.end, pts.length - 1);
    return changed ? { ...stroke, points: pts } : stroke;
  });
}

/** 检测指针是否落在目标元素的某个锚点附近（屏幕阈值，canvas 空间）。
 *  返回最近命中的锚点，无则 undefined。用于箭头绘制时吸附。 */
export function findSnapAnchor(
  strokes: Stroke[],
  point: Point,
  threshold: number,
  excludeId?: string,
): { strokeId: string; anchor: BindingAnchor; point: Point } | undefined {
  let best: { strokeId: string; anchor: BindingAnchor; point: Point; dist: number } | undefined;
  for (const s of strokes) {
    if (s.id === excludeId) continue;
    if (s.kind === "image") continue; // 图片不作为绑定目标（可后续放开）
    const b = renderBounds(s);
    const a = s.angle ?? 0;
    const toWorld = (local: Point): Point => {
      if (!a) return local;
      const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      const cos = Math.cos(a),
        sin = Math.sin(a);
      const dx = local.x - c.x,
        dy = local.y - c.y;
      return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
    };
    const anchors: BindingAnchor[] = ["top", "bottom", "left", "right", "center"];
    for (const anchor of anchors) {
      const world = toWorld(anchorPointOnBounds(b, anchor));
      const dist = Math.hypot(world.x - point.x, world.y - point.y);
      if (dist <= threshold && (!best || dist < best.dist)) {
        best = { strokeId: s.id, anchor, point: world, dist };
      }
    }
  }
  return best ? { strokeId: best.strokeId, anchor: best.anchor, point: best.point } : undefined;
}
