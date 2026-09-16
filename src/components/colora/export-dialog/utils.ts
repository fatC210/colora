import { formatAll, hexToRgb, rgbToHsl } from "@/lib/color";
import type { TKey } from "@/lib/i18n";

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function copy(value: string) {
  void navigator.clipboard?.writeText(value);
}

export function toRgbString(hex: string) {
  const color = hexToRgb(hex);
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

export function toHslString(hex: string) {
  const color = rgbToHsl(hexToRgb(hex));
  return `hsl(${Math.round(color.h)}, ${Math.round(color.s)}%, ${Math.round(color.l)}%)`;
}

/**
 * 颜色各项格式的展示行。
 *
 * label 返回的是**词典 key** 而非成品文案 —— 这个模块不是 React 组件、拿不到 hook，
 * 由调用方（ExportDialog，手里有 `t`）翻译。见 `TKey`。
 */
export function colorRows(hex: string): (readonly [TKey, string])[] {
  const all = formatAll(hex);
  return [
    ["HEX", all.hex],
    ["RGB", all.rgb],
    ["HSL", all.hsl],
    ["HSV", all.hsv],
    ["CMYK", all.cmyk],
    ["Lab", all.lab],
    ["LCH", all.lch],
    ["最近 CSS 色", `${all.name} (${all.nameHex})`],
    ["对比黑", all.onBlack.toFixed(2)],
    ["对比白", all.onWhite.toFixed(2)],
  ];
}

/**
 * 生成 Markdown 表格。表头由调用方传入已翻译的文本 —— 这个模块没有 `t`。
 * 表格内容会写进用户下载的 `.md` 文件，所以表头必须跟随界面语言。
 */
export function markdownTable(
  rows: readonly (readonly [string, string])[],
  header: readonly [string, string],
) {
  return [
    `| ${header[0]} | ${header[1]} |`,
    `| --- | --- |`,
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}
