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
  wrapText,
  isLinearStroke,
} from "./geometry";
import { gridColors } from "./tone";
import { clamp } from "./utils";
import type {
  BrushType,
  CanvasLayout,
  Draft,
  InterpSpace,
  OverlapMode,
  PaintMode,
  PathStop,
  Point,
  Size,
  Stroke,
  StrokeGroup,
} from "./types";

// mix 模式下供笔画间 multiply 合成用的临时离屏画布（模块级复用，避免每帧重建）。
let mixTmpCanvas: HTMLCanvasElement | null = null;

// 图片缓存：src(data URL) → HTMLImageElement。已解码的图复用，避免每帧重建/重新解码。
const imageCache = new Map<string, HTMLImageElement>();
// 图片解码完成时触发的重绘回调（由 CanvasTool 注册，避免图片首次加载后停留在占位框）。
let imageReadyCallback: (() => void) | null = null;
export function setImageReadyCallback(cb: (() => void) | null) {
  imageReadyCallback = cb;
}
/** 取已解码的图片（未就绪返回 null，并触发后台解码，就绪后回调重绘）。 */
function getImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => {
      // 解码完成，触发一次重绘让占位框换成真实图片。
      imageReadyCallback?.();
    };
    img.src = src;
    imageCache.set(src, img);
    return null; // 本帧尚未就绪
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 稳定伪随机：基于 stroke.id + 索引生成 [0,1) 的确定性值，避免每帧抖动闪烁。 */
function stableRand(seed: string, i: number): number {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) h = (h ^ seed.charCodeAt(k)) * 16777619;
  h = (h ^ i) * 16777619;
  // 转为 [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

/** 笔刷质感绘制（仅 kind==="brush"，brushType !== "pen"）。
 * 支持 solid 与渐变 paint：渐变时 marker/highlighter/neon 用 drawGradientStroke 沿路径渐变，
 * spray/brush 按弧长百分比逐点/逐段取色。返回 true 表示已绘制。 */
