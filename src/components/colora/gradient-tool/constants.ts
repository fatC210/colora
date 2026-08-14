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

export const TYPES: { key: GradType; label: string }[] = [
  { key: "linear", label: "线性" },
  { key: "radial", label: "径向" },
  { key: "conic", label: "锥形" },
  { key: "mesh", label: "Mesh" },
];
