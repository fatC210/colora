import { defaultPaint } from "./utils";
import type { Stroke } from "./types";

export const initialStrokes: Stroke[] = [
  {
    id: "demo-1",
    name: "演示曲线 1",
    kind: "brush",
    points: [
      { x: 178, y: 438 },
      { x: 285, y: 222 },
      { x: 430, y: 389 },
      { x: 568, y: 170 },
      { x: 742, y: 318 },
      { x: 930, y: 222 },
    ],
    width: 24,
    paint: defaultPaint("#8B5CF6"),
  },
  {
    id: "demo-2",
    name: "演示波浪",
    kind: "shape",
    shape: "wave",
    points: [
      { x: 190, y: 535 },
      { x: 301, y: 483 },
      { x: 413, y: 535 },
      { x: 525, y: 587 },
      { x: 636, y: 535 },
      { x: 748, y: 483 },
      { x: 860, y: 535 },
      { x: 972, y: 587 },
    ],
    width: 16,
    paint: {
      mode: "gradient",
      solid: "#06B6D4",
      stops: [
        { id: "demo-2-a", hex: "#06B6D4", pos: 0, alpha: 100 },
        { id: "demo-2-b", hex: "#22C55E", pos: 100, alpha: 100 },
      ],
      space: "rgb",
    },
  },
];
