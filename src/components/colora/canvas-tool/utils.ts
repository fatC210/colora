import type { PathStop, Point } from "@/lib/path-gradient";
import { DEFAULT_STOPS } from "./constants";
import type { Stroke, StrokeGroup, StrokePaint } from "./types";

export const cloneStops = (stops: PathStop[]) => stops.map((stop) => ({ ...stop }));
export const clonePaint = (paint: StrokePaint): StrokePaint => ({
  ...paint,
  stops: cloneStops(paint.stops),
});
export const cloneStrokes = (strokes: Stroke[]) =>
  strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
    paint: clonePaint(stroke.paint),
  }));
export const cloneGroups = (groups: StrokeGroup[]) =>
  groups.map((group) => ({
    ...group,
    strokeIds: [...group.strokeIds],
    stops: cloneStops(group.stops),
  }));
export const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const defaultPaint = (solid = "#7C3AED"): StrokePaint => ({
  mode: "gradient",
  solid,
  stops: cloneStops(DEFAULT_STOPS),
  space: "rgb",
});
