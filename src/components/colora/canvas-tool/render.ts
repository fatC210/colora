import {
  drawGradientStroke,
  shapePoints as makeShapePoints,
  svgGradientStroke,
} from "@/lib/path-gradient";
import { GRID_STEP } from "./constants";
import { escapeAttr } from "./io";
import { drawPath, isClosedShape, paintSource, renderPoints, toPathData } from "./path";
import { renderBounds, selectionBounds } from "./geometry";
import { gridColors } from "./tone";
import type { CanvasLayout, Draft, OverlapMode, Size, Stroke, StrokeGroup } from "./types";

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
}) {
  const { w, h } = size;
  if (w === 0 || h === 0) return;
  ctx.clearRect(0, 0, w, h);
  if (showBackground) drawBackground(ctx, size, bgLayout, bgColor);

  const drawStroke = (target: CanvasRenderingContext2D, stroke: Stroke) => {
    const points = renderPoints(stroke);
    // 文本笔画：单点定位 + fillText，不参与路径描边/沿路径渐变。
    if (stroke.kind === "text") {
      const p = points[0];
      if (!p || !stroke.text) return;
      const source = paintSource(stroke, groups, overlapMode);
      const color = source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000000");
      target.save();
      target.fillStyle = color;
      target.textBaseline = "top";
      target.font = `${stroke.fontSize ?? 28}px ${stroke.fontFamily ?? "sans-serif"}`;
      // 多行文本按换行逐行绘制。
      const lines = stroke.text.split("\n");
      const fs = stroke.fontSize ?? 28;
      lines.forEach((line, i) => target.fillText(line, p.x, p.y + i * fs * 1.2));
      target.restore();
      return;
    }
    if (points.length < 2) return;
    const source = paintSource(stroke, groups, overlapMode);
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
    const points =
      draft.type === "brush"
        ? draft.points
        : draft.type === "line"
          ? [draft.start, draft.end]
          : makeShapePoints(draft.shape, draft.start, draft.end);
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
    const selected = strokes.filter((stroke) => selectedIds.includes(stroke.id));
    if (selectionAsGroup && selected.length > 1) {
      // 组合选中：画一个包围所有选中笔画的联合大框，而非每条线一个小框。
      const bounds = selectionBounds(selected);
      if (bounds) ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    } else {
      selected.forEach((stroke) => {
        const bounds = renderBounds(stroke),
          // 选中框紧贴线条本体（仅含线宽半宽 padding，不加额外 8px），
          // 使外框范围 == 命中范围：所见即所点，框外空白一律不选中。
          padding = stroke.width / 2;
        ctx.strokeRect(
          bounds.minX - padding,
          bounds.minY - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2,
        );
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
    const points = renderPoints(stroke);
    // 文本笔画：生成 <text> 元素。
    if (stroke.kind === "text") {
      const p = points[0];
      if (!p || !stroke.text) return;
      const source = paintSource(stroke, groups, overlapMode);
      const color = source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000000");
      const fs = stroke.fontSize ?? 28;
      const ff = stroke.fontFamily ?? "sans-serif";
      const lines = stroke.text.split("\n");
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${p.x}" dy="${i === 0 ? 0 : fs * 1.2}">${escapeAttr(line)}</tspan>`,
        )
        .join("");
      groupsXml.push(
        `<text x="${p.x}" y="${p.y}" font-size="${fs}" font-family="${escapeAttr(ff)}" fill="${escapeAttr(color)}" style="dominant-baseline:hanging">${tspans}</text>`,
      );
      return;
    }
    if (points.length < 2) return;
    const source = paintSource(stroke, groups, overlapMode);
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
