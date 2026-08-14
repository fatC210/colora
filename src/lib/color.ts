// Color math utilities: conversions, harmonies, contrast, colorblind sim, k-means.

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };
export type HSV = { h: number; s: number; v: number };

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n));

export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return "#" + s.toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex) ?? "#000000";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => clamp(Math.round(n)).toString(16).padStart(2, "0");
  return ("#" + to(r) + to(g) + to(b)).toUpperCase();
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0));
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const H = ((h % 360) + 360) % 360, S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - c / 2;
  let rgb: [number, number, number];
  if (H < 60) rgb = [c, x, 0];
  else if (H < 120) rgb = [x, c, 0];
  else if (H < 180) rgb = [0, c, x];
  else if (H < 240) rgb = [0, x, c];
  else if (H < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0));
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  return hslToRgb(hsvToHsl({ h, s, v }));
}

export function hsvToHsl({ h, s, v }: HSV): HSL {
  const S = s / 100, V = v / 100;
  const l = V * (1 - S / 2);
  const sl = l === 0 || l === 1 ? 0 : (V - l) / Math.min(l, 1 - l);
  return { h, s: sl * 100, l: l * 100 };
}

export function rgbToCmyk({ r, g, b }: RGB) {
  const R = r / 255, G = g / 255, B = b / 255;
  const k = 1 - Math.max(R, G, B);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - R - k) / (1 - k)) * 100,
    m: ((1 - G - k) / (1 - k)) * 100,
    y: ((1 - B - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v: number) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(c * 255);
}

export function rgbToXyz({ r, g, b }: RGB) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  return {
    x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
    y: (R * 0.2126729 + G * 0.7151522 + B * 0.072175) * 100,
    z: (R * 0.0193339 + G * 0.119192 + B * 0.9503041) * 100,
  };
}

