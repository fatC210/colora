import {
  drawGradientStroke,
  shapePoints as makeShapePoints,
  svgGradientStroke,
} from "@/lib/path-gradient";
import { GRID_STEP } from "./constants";
import { escapeAttr } from "./io";
import { drawPath, isClosedShape, paintSource, renderPoints, toPathData } from "./path";
import { renderBounds } from "./geometry";
import { gridColors } from "./tone";
import type { CanvasLayout, Draft, OverlapMode, Size, Stroke, StrokeGroup } from "./types";

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
