import type { PathStop } from "@/lib/path-gradient";
import { clamp } from "./utils";

export function escapeAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
export function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export function getNextStopPosition(stops: PathStop[]) {
  if (stops.length === 0) return 50;
  const positions = stops.map((s) => clamp(s.pos, 0, 100)).sort((a, b) => a - b);
  let gapStart = 0,
    gapEnd = positions[0],
    largest = gapEnd - gapStart;
  for (let i = 0; i < positions.length - 1; i++) {
    const g = positions[i + 1] - positions[i];
    if (g > largest) {
      largest = g;
      gapStart = positions[i];
      gapEnd = positions[i + 1];
    }
  }
  const trailing = 100 - positions[positions.length - 1];
  if (trailing > largest) {
    gapStart = positions[positions.length - 1];
    gapEnd = 100;
  }
  return Math.round((gapStart + gapEnd) / 2);
}