export function rgbToLab(rgb: RGB) {
  const { x, y, z } = rgbToXyz(rgb);
  const ref = { x: 95.047, y: 100, z: 108.883 };
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / ref.x), fy = f(y / ref.y), fz = f(z / ref.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb({ l, a, b }: { l: number; a: number; b: number }): RGB {
  const fy = (l + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 95.047 / 100, y = inv(fy) * 100 / 100, z = inv(fz) * 108.883 / 100;
  const R = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const G = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const B = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return { r: linearToSrgb(R), g: linearToSrgb(G), b: linearToSrgb(B) };
}

export function labToLch({ l, a, b }: { l: number; a: number; b: number }) {
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h };
}

export function lchToLab({ l, c, h }: { l: number; c: number; h: number }) {
  const rad = (h * Math.PI) / 180;
  return { l, a: Math.cos(rad) * c, b: Math.sin(rad) * c };
}

export function relativeLuminance({ r, g, b }: RGB) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(hex1: string, hex2: string) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function bestTextOn(hex: string) {
  return contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#000000") ? "#FFFFFF" : "#000000";
}

// ---- CSS named colors (closest match) ----
const CSS_COLORS: Record<string, string> = {
  black: "#000000", white: "#FFFFFF", red: "#FF0000", lime: "#00FF00", blue: "#0000FF",
  yellow: "#FFFF00", cyan: "#00FFFF", magenta: "#FF00FF", silver: "#C0C0C0", gray: "#808080",
  maroon: "#800000", olive: "#808000", green: "#008000", purple: "#800080", teal: "#008080",
  navy: "#000080", orange: "#FFA500", tomato: "#FF6347", coral: "#FF7F50", gold: "#FFD700",
  indigo: "#4B0082", violet: "#EE82EE", pink: "#FFC0CB", brown: "#A52A2A", beige: "#F5F5DC",
  ivory: "#FFFFF0", khaki: "#F0E68C", plum: "#DDA0DD", salmon: "#FA8072", turquoise: "#40E0D0",
  crimson: "#DC143C", chocolate: "#D2691E", orchid: "#DA70D6", slateblue: "#6A5ACD",
  steelblue: "#4682B4", seagreen: "#2E8B57", skyblue: "#87CEEB", tan: "#D2B48C",
  lavender: "#E6E6FA", mintcream: "#F5FFFA", peru: "#CD853F", royalblue: "#4169E1",
  forestgreen: "#228B22", darkslategray: "#2F4F4F", midnightblue: "#191970",
};

export function nearestCssColor(hex: string) {
  const lab = rgbToLab(hexToRgb(hex));
  let best = "", bestHex = "#000000", dist = Infinity;
  for (const [name, namedHex] of Object.entries(CSS_COLORS)) {
    const l2 = rgbToLab(hexToRgb(namedHex));
    const d = (lab.l - l2.l) ** 2 + (lab.a - l2.a) ** 2 + (lab.b - l2.b) ** 2;
    if (d < dist) { dist = d; best = name; bestHex = namedHex; }
  }
  return { name: best, hex: bestHex };
}

export function nearestCssName(hex: string) {
  return nearestCssColor(hex).name;
}

// ---- Harmonies ----
export type HarmonyKey =
  | "complementary" | "analogous" | "triadic" | "tetradic" | "split" | "monochrome";

export const HARMONIES: { key: HarmonyKey; label: string }[] = [
  { key: "complementary", label: "互补色" },
  { key: "analogous", label: "类似色" },
  { key: "triadic", label: "三色组" },
  { key: "tetradic", label: "四色组" },
  { key: "split", label: "分裂互补" },
  { key: "monochrome", label: "单色系" },
];

export function generateHarmony(baseHex: string, kind: HarmonyKey, count = 5): string[] {
  const base = rgbToHsl(hexToRgb(baseHex));
  const mk = (h: number, s = base.s, l = base.l) => rgbToHex(hslToRgb({ h, s, l }));
  const wrap = (h: number) => ((h % 360) + 360) % 360;
  let out: string[];
  switch (kind) {
    case "complementary":
      out = [baseHex, mk(wrap(base.h + 180)), mk(wrap(base.h + 180), base.s, Math.min(90, base.l + 15)),
        mk(base.h, Math.max(10, base.s - 25), Math.min(92, base.l + 22)), mk(wrap(base.h + 150))];
      break;
    case "analogous":
      out = [-60, -30, 0, 30, 60].map((d) => mk(wrap(base.h + d)));
      break;
    case "triadic":
      out = [0, 120, 240].map((d) => mk(wrap(base.h + d)))
        .concat([mk(base.h, base.s, Math.min(92, base.l + 20)), mk(wrap(base.h + 120), base.s, Math.max(15, base.l - 18))]);
      break;
    case "tetradic":
      out = [0, 90, 180, 270].map((d) => mk(wrap(base.h + d)))
        .concat([mk(base.h, Math.max(10, base.s - 20), Math.min(92, base.l + 18))]);
      break;
    case "split":
      out = [0, 150, 210].map((d) => mk(wrap(base.h + d)))
        .concat([mk(wrap(base.h + 150), base.s, Math.min(92, base.l + 18)), mk(wrap(base.h + 210), base.s, Math.max(15, base.l - 15))]);
      break;
    default:
      out = [0, 1, 2, 3, 4].map((i) => mk(base.h, base.s, clamp(base.l - 24 + i * 12, 8, 94)));
  }
  return out.slice(0, count);
}

export function randomHex() {
  return rgbToHex({ r: Math.random() * 255, g: Math.random() * 255, b: Math.random() * 255 });
}

export function jitter(hex: string, amount = 12) {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({
    h: hsl.h + (Math.random() - 0.5) * amount * 2,
    s: clamp(hsl.s + (Math.random() - 0.5) * amount, 5, 100),
    l: clamp(hsl.l + (Math.random() - 0.5) * amount, 8, 94),
  }));
}

// Harmony score for free-pick mode (0-100)
export function harmonyScore(colors: string[]) {
  if (colors.length < 2) return 0;
  const hs = colors.map((c) => rgbToHsl(hexToRgb(c)));
  const diffs: number[] = [];
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++) {
      let d = Math.abs(hs[i].h - hs[j].h);
      if (d > 180) d = 360 - d;
      diffs.push(d);
    }
  const ideal = [0, 30, 60, 90, 120, 150, 180];
  const hueScore =
    diffs.reduce((acc, d) => acc + (1 - Math.min(...ideal.map((i) => Math.abs(i - d))) / 30), 0) /
    diffs.length;
  const ls = hs.map((h) => h.l);
  const spread = (Math.max(...ls) - Math.min(...ls)) / 100;
  return Math.round(clamp((hueScore * 0.7 + spread * 0.3) * 100, 0, 100));
}

