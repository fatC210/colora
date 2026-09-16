import { kmeansWithPositions, rgbToHex, type PositionedRGB } from "./color";

/** 取色点位。坐标是相对原图的归一化值 0..1，与显示尺寸、缩放、导出解耦。 */
export type SamplePoint = {
  id: string;
  x: number;
  y: number;
  /** 当前取到的颜色，#RRGGBB 大写。 */
  hex: string;
  /** 仅 K-means 铺的初始点位有：该聚类像素占比。手动拖动/新增后置为 undefined。 */
  share?: number;
};

/** 缓存的整图像素，供拖动时 O(1) 取色。 */
export type SampleCache = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** 铺初始点位时用的缩略图最长边（与原 kmeans 提取的粒度保持一致）。 */
export const THUMB_EDGE = 160;
/** 取色采样缓存的最长边。512 足够精细（误差 < 0.2%），内存约 1MB。 */
export const SAMPLE_EDGE = 512;

/** 夹到 [0,1]。NaN 兜底返回 0 —— 否则它会一路传进 `style.left` 和像素索引。 */
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

let pointSeq = 0;
/** 点位 id。用自增序号而非随机数，保证同一会话内稳定且可读。 */
export const newPointId = () => `pt-${++pointSeq}`;

/** 建离屏 canvas 并画入图片。尺寸为 0（SVG 无固有尺寸等）或取不到 2d 上下文时返回 null。 */
function drawToCanvas(img: HTMLImageElement, maxEdge: number, fillWhite: boolean) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const scale = Math.min(1, maxEdge / Math.max(nw, nh));
  const width = Math.max(1, Math.round(nw * scale));
  const height = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // 透明像素按白底合成：不填白的话 getImageData 给出的是 0,0,0，会取到黑。
  if (fillWhite) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return { ctx, width, height };
}

/**
 * 缓存整张图的像素供实时取色，图片按最长边 maxEdge 等比缩小。
 * 透明像素按白底合成。
 * SVG 无固有尺寸、或含外链资源导致 canvas 被 taint 时返回 null。
 */
export function buildSampleCache(img: HTMLImageElement, maxEdge = SAMPLE_EDGE): SampleCache | null {
  const drawn = drawToCanvas(img, maxEdge, true);
  if (!drawn) return null;
  try {
    const data = drawn.ctx.getImageData(0, 0, drawn.width, drawn.height).data;
    return { data, width: drawn.width, height: drawn.height };
  } catch {
    // 被 taint 的 canvas（SVG 含 foreignObject / 外链资源）读像素会抛 SecurityError
    return null;
  }
}

/**
 * 按归一化坐标取色。
 *
 * 取整用 `round(x * (width-1))`：端点天然落在 `[0, width-1]` 无需再 clamp，
 * 且与 `initialPointsFromImage` 里的 `(px + 0.5) / width` **互逆** ——
 * 保证「点位的初始位置」与「点位的初始颜色」严格自洽。
 */
export function sampleHexAt(cache: SampleCache, x: number, y: number): string {
  const px = Math.min(cache.width - 1, Math.max(0, Math.round(clamp01(x) * (cache.width - 1))));
  const py = Math.min(cache.height - 1, Math.max(0, Math.round(clamp01(y) * (cache.height - 1))));
  const i = (py * cache.width + px) * 4;
  return rgbToHex({ r: cache.data[i], g: cache.data[i + 1], b: cache.data[i + 2] });
}

/**
 * 上传图片后按 K-means 结果铺初始点位。
 *
 * 聚类在缩略图（最长边 `THUMB_EDGE`）上跑，但坐标归一化到 0..1 —— 因为缩放对宽高
 * 等比，归一化坐标可直接用于全尺寸显示与导出（`Math.round` 引入的误差 ≤ 0.5px，
 * 即 ≤ 0.5/160 ≈ 0.31%，在 360px 高的显示图上约 1px，远小于 24px 的手柄）。
 */
export function initialPointsFromImage(img: HTMLImageElement, k: number): SamplePoint[] {
  // 不填白底：保持与原提取逻辑一致的 alpha < 128 过滤语义
  const drawn = drawToCanvas(img, THUMB_EDGE, false);
  if (!drawn) return [];
  const { ctx, width, height } = drawn;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return [];
  }
  const pixels: PositionedRGB[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue; // 跳过透明像素
      pixels.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        x: (x + 0.5) / width, // 像素中心，与 sampleHexAt 的取整互逆
        y: (y + 0.5) / height,
      });
    }
  }
  return kmeansWithPositions(pixels, k).map((c) => ({
    id: newPointId(),
    x: c.x,
    y: c.y,
    hex: c.hex,
    share: c.share,
  }));
}
