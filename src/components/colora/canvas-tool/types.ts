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
  | "image"
  | "eraser";
export type StrokeKind = "brush" | "line" | "shape" | "text" | "image";
export type BrushType = "pen" | "marker" | "highlighter" | "neon" | "spray" | "brush";
export type PaintMode = "solid" | "gradient";
export type OverlapMode = "mix" | "cover";
export type CanvasLayout = "grid" | "blank" | "dots";
export type InspectorTab = "line" | "canvas";
export type StrokePaint = { mode: PaintMode; solid: string; stops: PathStop[]; space: InterpSpace };

/** 箭头端点绑定到目标元素上的锚点位置（目标 renderBounds 的边/中心）。 */
export type BindingAnchor = "top" | "bottom" | "left" | "right" | "center";
export type Binding = { strokeId: string; anchor: BindingAnchor };
/** 箭头端点绑定：start=首端绑定、end=末端绑定。只存偏好，端点坐标每次按目标当前 bounds 重算。 */
export type StrokeBindings = { start?: Binding; end?: Binding };

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
  // 图片笔画专属（kind === "image"）：points 为单点左上角（angle=0 局部坐标）。
  // src=图片 data URL；nw/nh=自然像素尺寸；w/h=渲染尺寸（可缩放）。
  src?: string;
  nw?: number;
  nh?: number;
  w?: number;
  h?: number;
  // 图片镜像翻转（对标 Excalidraw scale）：-1 = 该轴镜像，默认 1。绕图片盒中心翻转，不改 points。
  scaleX?: 1 | -1;
  scaleY?: 1 | -1;
  // 元素级不透明度 0~100（对标 Excalidraw element.opacity）。默认 100（字段缺省即 100，兼容旧文件）。
  opacity?: number;
  // Web 链接：Ctrl/Cmd+点击在新标签打开；SVG 导出包 <a>。
  href?: string;
  // 箭头绑定（仅 line / shape==="arrow"）：端点吸附到目标元素。
  bindings?: StrokeBindings;
  // 文本绑定容器：containerId=本文本指向容器 shape id；boundTextId=容器反指其文本 stroke。
  // 容器文本用 w/h 作换行框（替代 measureText），resize 容器时同步更新 w/h 并重排。
  containerId?: string;
  boundTextId?: string;
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
  | { type: "shape"; shape: ShapeType; start: Point; end: Point }
  | { type: "image"; start: Point; end: Point };
export type DragState =
  | { type: "move"; start: Point; last: Point; startStrokes: Stroke[]; startGroups: StrokeGroup[] }
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