// ---- Mixing ----
export type MixMode = "subtractive" | "additive" | "average";

export function mixColors(items: { hex: string; weight: number }[], mode: MixMode): string {
  const total = items.reduce((a, b) => a + b.weight, 0) || 1;
  const parts = items.map((i) => ({ rgb: hexToRgb(i.hex), w: i.weight / total }));
  if (mode === "average") {
    return rgbToHex(parts.reduce(
      (acc, p) => ({ r: acc.r + p.rgb.r * p.w, g: acc.g + p.rgb.g * p.w, b: acc.b + p.rgb.b * p.w }),
      { r: 0, g: 0, b: 0 },
    ));
  }
  if (mode === "additive") {
    return rgbToHex(parts.reduce(
      (acc, p) => ({
        r: Math.min(255, acc.r + p.rgb.r * p.w * 1.6),
        g: Math.min(255, acc.g + p.rgb.g * p.w * 1.6),
        b: Math.min(255, acc.b + p.rgb.b * p.w * 1.6),
      }),
      { r: 0, g: 0, b: 0 },
    ));
  }
  // subtractive: multiply-ish in CMY space
  const cmy = parts.reduce(
    (acc, p) => ({
      c: acc.c + (1 - p.rgb.r / 255) * p.w,
      m: acc.m + (1 - p.rgb.g / 255) * p.w,
      y: acc.y + (1 - p.rgb.b / 255) * p.w,
    }),
    { c: 0, m: 0, y: 0 },
  );
  return rgbToHex({ r: (1 - cmy.c) * 255, g: (1 - cmy.m) * 255, b: (1 - cmy.y) * 255 });
}

// ---- Interpolation ----
export type InterpSpace = "rgb" | "lab" | "lch";

export function interpolate(a: string, b: string, t: number, space: InterpSpace): string {
  if (space === "rgb") {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
  }
  if (space === "lab") {
    const A = rgbToLab(hexToRgb(a)), B = rgbToLab(hexToRgb(b));
    return rgbToHex(labToRgb({ l: A.l + (B.l - A.l) * t, a: A.a + (B.a - A.a) * t, b: A.b + (B.b - A.b) * t }));
  }
  const A = labToLch(rgbToLab(hexToRgb(a))), B = labToLch(rgbToLab(hexToRgb(b)));
  let dh = B.h - A.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return rgbToHex(labToRgb(lchToLab({ l: A.l + (B.l - A.l) * t, c: A.c + (B.c - A.c) * t, h: A.h + dh * t })));
}

// ---- Alpha-aware colors (rgba CSS strings for canvas/SVG) ----
// alpha 用 0..100（与 UI 百分比一致）；内部转 0..1 组装 rgba()。
const clampAlpha = (p: number) => Math.min(100, Math.max(0, p));

/** hex(#RRGGBB) + alpha(0..100) → "rgba(r,g,b,a)"，供 canvas strokeStyle / SVG stroke 直接使用 */
export function hexAlphaToCss(hex: string, alphaPercent: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(clampAlpha(alphaPercent) / 100).toFixed(3)})`;
}

/**
 * 在指定空间插值两个带 alpha 的色标，返回 rgba() 字符串。
 * 颜色通道复用 interpolate 的 rgb/lab/lch 逻辑（lch 色相走最短弧），
 * alpha 在三个空间都用同一条线性插值，与色彩空间无关。
 */
export function interpolateAlpha(
  a: { hex: string; alpha: number },
  b: { hex: string; alpha: number },
  t: number,
  space: InterpSpace,
): string {
  const hex = interpolate(a.hex, b.hex, t, space);
  const { r, g, b: bb } = hexToRgb(hex);
  const aa = clampAlpha(a.alpha) / 100;
  const ab = clampAlpha(b.alpha) / 100;
  const alpha = aa + (ab - aa) * t;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(bb)},${alpha.toFixed(3)})`;
}