function drawBrushStroke(
  target: CanvasRenderingContext2D,
  stroke: Stroke,
  source: { mode: PaintMode; solid: string; stops: PathStop[]; space: InterpSpace },
  drawPts: Point[],
): boolean {
  const bt: BrushType = stroke.brushType ?? "pen";
  if (bt === "pen") return false;
  const w = stroke.width;
  const id = stroke.id;
  const isGrad = source.mode === "gradient" && source.stops.length >= 2;

  target.save();
  target.lineJoin = "round";

  // 渐变模式：沿路径弧长取色。先算各段累计弧长与总长。
  const cum: number[] = [];
  let total = 0;
  if (isGrad) {
    for (let i = 0; i < drawPts.length - 1; i++) {
      const d = Math.hypot(drawPts[i + 1].x - drawPts[i].x, drawPts[i + 1].y - drawPts[i].y);
      cum.push(total);
      total += d;
    }
  }
  // 累计弧长 → 路径百分比处的渐变色。
  const gradColorAt = (i: number): string => {
    if (!isGrad) return source.solid;
    const segLen = total || 1;
    // 取段中点弧长
    const mid =
      (cum[i] ?? 0) +
      (i < drawPts.length - 1
        ? Math.hypot(drawPts[i + 1].x - drawPts[i].x, drawPts[i + 1].y - drawPts[i].y) / 2
        : 0);
    return colorAtPercent(source.stops, (mid / segLen) * 100, source.space);
  };

  if (bt === "marker") {
    // 不用 multiply：深色画布下 multiply 会把颜色压到几乎看不见。source-over 半透在深浅背景均可见。
    target.lineWidth = w * 1.5;
    target.lineCap = "square";
    target.globalAlpha = 0.85;
    if (isGrad) {
      drawGradientStroke(target, drawPts, source.stops, source.space, w * 1.5, false);
    } else {
      target.strokeStyle = source.solid;
      drawPath(target, drawPts, false);
      target.stroke();
    }
  } else if (bt === "highlighter") {
    target.lineWidth = w * 3;
    target.lineCap = "square";
    target.globalAlpha = 0.5;
    if (isGrad) {
      drawGradientStroke(target, drawPts, source.stops, source.space, w * 3, false);
    } else {
      target.strokeStyle = source.solid;
      drawPath(target, drawPts, false);
      target.stroke();
    }
  } else if (bt === "neon") {
    // 外层发光（渐变时逐段取色描边模拟发光）+ 内层白色细芯。
    target.lineCap = "round";
    target.lineWidth = w;
    if (isGrad) {
      // 先画一遍带 shadow 的渐变发光层
      target.shadowColor = source.solid;
      target.shadowBlur = w * 2.5;
      drawGradientStroke(target, drawPts, source.stops, source.space, w, false);
      target.shadowBlur = 0;
    } else {
      target.shadowColor = source.solid;
      target.shadowBlur = w * 2.5;
      target.strokeStyle = source.solid;
      drawPath(target, drawPts, false);
      target.stroke();
      target.shadowBlur = 0;
    }
    // 内层白色细芯
    target.strokeStyle = "#ffffff";
    target.lineWidth = Math.max(1, w * 0.4);
    drawPath(target, drawPts, false);
    target.stroke();
  } else if (bt === "spray") {
    // 沿路径采样，每点撒半径内的散点；渐变时按弧长百分比取色。
    target.globalAlpha = 0.8;
    const radius = w * 1.2;
    const density = Math.max(6, Math.round(w * 1.5));
    const step = Math.max(2, w * 0.6);
    let acc = 0;
    let k = 0;
    for (let i = 0; i < drawPts.length - 1; i++) {
      const a = drawPts[i];
      const b = drawPts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const col = gradColorAt(i);
      target.fillStyle = col;
      let t = acc;
      while (t < segLen) {
        const cx = a.x + ((b.x - a.x) * t) / segLen;
        const cy = a.y + ((b.y - a.y) * t) / segLen;
        for (let d = 0; d < density; d++) {
          const ang = stableRand(id, k) * Math.PI * 2;
          const r = stableRand(id, k + 1) * radius;
          target.beginPath();
          target.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.6, 0, Math.PI * 2);
          target.fill();
          k += 2;
        }
        t += step;
      }
      acc = t - segLen;
    }
  } else if (bt === "brush") {
    // 毛笔：按相邻点间距反比粗细（快=细、慢=粗），逐段画，端点收尖；渐变时逐段取色。
    target.lineCap = "round";
    const maxW = w * 1.3;
    const minW = Math.max(0.5, w * 0.35);
    for (let i = 0; i < drawPts.length - 1; i++) {
      const a = drawPts[i];
      const b = drawPts[i + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const lw = clamp(maxW - dist * 0.25, minW, maxW);
      const isEnd = i === 0 || i === drawPts.length - 2;
      target.lineWidth = isEnd ? lw * 0.5 : lw;
      target.strokeStyle = gradColorAt(i);
      drawPath(target, [a, b], false);
      target.stroke();
    }
  }

  target.restore();
  return true;
}

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
  draftStyle?: {
    color: string;
    width: number;
    brushType?: BrushType;
    id?: string;
    stops?: PathStop[];
    space?: InterpSpace;
  };
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
      // 容器文本：按 w 换行，在容器框内水平+垂直居中。points[0]=容器左上角，w/h=容器尺寸。
      const isContainer = !!stroke.containerId && !!stroke.w && stroke.w > 0;
      const lines = isContainer
        ? wrapText(stroke.text, stroke.w!, fs, ff)
        : stroke.text.split("\n");
      const boxW = isContainer ? stroke.w! : textMetrics(stroke).width;
      const boxH = isContainer
        ? (stroke.h ?? lines.length * fs * 1.2)
        : lines.length <= 1
          ? fs
          : (lines.length - 1) * fs * 1.2 + fs;
      // 垂直居中起点 y = p.y + (boxH - 文本总高)/2；水平左对齐（p.x）。
      const textH = (lines.length - 1) * fs * 1.2 + fs;
      const startY = isContainer ? p.y + Math.max(0, (boxH - textH) / 2) : p.y;
      if (source.mode === "solid" || !source.stops.length) {
        target.fillStyle =
          source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000");
      } else {
        // 水平线性渐变，跨文本宽度，按 stops 的 pos(0..100)/alpha 构造。
        const grad = target.createLinearGradient(p.x, 0, p.x + boxW, 0);
        for (const s of source.stops) {
          const offset = clamp(s.pos / 100, 0, 1);
          grad.addColorStop(offset, hexAlphaToCss(s.hex, s.alpha));
        }
        target.fillStyle = grad;
      }
      lines.forEach((line, i) => target.fillText(line, p.x, startY + i * fs * 1.2));
      target.restore();
      return;
    }
    // 图片笔画：单点左上角 + w/h，drawImage 绘制（旋转 transform 已在上方应用）。
    if (stroke.kind === "image") {
      const p = points[0];
      const w = stroke.w ?? stroke.nw ?? 0;
      const h = stroke.h ?? stroke.nh ?? 0;
      if (!p || w <= 0 || h <= 0) {
        target.restore();
        return;
      }
      const img = stroke.src ? getImage(stroke.src) : null;
      if (img) {
        target.drawImage(img, p.x, p.y, w, h);
      } else {
        // 未就绪：画占位框，下一帧解码完成后会重绘（渲染依赖含 draft/选中变化会触发，
        // 但图片首次解码完成需要外部触发重绘——由 CanvasTool 的图片加载回调 setStrokes 触发）。
        target.strokeStyle = "rgba(124,58,237,0.6)";
        target.lineWidth = 1;
        target.setLineDash([6, 4]);
        target.strokeRect(p.x, p.y, w, h);
        target.setLineDash([]);
      }
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
    // 画笔笔刷质感（marker/highlighter/neon/spray/brush）：用 source（含渐变 stops）渲染质感；
    // pen（缺省）走通用描边/渐变路径。
    if (stroke.kind === "brush" && (stroke.brushType ?? "pen") !== "pen") {
      if (drawBrushStroke(target, stroke, source, drawPts)) {
        target.restore();
        return;
      }
    }
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
    // 实时预览：按最终颜色/宽度（对标 Excalidraw，绘制时即所见即所得，不用虚线）。
    // 有渐变 stops 时按沿路径渐变预览（不等到落笔才显示渐变）；否则单色。
    const w = draftStyle?.width ?? 3;
    const stops = draftStyle?.stops;
    const hasGrad = !!stops && stops.length >= 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (draft.type === "shape" && draft.shape === "arrow") {
      // 箭头 draft：杆画到 tip + 头部两条边（与正式 stroke 同一几何）。
      const head = arrowHeadPoints(draft.start, draft.end, w);
      if (hasGrad && stops) {
        drawGradientStroke(
          ctx,
          [draft.start, draft.end],
          stops,
          draftStyle?.space ?? "rgb",
          w,
          false,
        );
        drawGradientStroke(ctx, head, stops, draftStyle?.space ?? "rgb", w, false);
      } else {
        ctx.strokeStyle = draftStyle?.color ?? "rgba(2, 132, 199, 0.9)";
        ctx.lineWidth = w;
        drawPath(ctx, [draft.start, draft.end], false);
        ctx.stroke();
        drawPath(ctx, head, false);
        ctx.stroke();
      }
    } else {
      if (draft.type === "image") {
        // 图片 draft：拖拽确定插入框，画虚线矩形占位预览。
        const x = Math.min(draft.start.x, draft.end.x);
        const y = Math.min(draft.start.y, draft.end.y);
        const dw = Math.abs(draft.end.x - draft.start.x);
        const dh = Math.abs(draft.end.y - draft.start.y);
        ctx.strokeStyle = draftStyle?.color ?? "rgba(124, 58, 237, 0.9)";
        ctx.lineWidth = w;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(x, y, dw, dh);
        ctx.setLineDash([]);
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
        // 非基础笔刷：用对应笔刷质感实时预览（所见即所得）。
        if (
          draft.type === "brush" &&
          draftStyle?.brushType &&
          draftStyle.brushType !== "pen" &&
          drawBrushStroke(
            ctx,
            { id: draftStyle.id ?? "draft", width: w, brushType: draftStyle.brushType } as Stroke,
            {
              mode: hasGrad ? "gradient" : "solid",
              solid: draftStyle?.color ?? "rgba(2, 132, 199, 0.9)",
              stops: stops ?? [],
              space: draftStyle?.space ?? "rgb",
            },
            points,
          )
        ) {
          // drawBrushStroke 已绘制。
        } else if (hasGrad && stops) {
          // 渐变 paint：沿路径渐变实时预览（line/shape/pen 画笔统一）。
          drawGradientStroke(ctx, points, stops, draftStyle?.space ?? "rgb", w, draftClosed);
        } else {
          ctx.strokeStyle = draftStyle?.color ?? "rgba(2, 132, 199, 0.9)";
          ctx.lineWidth = w;
          drawPath(ctx, points, draftClosed);
          ctx.stroke();
        }
      }
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
            stroke.kind === "text"
              ? Math.max((stroke.fontSize ?? 28) * 0.12, 6)
              : stroke.kind === "image"
                ? 6
                : stroke.width / 2;
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
      const body = parts.join("");
      if (a) {
        const c = strokeCenter(stroke);
        const deg = ((a * 180) / Math.PI).toFixed(2);
        groupsXml.push(
          `<g transform="rotate(${deg} ${c.x.toFixed(1)} ${c.y.toFixed(1)})">${body}</g>`,
        );
      } else {
        groupsXml.push(body);
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
      const isContainer = !!stroke.containerId && !!stroke.w && stroke.w > 0;
      const lines = isContainer
        ? wrapText(stroke.text, stroke.w!, fs, ff)
        : stroke.text.split("\n");
      const boxH = isContainer ? (stroke.h ?? lines.length * fs * 1.2) : 0;
      const textH = (lines.length - 1) * fs * 1.2 + fs;
      const startY = isContainer ? p.y + Math.max(0, (boxH - textH) / 2) : p.y;
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${p.x}" y="${startY}" dy="${i === 0 ? 0 : fs * 1.2}">${escapeAttr(line)}</tspan>`,
        )
        .join("");
      let fill = escapeAttr(
        source.mode === "solid" ? source.solid : (source.stops[0]?.hex ?? "#000000"),
      );
      let defs = "";
      if (source.mode === "gradient" && source.stops.length) {
        const width = isContainer ? stroke.w! : textMetrics(stroke).width;
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
        `${defs}<text x="${p.x}" y="${startY}" font-size="${fs}" font-family="${escapeAttr(ff)}" fill="${fill}" style="dominant-baseline:hanging">${tspans}</text>`,
      );
      flush();
      return;
    }
    // 图片笔画：<image href> 内嵌 data URL（旋转 <g> 已由 flush 包裹）。
    if (stroke.kind === "image") {
      const p = points[0];
      const w = stroke.w ?? stroke.nw ?? 0;
      const h = stroke.h ?? stroke.nh ?? 0;
      if (!p || w <= 0 || h <= 0 || !stroke.src) return;
      parts.push(
        `<image href="${escapeAttr(stroke.src)}" x="${p.x}" y="${p.y}" width="${w}" height="${h}" preserveAspectRatio="none" />`,
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
    // 画笔笔刷（非 pen）SVG 近似：优先于渐变，用单色表达质感。
    const bt = stroke.brushType ?? "pen";
    if (stroke.kind === "brush" && bt !== "pen") {
      const d = toPathData(drawPts) + (closed ? " Z" : "");
      const color = escapeAttr(source.solid);
      if (bt === "marker" || bt === "highlighter") {
        const scale = bt === "marker" ? 1.5 : 3;
        const op = bt === "marker" ? 0.85 : 0.5;
        parts.push(
          `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke.width * scale}" stroke-linecap="square" stroke-linejoin="round" stroke-opacity="${op}" />`,
        );
      } else if (bt === "neon") {
        const fid = `neon-${stroke.id}`;
        parts.push(
          `<defs><filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${stroke.width * 1.2}" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>`,
        );
        parts.push(
          `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" filter="url(#${fid})" />`,
        );
      } else {
        // spray / brush：SVG 近似为普通描边（纹理质感请以 PNG 导出为准）。
        parts.push(
          `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${mix ? ' style="mix-blend-mode:multiply"' : ""} />`,
        );
      }
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
