import { hexToRgb } from "@/lib/color";
import { toHslString, toRgbString } from "./utils";

/**
 * 一组配色的各种格式拼装。
 *
 * 从 `ExportDialog` 的内联 memo 里抽出来的 —— 那段原本绑死在 store 的 `palette` 上，
 * 首页卡片想「复制为 / 导出」自己那一组时没法复用。抽成纯函数后两边共用同一份逻辑，
 * 不会各自漂移。
 */
export type PaletteFormats = {
  hexes: readonly string[];
  rgbs: string[];
  hsls: string[];
  css: string;
  tailwind: string;
  scss: string;
  swift: string;
  kotlin: string;
};

export function formatPalette(hexes: readonly string[]): PaletteFormats {
  return {
    hexes,
    rgbs: hexes.map(toRgbString),
    hsls: hexes.map(toHslString),
    css: hexes.map((hex, index) => `--color-${index + 1}: ${hex};`).join(" "),
    tailwind: `colors: { ${hexes.map((hex, index) => `'color-${index + 1}': '${hex}'`).join(", ")} }`,
    scss: hexes.map((hex, index) => `$color-${index + 1}: ${hex};`).join(" "),
    swift: hexes
      .map((hex) => {
        const rgb = hexToRgb(hex);
        return `UIColor(red: ${(rgb.r / 255).toFixed(2)}, green: ${(rgb.g / 255).toFixed(2)}, blue: ${(rgb.b / 255).toFixed(2)}, alpha: 1.0)`;
      })
      .join("\n"),
    kotlin: hexes.map((hex) => `Color(0xFF${hex.slice(1)})`).join("  "),
  };
}
