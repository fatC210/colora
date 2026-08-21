import type { InterpSpace, PathStop, Point, ShapeType } from "@/lib/path-gradient";

export type Mode =
  | "select"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "brush"
  | "text"
  | "eraser";
export type StrokeKind = "brush" | "line" | "shape" | "text";
export type PaintMode = "solid" | "gradient";
export type OverlapMode = "mix" | "cover";
export type CanvasLayout = "grid" | "blank" | "dots";
export type InspectorTab = "line" | "canvas";
export type StrokePaint = { mode: PaintMode; solid: string; stops: PathStop[]; space: InterpSpace };
export type Stroke = {
  id: string;
  name: string;
  kind: StrokeKind;
  shape?: ShapeType;
  points: Point[];
  width: number;
  paint: StrokePaint;
  groupId?: string;
  // 文本笔画专属（kind === "text"）：points 为单点定位，text 为内容。
  text?: string;
  fontSize?: number;
  fontFamily?: string;
};
export type StrokeGroup = {
  id: string;
  name: string;
  strokeIds: string[];
  stops: PathStop[];
  space: InterpSpace;
};
export type SelectionBox = { start: Point; end: Point };
export type SceneSnapshot = { strokes: Stroke[]; groups: StrokeGroup[] };
export type Draft =
  | { type: "brush"; points: Point[] }
  | { type: "line"; start: Point; end: Point }
  | { type: "shape"; shape: ShapeType; start: Point; end: Point };
export type DragState =
  | { type: "move"; last: Point; startStrokes: Stroke[]; startGroups: StrokeGroup[] }
  | { type: "marquee"; start: Point }
  | { type: "pan"; last: Point } // 空格/中键拖动平移画布视口（屏幕坐标增量直接加到 pan）
  | {
      type: "resize";
      handle: ResizeHandle;
      origin: Point; // 按下时指针位置（画布坐标）
      box: Bounds; // 按下时选中笔画的联合包围盒（含 padding）
      startStrokes: Stroke[]; // 按下时选中笔画快照
      startGroups: StrokeGroup[];
    };
export type Size = { w: number; h: number };
export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};
// 八个变换手柄：四角 + 四边中点。n/s/e/w 表示固定方向（拖动时该边不动）。
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type { InterpSpace, PathStop, Point, ShapeType };
