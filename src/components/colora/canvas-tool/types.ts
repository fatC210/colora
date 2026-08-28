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
export type BrushType =
  | "pen"
  | "marker"
  | "highlighter"
  | "pencil"
  | "neon"
  | "spray"
  | "brush";
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
  /** 线性元素的边角：sharp=方角折线，round=圆角平滑曲线（Catmull-Rom，对标 Excalidraw roundness）。
   * 默认 sharp（兼容旧文件）。闭合形状不使用此字段（圆角另由形状自身处理）。 */
  roundness?: "sharp" | "round";
  /** 边框样式：solid=实线，dashed=虚线，dotted=点线（对标 Excalidraw StrokeStyle）。默认 solid。 */
  strokeStyle?: "solid" | "dashed" | "dotted";
  /** 画笔笔刷类型（仅 kind==="brush"）。默认 pen=基础实线圆头（兼容旧文件）。 */
  brushType?: BrushType;
  /** 旋转角度（弧度），绕 renderBounds 中心顺时针。默认 0。points 始终存 angle=0 坐标系。 */
  angle?: number;
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
      originLocal?: Point; // 旋转态：指针逆旋转到 angle=0 局部坐标
      center?: Point; // 旋转态：单元素旋转中心
      box: Bounds; // 按下时选中笔画的联合包围盒（含 padding）
      startStrokes: Stroke[]; // 按下时选中笔画快照
      startGroups: StrokeGroup[];
    }
  | {
      type: "pointDrag"; // 线性元素点拖动：改某 point 坐标，或从中点插入新折点
      strokeId: string;
      pointIndex: number; // 被拖 point 在 points 数组中的索引（插入时为新点索引）
      startStrokes: Stroke[];
      startGroups: StrokeGroup[];
    }
  | {
      type: "rotation"; // 旋转手柄拖动：绕中心旋转选中元素
      startPointerAngle: number; // 按下时指针相对中心的角度
      origAngles: Record<string, number>; // 各元素按下时 angle 快照
      center: Point; // 旋转中心（单元素 strokeCenter / 多选 selectionBounds 中心）
      startStrokes: Stroke[];
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