/** 与 interpolateAlpha 相同的插值，但返回拆分的 { hex, alpha(0..100) }，供新增色标取色用 */
export function interpolateStop(
  a: { hex: string; alpha: number },
  b: { hex: string; alpha: number },
  t: number,
  space: InterpSpace,
): { hex: string; alpha: number } {
  const hex = interpolate(a.hex, b.hex, t, space);
  const alpha = clampAlpha(a.alpha) + (clampAlpha(b.alpha) - clampAlpha(a.alpha)) * t;
  return { hex, alpha: Math.round(alpha) };
}

// ---- Colorblind simulation matrices ----
export type CBMode = "none" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

export const CB_LABELS: Record<Exclude<CBMode, "none">, string> = {
  protanopia: "红色盲",
  deuteranopia: "绿色盲",
  tritanopia: "蓝色盲",
  achromatopsia: "全色盲",
};

const CB_MATRIX: Record<Exclude<CBMode, "none">, number[]> = {
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
};

export function simulateCB(hex: string, mode: CBMode): string {
  if (mode === "none") return hex;
  const m = CB_MATRIX[mode];
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: m[0] * r + m[1] * g + m[2] * b,
    g: m[3] * r + m[4] * g + m[5] * b,
    b: m[6] * r + m[7] * g + m[8] * b,
  });
}

export function cbMatrixValues(mode: Exclude<CBMode, "none">) {
  const m = CB_MATRIX[mode];
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");
}

// ---- K-means color extraction ----
export function kmeans(pixels: RGB[], k: number, iterations = 8) {
  if (pixels.length === 0) return [];
  let centroids: RGB[] = [];
  const step = Math.max(1, Math.floor(pixels.length / k));
  for (let i = 0; i < k; i++) centroids.push(pixels[Math.min(pixels.length - 1, i * step)]);
  let assign = new Array(pixels.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < pixels.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d =
          (pixels[i].r - centroids[c].r) ** 2 +
          (pixels[i].g - centroids[c].g) ** 2 +
          (pixels[i].b - centroids[c].b) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    pixels.forEach((p, i) => {
      const s = sums[assign[i]];
      s.r += p.r; s.g += p.g; s.b += p.b; s.n++;
    });
    centroids = sums.map((s, i) => (s.n ? { r: s.r / s.n, g: s.g / s.n, b: s.b / s.n } : centroids[i]));
  }
  const counts = centroids.map(() => 0);
  assign.forEach((a) => counts[a]++);
  return centroids
    .map((c, i) => ({ hex: rgbToHex(c), share: counts[i] / pixels.length }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

// ---- Formatting ----
export function formatAll(hex: string) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  const hsv = rgbToHsv(rgb);
  const cmyk = rgbToCmyk(rgb);
  const lab = rgbToLab(rgb);
  const lch = labToLch(lab);
  const name = nearestCssColor(hex);
  const r = (n: number, d = 0) => n.toFixed(d);
  return {
    hex,
    rgb: `rgb(${r(rgb.r)}, ${r(rgb.g)}, ${r(rgb.b)})`,
    rgbShort: `${r(rgb.r)}, ${r(rgb.g)}, ${r(rgb.b)}`,
    hsl: `hsl(${r(hsl.h)}, ${r(hsl.s)}%, ${r(hsl.l)}%)`,
    hsv: `hsv(${r(hsv.h)}, ${r(hsv.s)}%, ${r(hsv.v)}%)`,
    cmyk: `cmyk(${r(cmyk.c)}, ${r(cmyk.m)}, ${r(cmyk.y)}, ${r(cmyk.k)})`,
    lab: `lab(${r(lab.l, 1)}, ${r(lab.a, 1)}, ${r(lab.b, 1)})`,
    lch: `lch(${r(lch.l, 1)}, ${r(lch.c, 1)}, ${r(lch.h, 1)})`,
    name: name.name,
    nameHex: name.hex,
    onWhite: contrastRatio(hex, "#FFFFFF"),
    onBlack: contrastRatio(hex, "#000000"),
    hue: hsl.h,
    sat: hsl.s,
  };
}
