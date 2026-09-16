import { bestTextOn, simulateCB, type CBMode } from "@/lib/color";

export function colorSvg(colors: string[], width = 180, height = 180) {
  const sliceWidth = Math.max(1, Math.floor(width / Math.max(colors.length, 1)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${colors
    .map(
      (color, index) =>
        `<rect x="${index * sliceWidth}" y="0" width="${sliceWidth}" height="${height}" fill="${color}" />`,
    )
    .join("")}</svg>`;
}

export function colorPng(colors: string[], labels: string[] = []) {
  const canvas = document.createElement("canvas");
  const width = 240 * Math.max(colors.length, 1);
  const height = 320;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  colors.forEach((color, index) => {
    const x = index * 240;
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, 240, height - 70);
    ctx.fillStyle = bestTextOn(color);
    ctx.font = "20px Inter, 'Noto Sans SC', system-ui, sans-serif";
    ctx.fillText(labels[index] ?? color, x + 18, height - 28);
  });
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  });
}

export function gradientCss(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  const stopList = stops
    .map((stop) => `${simulateCB(stop.hex, "none" as CBMode)} ${Math.round(stop.pos)}%`)
    .join(", ");
  if (config.type === "radial")
    return `background: radial-gradient(circle at ${config.center.x}% ${config.center.y}%, ${stopList});`;
  if (config.type === "conic")
    return `background: conic-gradient(from ${config.angle}deg at ${config.center.x}% ${config.center.y}%, ${stopList});`;
  return `background: linear-gradient(${config.angle}deg, ${stopList});`;
}

export function gradientSvg(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  if (config.type === "radial") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><radialGradient id="gradient" cx="${config.center.x}%" cy="${config.center.y}%">${stops
      .map((stop) => `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.hex}" />`)
      .join(
        "",
      )}</radialGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><linearGradient id="gradient" gradientTransform="rotate(${config.angle})">${stops
    .map((stop) => `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.hex}" />`)
    .join(
      "",
    )}</linearGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
}

export function gradientPng(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (config.type === "radial") {
    const gradient = ctx.createRadialGradient(
      config.center.x * 10,
      config.center.y * 10,
      10,
      500,
      500,
      700,
    );
    stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);
    return canvas;
  }

  if (config.type === "conic" && "createConicGradient" in ctx) {
    const gradient = (
      ctx as CanvasRenderingContext2D & { createConicGradient: typeof ctx.createConicGradient }
    ).createConicGradient(
      (config.angle * Math.PI) / 180,
      config.center.x * 10,
      config.center.y * 10,
    );
    stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);
    return canvas;
  }

  const gradient = ctx.createLinearGradient(0, 0, 1000, 0);
  stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
  ctx.fillStyle = gradient;
  ctx.save();
  ctx.translate(500, 500);
  ctx.rotate((config.angle * Math.PI) / 180);
  ctx.translate(-500, -500);
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
  return canvas;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** 按可用宽度自动缩字号；连 8px 都塞不下就不标，避免文字溢出到相邻色块。 */
function drawFittedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  size: number,
  color: string,
) {
  let s = Math.round(size);
  while (s > 8) {
    ctx.font = `600 ${s}px Inter, 'Noto Sans SC', system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 1;
  }
  if (s <= 8) return;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
}

export type ImageCompositeOptions = {
  src: string;
  /** 原图原始宽高，仅在 naturalWidth/Height 缺失时兜底。 */
  imageWidth: number;
  imageHeight: number;
  colors: string[];
  /** 输出图最长边上限，默认 2400。 */
  maxSize?: number;
  /** 原图与色带之间的间距，默认 0（紧贴）。 */
  gap?: number;
};

/**
 * 把原图与配色排布合成一张图（**不画点位标记**）。
 * 横向图（w ≥ h）色带在下方；纵向图（w < h）色带在右侧。
 * 图片需要异步解码，故返回 Promise。
 */
export async function imageCompositePng(
  opts: ImageCompositeOptions,
): Promise<HTMLCanvasElement | null> {
  const img = await loadImageElement(opts.src);
  const nw = img.naturalWidth || opts.imageWidth;
  const nh = img.naturalHeight || opts.imageHeight;
  if (!nw || !nh) return null;

  const colors = opts.colors.length ? opts.colors : ["#FFFFFF"];
  const n = colors.length;
  const horizontal = nw >= nh;
  const gap = opts.gap ?? 0;
  // 色带厚度按原图短边取，夹在 [64, 240]
  const band = Math.max(64, Math.min(240, Math.round(Math.min(nw, nh) * 0.18)));

  // 先在原图像素空间算整体布局，再整体等比缩放：这样色带与原图的比例在不同尺寸的图上才一致，
  // 同时也兜住超大图（8000×6000 直接合成约 220MB 显存，多数浏览器会直接失败）。
  const maxSize = opts.maxSize ?? 2400;
  const rawW = horizontal ? nw : nw + gap + band;
  const rawH = horizontal ? nh + gap + band : nh;
  const scale = Math.min(1, maxSize / Math.max(rawW, rawH));
  const cw = Math.max(1, Math.round(rawW * scale));
  const ch = Math.max(1, Math.round(rawH * scale));
  const iw = Math.max(1, Math.round(nw * scale));
  const ih = Math.max(1, Math.round(nh * scale));
  const b = Math.max(1, Math.round(band * scale));
  const g = Math.round(gap * scale);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, iw, ih);

  colors.forEach((color, i) => {
    const isLast = i === n - 1;
    const x = horizontal ? (cw * i) / n : iw + g;
    const y = horizontal ? ih + g : (ch * i) / n;
    // 最后一格收口到画布边缘：画布尺寸是 round 出来的，与逐格累加最多差 1~2px，
    // 不收口会在底部（横向）或右侧（纵向）留下一条白边。
    const w = horizontal ? (isLast ? cw - x : cw / n) : b;
    const h = horizontal ? b : isLast ? ch - y : ch / n;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.ceil(w), Math.ceil(h)); // ceil 消除相邻色块之间的 1px 缝
    drawFittedLabel(
      ctx,
      color.toUpperCase(),
      x + w / 2,
      y + h / 2,
      (horizontal ? w : b) - 12,
      Math.min(horizontal ? b : Math.min(b, h), 28) * 0.42,
      bestTextOn(color),
    );
  });

  return canvas;
}
