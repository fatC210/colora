import type { InterpSpace, PathStop, ShapeType } from "@/lib/path-gradient";
import type { CanvasLayout } from "./types";

// 演示笔画的原始坐标系（首次测量画布尺寸后按比例缩放入场）
export const INITIAL_W = 1120;
export const INITIAL_H = 720;
export const DEFAULT_STOPS: PathStop[] = [
  { id: "stop-a", hex: "#8B5CF6", pos: 0, alpha: 100 },
  { id: "stop-b", hex: "#06B6D4", pos: 50, alpha: 100 },
  { id: "stop-c", hex: "#F97316", pos: 100, alpha: 100 },
];
export const SHAPES: { value: ShapeType; label: string }[] = [
  { value: "circle", label: "圆形" },
  { value: "roundedRect", label: "圆角矩形" },
  { value: "triangle", label: "三角形" },
  { value: "pentagon", label: "五边形" },
  { value: "star", label: "六角星" },
  { value: "heart", label: "爱心" },
  { value: "wave", label: "波浪线" },
  { value: "curve", label: "曲线" },
  { value: "spiral", label: "螺旋" },
];
export const PRESETS: { value: ShapeType; label: string }[] = [
  { value: "curve", label: "曲线" },
  { value: "wave", label: "波浪" },
  { value: "circle", label: "圆" },
  { value: "spiral", label: "螺旋" },
  { value: "heart", label: "心形" },
];
export const INTERP_SPACES: InterpSpace[] = ["rgb", "lab", "lch"];

// 文本笔画可选字体（CSS font-family 值）。
export const CANVAS_FONTS: { label: string; value: string }[] = [
  { label: "无衬线", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "衬线", value: "ui-serif, Georgia, serif" },
  { label: "等宽", value: "ui-monospace, monospace" },
  { label: "黑体", value: "'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { label: "楷体", value: "'Kaiti SC', 'KaiTi', serif" },
  { label: "宋体", value: "'SimSun', 'Songti SC', serif" },
];

export const CANVAS_LAYOUTS: { value: CanvasLayout; label: string }[] = [
  { value: "grid", label: "方格" },
  { value: "blank", label: "空白" },
  { value: "dots", label: "点状" },
];
export const CANVAS_BG_LIGHT = "#ffffff";
export const CANVAS_BG_DARK = "#0a0a0a";
export const defaultCanvasBg = (isDark: boolean) => (isDark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT);
export const GRID_STEP = 40;

// 适合用作画布背景的常用色（线条颜色不受其影响）
export const CANVAS_BG_PRESETS: { hex: string; label: string }[] = [
  { hex: "#FFFFFF", label: "纯白" },
  { hex: "#F5F1E8", label: "茶白" },
  { hex: "#E8DCC4", label: "牛皮纸黄" },
  { hex: "#D9C9A8", label: "米麻" },
  { hex: "#C9C2B6", label: "浅灰麻" },
  { hex: "#9B9B9B", label: "中灰" },
  { hex: "#4A4A4A", label: "墨灰" },
  { hex: "#2B2B2B", label: "深墨" },
  { hex: "#0A0A0A", label: "近黑" },
];
