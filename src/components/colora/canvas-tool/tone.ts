import { hexToRgb, relativeLuminance } from "@/lib/color";

/**
 * 根据画布背景色的实际明度计算方格线 / 点状的颜色。
 * 背景越亮用半透明黑，越暗用半透明白；明度越接近中间值，透明度越低（前景越实），
 * 以保证牛皮纸黄、中灰等中间明度背景上方格/点状仍有足够对比度。
 */
export function gridColors(bg: string): { line: string; dot: string } {
  const rgb = hexToRgb(bg);
  if (!rgb) return { line: "rgba(15,23,42,0.08)", dot: "rgba(15,23,42,0.20)" };
  const lum = relativeLuminance(rgb); // 0~1
  const dark = lum < 0.5;
  // 距两端的最大距离：0=纯黑或纯白，0.5=中灰。中灰时 alpha 拉满。
  const midness = 1 - Math.abs(lum - 0.5) * 2; // 0(端点) ~ 1(中点)
  const lineAlpha = 0.06 + midness * 0.12; // 0.06 ~ 0.18
  const dotAlpha = 0.16 + midness * 0.16; // 0.16 ~ 0.32
  const base = dark ? "255,255,255" : "15,23,42";
  return { line: `rgba(${base},${lineAlpha})`, dot: `rgba(${base},${dotAlpha})` };
}

/**
 * Build shared colors for the inspector trigger and floating panel.
 */
export function inspectorTone(bg: string): {
  surface: string;
  icon: string;
  border: string;
  shade: string;
} {
  const rgb = hexToRgb(bg);
  const lum = relativeLuminance(rgb);
  const dark = lum < 0.5;

  if (dark) {
    return {
      surface: "rgb(10 10 10 / 0.96)",
      icon: "rgb(229 229 229)",
      border: "rgb(255 255 255 / 0.10)",
      shade: "rgb(0 0 0 / 0.38)",
    };
  }

  return {
    surface: "rgb(250 250 250 / 0.96)",
    icon: "rgb(24 24 27)",
    border: "rgb(0 0 0 / 0.12)",
    shade: "rgb(0 0 0 / 0.18)",
  };
}
