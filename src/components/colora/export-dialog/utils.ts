import { formatAll, hexToRgb, rgbToHsl } from "@/lib/color";

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

export function colorRows(hex: string) {
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
  ] as const;
}

export function markdownTable(rows: readonly (readonly [string, string])[]) {
  return [
    `| 项目 | 值 |`,
    `| --- | --- |`,
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}
