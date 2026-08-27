import {
  arrowHeadPoints,
  colorAtPercent,
  curvePoints,
  drawGradientStroke,
  shapePoints as makeShapePoints,
  strokeDashArray,
  svgGradientStroke,
} from "@/lib/path-gradient";
import { GRID_STEP } from "./constants";
import { escapeAttr } from "./io";
import { hexAlphaToCss } from "@/lib/color";
import { drawPath, isClosedShape, paintSource, renderPoints, toPathData } from "./path";
import {
  renderBounds,
  selectionBounds,
  strokeCenter,
  textMetrics,
  isLinearStroke,
} from "./geometry";
import { gridColors } from "./tone";
import { clamp } from "./utils";
import type { CanvasLayout, Draft, OverlapMode, Point, Size, Stroke, StrokeGroup } from "./types";

// mix 模式下供笔画间 multiply 合成用的临时离屏画布（模块级复用，避免每帧重建）。
let mixTmpCanvas: HTMLCanvasElement | null = null;
function getMixTmp(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!mixTmpCanvas) mixTmpCanvas = document.createElement("canvas");
  if (mixTmpCanvas.width !== w || mixTmpCanvas.height !== h) {
    mixTmpCanvas.width = w;
    mixTmpCanvas.height = h;
  }
  return mixTmpCanvas;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  size: Size,
  layout: CanvasLayout,
  bg: string,
  pan: Point,
  zoom: number,
) {
  // 可见画布坐标范围（视口屏幕 [0,size] → 画布坐标 [(-pan)/zoom, (size-pan)/zoom]），
  // 背景与网格覆盖整个视口，使无限画布在任何 pan/zoom 下都有连续背景。
  const minX = -pan.x / zoom;
  const maxX = (size.w - pan.x) / zoom;
  const minY = -pan.y / zoom;
  const maxY = (size.h - pan.y) / zoom;
  ctx.fillStyle = bg;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  if (layout === "blank") return;
  const { line, dot } = gridColors(bg);
  ctx.save();
  ctx.strokeStyle = line;
  ctx.fillStyle = dot;
  if (layout === "grid") {
    ctx.lineWidth = 1;
    const startX = Math.ceil(minX / GRID_STEP) * GRID_STEP;
    const startY = Math.ceil(minY / GRID_STEP) * GRID_STEP;
    for (let x = startX; x <= maxX; x += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }
    for (let y = startY; y <= maxY; y += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
      ctx.stroke();
    }
  } else if (layout === "dots") {
    const startX = Math.ceil(minX / GRID_STEP) * GRID_STEP;
    const startY = Math.ceil(minY / GRID_STEP) * GRID_STEP;
    for (let x = startX; x <= maxX; x += GRID_STEP)
      for (let y = startY; y <= maxY; y += GRID_STEP) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();
}

export function renderScene({
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
  selectionAsGroup = false,
  skipTextId = null,
  pan = { x: 0, y: 0 },
  zoom = 1,
  draftStyle,
  hideSelectionBox = false,
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
  /** 选中态是否画成一个包围所有选中笔画的联合大框（用于组合选中）。 */
  selectionAsGroup?: boolean;
  /** 编辑中的文本笔画 id：渲染时跳过该笔画（由 textarea 覆盖显示），避免重叠。 */
  skipTextId?: string | null;
  /** 视口偏移与缩放，用于绘制覆盖整个视口的无限背景。默认无偏移（导出场景）。 */
  pan?: Point;
  zoom?: number;
  /** 绘制预览（draft）的样式：实线 + 最终颜色/宽度，所见即所得。 */
  draftStyle?: { color: string; width: number };
  /** 是否隐藏矩形选中框（线性元素编辑态/拖点中，由点手柄替代外框）。 */
  hideSelectionBox?: boolean;
}) {
  const { w, h } = size;
  if (w === 0 || h === 0) return;
  ctx.clearRect(0, 0, w, h);
  if (showBackground) drawBackground(ctx, size, bgLayout, bgColor, pan, zoom);

  const drawStroke = (target: CanvasRenderingContext2D, stroke: Stroke) => {
    const a = stroke.angle ?? 0;
    const c = a ? strokeCenter(stroke) : null;
    target.save();
    if (c) {
      // 旋转态：绕包围盒中心旋转 angle（points 仍是 angle=0 坐标，变换后画出即旋转效果）。
      target.translate(c.x, c.y);
      target.rotate(a);
      target.translate(-c.x, -c.y);
    }
    const points = renderPoints(stroke);
    // 线性圆角元素：绘制用 Catmull-Rom 平滑曲线点（对标 Excalidraw roundness）；
    // 命中/手柄/resize 仍用原始控制点（renderPoints），不受影响。
    const drawPts =
      stroke.roundness === "round" && isLinearStroke(stroke) && points.length >= 3
        ? curvePoints(points)
        : points;
    // 文本笔画：单点定位 + fillText。纯色用 solid；渐变沿文本水平方向用 createLinearGradient。
    if (stroke.kind === "text") {
      const p = points[0];
      if (!p || !stroke.text) {
        target.restore();
        return;
      }
      const source = paintSource(stroke, groups, overlapMode);
      const fs = stroke.fontSize ?? 28;
      const ff = stroke.fontFamily ?? "sans-serif";
      target.textBaseline = "top";
      target.font = `${fs}px ${ff}`;
      const lines = stroke.text.split("\n");
      if (source.mode === "solid" || !source.stops.length) {
        target.fillStyle =
          source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000");
      } else {
        // 水平线性渐变，跨文本宽度，按 stops 的 pos(0..100)/alpha 构造。
        const { width } = textMetrics(stroke);
        const grad = target.createLinearGradient(p.x, 0, p.x + width, 0);
        for (const s of source.stops) {
          const offset = clamp(s.pos / 100, 0, 1);
          grad.addColorStop(offset, hexAlphaToCss(s.hex, s.alpha));
        }
        target.fillStyle = grad;
      }
      lines.forEach((line, i) => target.fillText(line, p.x, p.y + i * fs * 1.2));
      target.restore();
      return;
    }
    if (points.length < 2) {
      target.restore();
      return;
    }
    const source = paintSource(stroke, groups, overlapMode);
    const closed = isClosedShape(stroke);
    const isArrow = stroke.shape === "arrow";
    const dash = strokeDashArray(stroke.strokeStyle ?? "solid", stroke.width);
    if (source.mode === "solid") {
      // 箭头：杆画整条折线（支持中点变弯后的多点杆），头部从末端方向画两条边。
      if (isArrow) {
        const s = points[0];
        const e = points[points.length - 1];
        // 头部方向取最后一段，使弯曲杆的箭头朝向末段方向。
        const prev = points[points.length - 2] ?? s;
        const head = arrowHeadPoints(prev, e, stroke.width);
        target.strokeStyle = source.solid;
        target.lineWidth = stroke.width;
        target.lineCap = "round";
        target.lineJoin = "round";
        if (dash) target.setLineDash(dash);
        drawPath(target, drawPts, false);
        target.stroke();
        if (dash) target.setLineDash([]);
        drawPath(target, head, false);
        target.stroke();
      } else {
        drawPath(target, drawPts, closed);
        target.strokeStyle = source.solid;
        target.lineWidth = stroke.width;
        target.lineCap = "round";
        target.lineJoin = "round";
        if (dash) target.setLineDash(dash);
        target.stroke();
        if (dash) target.setLineDash([]);
      }
    } else {
      if (isArrow) {
        const e = points[points.length - 1];
        const prev = points[points.length - 2] ?? points[0];
        const head = arrowHeadPoints(prev, e, stroke.width);
        // 杆走沿路径渐变（整条折线/曲线，支持虚线/点线连续 dash）；头部用末端色单色画。
        drawGradientStroke(target, drawPts, source.stops, source.space, stroke.width, false, dash);
        const tipColor = source.stops.length
          ? colorAtPercent(source.stops, 100, source.space)
          : source.solid;
        target.strokeStyle = tipColor;
        target.lineWidth = stroke.width;
        target.lineCap = "round";
        target.lineJoin = "round";
        if (dash) target.setLineDash(dash);
        drawPath(target, head, false);
        target.stroke();
        if (dash) target.setLineDash([]);
      } else {
        drawGradientStroke(target, drawPts, source.stops, source.space, stroke.width, closed, dash);
      }
    }
    target.restore();
  };

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  // 重叠处理只对"组合内"笔画生效：mix 时同一组合的笔画互相 multiply 混色（仅重叠处），
  // cover 时组合内笔画用各自原色 source-over 叠加（上层覆盖下层）；非组合笔画始终
  // 各自原色 source-over，普通重叠线条不会混色。按 strokes 顺序绘制以保持 z-order，
  // 每个组合用一个独立离屏层做内部混色，层内画完即合到主层。
  const drawGroupMix = (groupStrokes: Stroke[]) => {
    if (!offscreen) {
      for (const s of groupStrokes) drawStroke(ctx, s);
      return;
    }
    const octx = offscreen.getContext("2d");
    const tmp = getMixTmp(offscreen.width, offscreen.height);
    const tctx = tmp?.getContext("2d");
    if (!octx || !tmp || !tctx) {
      for (const s of groupStrokes) drawStroke(ctx, s);
      return;
    }
    octx.setTransform(ctx.getTransform());
    octx.clearRect(0, 0, w, h);
    octx.globalCompositeOperation = "source-over";
    groupStrokes.forEach((s, i) => {
      // 每条先在临时层 source-over 完整画好（避免同条笔画段间自乘），再 multiply 合到组层。
      tctx.setTransform(octx.getTransform());
      tctx.clearRect(0, 0, w, h);
      tctx.globalCompositeOperation = "source-over";
      drawStroke(tctx, s);
      octx.globalCompositeOperation = i === 0 ? "source-over" : "multiply";
      octx.drawImage(tmp, 0, 0, w, h);
    });
    ctx.drawImage(offscreen, 0, 0, w, h);
  };

  // 按 strokes 顺序遍历，把同组笔画聚到一起一次性按组渲染（保持组在序列中的相对位置）。
  const rendered = new Set<string>();
  for (const stroke of strokes) {
    if (rendered.has(stroke.id)) continue;
    // 编辑中的文本由 textarea 覆盖显示，跳过 canvas 渲染避免重叠。
    if (skipTextId && stroke.id === skipTextId) continue;
    const gid = stroke.groupId;
    if (overlapMode === "mix" && gid) {
      const groupStrokes = strokes.filter((s) => s.groupId === gid);
      groupStrokes.forEach((s) => rendered.add(s.id));
      drawGroupMix(groupStrokes);
    } else {
      rendered.add(stroke.id);
      drawStroke(ctx, stroke);
    }
  }
  ctx.restore();

  if (draft) {
    ctx.save();
    // 实时预览：实线 + 最终颜色/宽度（对标 Excalidraw，绘制时即所见即所得，不用虚线）。
    ctx.strokeStyle = draftStyle?.color ?? "rgba(2, 132, 199, 0.9)";
    ctx.lineWidth = draftStyle?.width ?? 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (draft.type === "shape" && draft.shape === "arrow") {
      // 箭头 draft：杆画到 tip + 头部两条边（与正式 stroke 同一几何）。
      const head = arrowHeadPoints(draft.start, draft.end, draftStyle?.width ?? 3);
      drawPath(ctx, [draft.start, draft.end], false);
      ctx.stroke();
      drawPath(ctx, head, false);
      ctx.stroke();
    } else {
      const points =
        draft.type === "brush"
          ? draft.points
          : draft.type === "line"
            ? [draft.start, draft.end]
            : makeShapePoints(draft.shape, draft.start, draft.end);
      const draftClosed =
        draft.type === "shape" &&
        draft.shape !== "wave" &&
        draft.shape !== "curve" &&
        draft.shape !== "spiral" &&
        draft.shape !== "arrow";
      drawPath(ctx, points, draftClosed);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (showSelection && selectedIds.length && !hideSelectionBox) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(37, 99, 235, 0.92)";
    ctx.lineWidth = 1;
    const selected = strokes.filter(
      (stroke) => selectedIds.includes(stroke.id) && !(skipTextId && stroke.id === skipTextId),
    );
    if (selectionAsGroup && selected.length > 1) {
      // 组合选中：画一个包围所有选中笔画的联合大框。
      const bounds = selectionBounds(selected);
      if (bounds) ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    } else {
      selected.forEach((stroke) => {
        // 对标 Excalidraw：两点直线/箭头无外框（仅端点手柄）；
        // 多点线/箭头有外框 + 方形 resize（与点手柄共存）；画笔/闭合形状/文本有外框。
        if (isLinearStroke(stroke) && renderPoints(stroke).length <= 2 && stroke.kind !== "text")
          return;
        const bounds = renderBounds(stroke),
          padding =
            stroke.kind === "text" ? Math.max((stroke.fontSize ?? 28) * 0.12, 6) : stroke.width / 2;
        // 旋转态：绕包围盒中心旋转后画矩形（与元素旋转一致）。
        const a = stroke.angle ?? 0;
        if (a) {
          const c = strokeCenter(stroke);
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(a);
          ctx.translate(-c.x, -c.y);
          ctx.strokeRect(
            bounds.minX - padding,
            bounds.minY - padding,
            bounds.width + padding * 2,
            bounds.height + padding * 2,
          );
          ctx.restore();
        } else {
          ctx.strokeRect(
            bounds.minX - padding,
            bounds.minY - padding,
            bounds.width + padding * 2,
            bounds.height + padding * 2,
          );
        }
      });
    }
    ctx.restore();
  }
}

export function svgBackground(size: Size, layout: CanvasLayout, bg: string) {
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

export function createSvg(
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
    const parts: string[] = [];
    // 旋转态：输出包 <g rotate>，使整条 stroke（含箭头两 path/文本 defs+text/渐变 defs）一起旋转。
    const a = stroke.angle ?? 0;
    const flush = () => {
      if (!parts.length) return;
      if (a) {
        const c = strokeCenter(stroke);
        const deg = ((a * 180) / Math.PI).toFixed(2);
        groupsXml.push(
          `<g transform="rotate(${deg} ${c.x.toFixed(1)} ${c.y.toFixed(1)})">${parts.join("")}</g>`,
        );
      } else {
        groupsXml.push(parts.join(""));
      }
    };
    const points = renderPoints(stroke);
    // 文本笔画：生成 <text> 元素。
    if (stroke.kind === "text") {
      const p = points[0];
      if (!p || !stroke.text) return;
      const source = paintSource(stroke, groups, overlapMode);
      const fs = stroke.fontSize ?? 28;
      const ff = stroke.fontFamily ?? "sans-serif";
      const lines = stroke.text.split("\n");
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${p.x}" dy="${i === 0 ? 0 : fs * 1.2}">${escapeAttr(line)}</tspan>`,
        )
        .join("");
      let fill = escapeAttr(
        source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000000"),
      );
      let defs = "";
      if (source.mode === "gradient" && source.stops.length) {
        const { width } = textMetrics(stroke);
        const gid = `txt-${stroke.id}`;
        const stopsXml = source.stops
          .map(
            (s) =>
              `<stop offset="${(s.pos / 100).toFixed(3)}" stop-color="${s.hex}" stop-opacity="${(s.alpha / 100).toFixed(3)}" />`,
          )
          .join("");
        defs = `<defs><linearGradient id="${gid}" x1="${p.x}" y1="0" x2="${p.x + width}" y2="0" gradientUnits="userSpaceOnUse">${stopsXml}</linearGradient></defs>`;
        fill = `url(#${gid})`;
      }
      parts.push(
        `${defs}<text x="${p.x}" y="${p.y}" font-size="${fs}" font-family="${escapeAttr(ff)}" fill="${fill}" style="dominant-baseline:hanging">${tspans}</text>`,
      );
      flush();
      return;
    }
    if (points.length < 2) return;
    const source = paintSource(stroke, groups, overlapMode);
    const closed = isClosedShape(stroke);
    const isArrow = stroke.shape === "arrow";
    // 线性圆角元素：SVG 路径用 Catmull-Rom 平滑曲线点（与 canvas 渲染一致）。
    const drawPts =
      stroke.roundness === "round" && isLinearStroke(stroke) && points.length >= 3
        ? curvePoints(points)
        : points;
    const dash = strokeDashArray(stroke.strokeStyle ?? "solid", stroke.width);
    const dashAttr = dash ? ` stroke-dasharray="${dash.join(",")}"` : "";
    if (isArrow) {
      const e = points[points.length - 1];
      const prev = points[points.length - 2] ?? points[0];
      const head = arrowHeadPoints(prev, e, stroke.width);
      const shaftD = toPathData(drawPts); // 整条杆（折线/曲线，支持中点变弯+圆角）
      const headD = toPathData(head);
      const color = source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000000");
      parts.push(
        `<path d="${shaftD}" fill="none" stroke="${escapeAttr(color)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${mix ? ' style="mix-blend-mode:multiply"' : ""} />`,
      );
      parts.push(
        `<path d="${headD}" fill="none" stroke="${escapeAttr(color)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${mix ? ' style="mix-blend-mode:multiply"' : ""} />`,
      );
      flush();
      return;
    }
    if (source.mode === "solid") {
      const d = toPathData(drawPts) + (closed ? " Z" : "");
      parts.push(
        `<path d="${d}" fill="none" stroke="${escapeAttr(source.solid)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${mix ? ' style="mix-blend-mode:multiply"' : ""} />`,
      );
    } else {
      parts.push(svgGradientStroke(drawPts, source.stops, source.space, stroke.width, closed, mix));
    }
    flush();
  });
  // mix 模式下笔画之间互相 multiply，但用 isolate 隔离组，使背景色不参与混色
  const body = mix
    ? `<g style="isolation:isolate">\n  ${groupsXml.join("\n  ")}\n  </g>`
    : groupsXml.join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">\n  ${svgBackground(size, bgLayout, bgColor)}\n  ${body}\n</svg>`;
}
