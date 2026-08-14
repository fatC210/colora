import { simulateCB, type CBMode } from "@/lib/color";
import type { GradientConfig, GradientStop } from "@/lib/colora-store";
import { MESH_POINTS } from "./constants";
import type { MeshPoint } from "./constants";

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const meshPointFor = (stop: GradientStop, index: number): MeshPoint =>
  stop.mesh ?? MESH_POINTS[index % MESH_POINTS.length];

export const getNextStopPosition = (stops: GradientStop[]) => {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return stops[0].pos < 50 ? 100 : 0;

  const positions = stops.map((stop) => clampPercent(stop.pos)).sort((left, right) => left - right);

  let gapStart = 0;
  let gapEnd = positions[0];
  let largestGap = gapEnd - gapStart;

  for (let positionIndex = 0; positionIndex < positions.length - 1; positionIndex++) {
    const currentGap = positions[positionIndex + 1] - positions[positionIndex];
    if (currentGap > largestGap) {
      largestGap = currentGap;
      gapStart = positions[positionIndex];
      gapEnd = positions[positionIndex + 1];
    }
  }

  const trailingGap = 100 - positions[positions.length - 1];
  if (trailingGap > largestGap) {
    gapStart = positions[positions.length - 1];
    gapEnd = 100;
  }

  return Math.round((gapStart + gapEnd) / 2);
};

export const createStopId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `gradient-stop-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const cloneStops = (stops: GradientStop[]) =>
  stops.map((stop) => ({ ...stop, mesh: stop.mesh ? { ...stop.mesh } : undefined }));

export const cloneConfig = (config: GradientConfig): GradientConfig => ({
  ...config,
  center: { ...config.center },
});

export function gradientPreviewStyle(config: GradientConfig, stops: GradientStop[], cbMode: CBMode) {
  const sortedStops = [...stops].sort((a, b) => a.pos - b.pos);
  const list = sortedStops
    .map((stop) => `${simulateCB(stop.hex, cbMode)} ${Math.round(stop.pos)}%`)
    .join(", ");

  if (config.type === "mesh") {
    return {
      backgroundColor: sortedStops[0]?.hex,
      backgroundImage: sortedStops
        .map((stop, stopIndex) => {
          const meshPoint = meshPointFor(stop, stopIndex);
          return `radial-gradient(at ${meshPoint.x}% ${meshPoint.y}%, ${simulateCB(stop.hex, cbMode)} 0px, transparent 55%)`;
        })
        .join(", "),
    };
  }

  return {
    backgroundImage:
      config.type === "linear"
        ? `linear-gradient(${config.angle}deg, ${list})`
        : config.type === "radial"
          ? `radial-gradient(circle at ${config.center.x}% ${config.center.y}%, ${list})`
          : `conic-gradient(from ${config.angle}deg at ${config.center.x}% ${config.center.y}%, ${list})`,
  };
}
