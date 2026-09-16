import type { TKey } from "@/lib/i18n";

export type GradType = "linear" | "radial" | "conic" | "mesh";
export type MeshPoint = { x: number; y: number };

export const MESH_POINTS: MeshPoint[] = [
  { x: 18, y: 35 },
  { x: 62, y: 18 },
  { x: 88, y: 55 },
  { x: 40, y: 88 },
  { x: 72, y: 72 },
];

// 渐变方向线半长（px）：停止点沿线分布的范围
export const GRADIENT_LINE_RADIUS = 140;

export const TYPES: { key: GradType; label: TKey }[] = [
  { key: "linear", label: "线性" },
  { key: "radial", label: "径向" },
  { key: "conic", label: "锥形" },
  { key: "mesh", label: "Mesh" },
];

/** 按 GradType 直接取 label，避免调用点写 `find(...)?.label` 再处理 undefined。 */
export const GRAD_TYPE_LABELS = Object.fromEntries(
  TYPES.map((item) => [item.key, item.label]),
) as Record<GradType, TKey>;
