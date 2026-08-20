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
  if (overlapMode === "mix" && offscreen) {
    const octx = offscreen.getContext("2d");
    const tmp = getMixTmp(offscreen.width, offscreen.height);
    const tctx = tmp?.getContext("2d");
    if (octx && tmp && tctx) {
      // 笔画层在透明离屏画布上相互 multiply 混色，最后以 source-over 盖到背景上，
      // 这样背景色不会参与混色计算——线条颜色不受背景色影响。
      // 每条笔画先在临时层 source-over 完整画好（无 multiply，避免同条笔画
      // 段间 round cap 重叠处自乘变暗），再把整条笔画以 multiply 合成到主离屏，
      // 使 multiply 只在笔画之间生效——仅重叠处混色，非重叠处保持各自原色。
      octx.clearRect(0, 0, w, h);
      octx.globalCompositeOperation = "source-over";
      strokes.forEach((stroke, i) => {
        tctx.setTransform(octx.getTransform());
        tctx.clearRect(0, 0, w, h);
        tctx.globalCompositeOperation = "source-over";
        drawStroke(tctx, stroke);
        // 第 0 条 source-over 落到空离屏即其原色；后续条以 multiply 与已有笔画叠加，
        // 仅在重叠像素处相乘变暗，非重叠处因 destination 透明而保持各自原色。
        octx.globalCompositeOperation = i === 0 ? "source-over" : "multiply";
        octx.drawImage(tmp, 0, 0, w, h);
      });
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
