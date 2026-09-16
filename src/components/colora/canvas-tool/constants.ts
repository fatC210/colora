import type { InterpSpace, PathStop, ShapeType } from "@/lib/path-gradient";
import type { TKey } from "@/lib/i18n";
import type { BrushType, CanvasLayout } from "./types";

// 演示笔画的原始坐标系（首次测量画布尺寸后按比例缩放入场）
export const INITIAL_W = 1120;
export const INITIAL_H = 720;

// 画布尺寸预设（画布坐标像素）。free=无固定画板；其余为可见画板框 + 导出裁剪范围。
export const CANVAS_PRESETS: {
  id: "free" | "A4" | "16:9" | "4:3" | "square";
  label: TKey;
  w: number;
  h: number;
}[] = [
  { id: "free", label: "自由", w: 0, h: 0 },
  { id: "A4", label: "A4", w: 1120, h: 794 },
  { id: "16:9", label: "16:9", w: 1280, h: 720 },
  { id: "4:3", label: "4:3", w: 960, h: 720 },
  { id: "square", label: "正方形", w: 800, h: 800 },
];
export const DEFAULT_STOPS: PathStop[] = [
  { id: "stop-a", hex: "#8B5CF6", pos: 0, alpha: 100 },
  { id: "stop-b", hex: "#06B6D4", pos: 50, alpha: 100 },
  { id: "stop-c", hex: "#F97316", pos: 100, alpha: 100 },
];
export const SHAPES: { value: ShapeType; label: TKey }[] = [
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
export const PRESETS: { value: ShapeType; label: TKey }[] = [
  { value: "curve", label: "曲线" },
  { value: "wave", label: "波浪" },
  { value: "circle", label: "圆" },
  { value: "spiral", label: "螺旋" },
  { value: "heart", label: "心形" },
];
export const INTERP_SPACES: InterpSpace[] = ["rgb", "lab", "lch"];

// 文本笔画可选字体（CSS font-family 值）。
// 仅保留 Windows/macOS 都真实存在的字体，fallback 链跨平台互补，避免退化成默认无衬线导致多个字体看着一样。
export const CANVAS_FONTS: { label: TKey; value: string }[] = [
  { label: "无衬线", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "衬线", value: "ui-serif, Georgia, serif" },
  { label: "等宽", value: "ui-monospace, monospace" },
  { label: "黑体", value: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
  { label: "宋体", value: "'SimSun', 'Songti SC', 'STSong', serif" },
  { label: "楷体", value: "'KaiTi', 'Kaiti SC', 'STKaiti', serif" },
  { label: "仿宋", value: "'FangSong', 'STFangsong', serif" },
  { label: "微软雅黑", value: "'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif" },
  { label: "手写体", value: "'Comic Sans MS', 'Marker Felt', cursive" },
];

// 画笔笔刷类型（仅 kind==="brush"）。pen=基础实线圆头，兼容旧文件缺省值。
export const BRUSH_TYPES: { id: BrushType; label: TKey }[] = [
  { id: "pen", label: "基础" },
  { id: "marker", label: "马克笔" },
  { id: "highlighter", label: "荧光笔" },
  { id: "neon", label: "霓虹" },
  { id: "spray", label: "喷枪" },
  { id: "brush", label: "毛笔" },
];

export const CANVAS_LAYOUTS: { value: CanvasLayout; label: TKey }[] = [
  { value: "grid", label: "方格" },
  { value: "blank", label: "空白" },
  { value: "dots", label: "点状" },
];
export const CANVAS_BG_LIGHT = "#ffffff";
export const CANVAS_BG_DARK = "#0a0a0a";
export const defaultCanvasBg = (isDark: boolean) => (isDark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT);
export const GRID_STEP = 40;

/** 线宽三档（对标 Excalidraw STROKE_WIDTH：thin/bold/extraBold，取 2/4/8 适配本画布像素）。 */
export const STROKE_WIDTHS: {
  id: "thin" | "bold" | "extraBold";
  label: TKey;
  value: number;
}[] = [
  { id: "thin", label: "细", value: 2 },
  { id: "bold", label: "中", value: 4 },
  { id: "extraBold", label: "粗", value: 8 },
];

// 适合用作画布背景的常用色（线条颜色不受其影响）
export const CANVAS_BG_PRESETS: { hex: string; label: TKey }[] = [
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

/** 画布缩放的上下限（对标 Excalidraw 的 0.1~8 倍），键盘与缩放控件共用。 */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
