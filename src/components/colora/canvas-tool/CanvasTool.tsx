import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowRight,
  Circle,
  Diamond,
  BringToFront,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  EyeOff,
  FileOutput,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Group,
  Hand,
  Image as ImageIcon,
  Keyboard,
  Lock,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Save,
  SendToBack,
  Slash,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  Ungroup,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useColora } from "@/lib/colora-store";
import {
  createStopId,
  nearestPercentOnPath,
  percentToLength,
  pointAtLength,
  shapePoints as makeShapePoints,
  stopAtPercent,
  totalLength,
} from "@/lib/path-gradient";
import { bestTextOn, hexAlphaToCss } from "@/lib/color";
import {
  CANVAS_BG_PRESETS,
  CANVAS_FONTS,
  CANVAS_LAYOUTS,
  CANVAS_PRESETS,
  BRUSH_TYPES,
  DEFAULT_STOPS,
  INITIAL_H,
  INITIAL_W,
  STROKE_WIDTHS,
  ZOOM_MAX,
  ZOOM_MIN,
  defaultCanvasBg,
} from "./constants";
import { ColorEditor } from "./ColorEditor";
import { Tip } from "../primitives";
import { ExportCanvasDialog, type ExportOptions } from "./ExportCanvasDialog";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";
import { initialStrokes } from "./initial-strokes";
import { boxIntersectsStroke, hitStroke } from "./collision";
import { openColoraFile, restoreCanvas, saveColoraFile } from "./file-format";
import {
  clearFileHandle,
  loadFileHandle,
  saveFileHandle,
  saveSceneHistory,
  loadSceneHistory,
  verifyReadPermission,
} from "./file-handle-store";
import { getChannel, broadcastScene, broadcastHello, ORIGIN } from "./broadcast";
import {
  getMidPoints,
  handlePoint,
  isLinearStroke,
  pointInBounds,
  renderBounds,
  resizeTransform,
  rotatePoints,
  selectionBounds,
  strokeCenter,
  toLocalPoint,
  toWorldPoint,
  unionRenderBounds,
  unionWorldBounds,
  worldBounds,
} from "./geometry";
import { downloadText, getNextStopPosition } from "./io";
import { rebindArrows, findSnapAnchor, anchorPointLocal } from "./binding";
import { snapMove, type SnapGuide } from "./snapping";
import { alignStrokes, distributeStrokes, flipStrokes } from "./layout";
import { renderPoints } from "./path";
import { createSvg, renderScene, setImageReadyCallback } from "./render";
import { inspectorTone } from "./tone";
import {
  clamp,
  cloneGroups,
  clonePaint,
  cloneStops,
  cloneStrokes,
  createId,
  defaultPaint,
  distance,
} from "./utils";
import type {
  BindingAnchor,
  CanvasLayout,
  Draft,
  DragState,
  BrushType,
  Mode,
  OverlapMode,
  PaintMode,
  PathStop,
  Point,
  ResizeHandle,
  SceneSnapshot,
  SelectionBox,
  ShapeType,
  Size,
  Stroke,
  StrokeGroup,
  StrokePaint,
} from "./types";

// 橡皮工具光标：黑边白填充圆形（对标 Excalidraw eraser cursor），hotspot 在圆心。
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="white" stroke="black" stroke-width="1.5"/></svg>',
)}") 12 12, default`;

// 纯色元素编辑态中点手柄的虚拟 stop id（拖动跟随指针、不改线条，flushStopDrag 据此走本地位移分支）。
const SOLID_MID_STOP_ID = "solid-mid";

/** 弧度归一化到 [-π, π]。 */
const normalizeAngle = (rad: number) => ((rad + Math.PI) % (2 * Math.PI)) - Math.PI;

// HMR 标志：热更新后清空画布（不保留之前操作的内容，也不恢复 demo）。
// 首次冷启动为 false → 显示 initialStrokes demo；热更新后 dispose 置 true → 空画布。
let __hotReloaded = false;
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    __hotReloaded = true;
  });
}

export function CanvasTool() {
  const { theme, zenMode, toggleZen } = useColora();
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const scaledRef = useRef(false);
  const stopDragRafRef = useRef(0);
  const stopDragInfoRef = useRef<{ stopId: string; x: number; y: number } | null>(null);
  // 拖拽手柄（色标/旋转）拖拽中：驱动 grabbing 光标。
  // CSS :active 在 setPointerCapture / window 监听拖拽期间不生效，故用状态驱动。
  const [handleDragging, setHandleDragging] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  // 图片插入：隐藏 file input + 待插入目标框（拖拽确定尺寸时记录，null=用自然尺寸在点击点插入）。
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageInsertTargetRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  // 箭头绘制时的实时端点吸附信息（start/end 命中的目标锚点 + 锚点世界坐标），供 draft 高亮 + 落地绑定。
  const arrowDraftSnapRef = useRef<{
    start?: { strokeId: string; anchor: BindingAnchor; point: Point };
    end?: { strokeId: string; anchor: BindingAnchor; point: Point };
  }>({});
  // 多窗口同步：BroadcastChannel + 正在应用远端快照标志（避免收到自己的回声再广播）。
  const channelRef = useRef<BroadcastChannel | null>(null);
  const applyingRemoteRef = useRef(false);
  // strokes 的最新快照：供 window 监听回调里读最新值（回调闭包捕获旧 strokes 会导致撤销栈判断失效）。
  const strokesRef = useRef<Stroke[]>([]);
  // 纯色元素编辑态中点手柄的本地拖动位置（屏幕百分比）。拖动跟随指针、不改线条，
  // 松手不回弹；退出编辑态时重置回中点。null 表示未拖动，用路径 50% 中点。
  const [solidMidPos, setSolidMidPos] = useState<{ left: number; top: number } | null>(null);

  const [mode, setMode] = useState<Mode>("select");
  // 工具锁定：开启时落笔后不自动切回选择（对标 Excalidraw Lock）。
  const [lockedTool, setLockedTool] = useState(false);
  // 文本输入浮层：{ canvas 相对像素 x,y; 画布坐标 cx,cy; value; editingId }，text 模式点击画布时打开。
  // editingId 非空表示编辑现有文本（双击进入），提交时更新该 stroke 而非新建。
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    value: string;
    editingId: string | null;
    // 容器文本编辑：containerId = 目标容器 shape id；containerW/H = 容器尺寸（新建时设文本 w/h）。
    containerId?: string;
    containerW?: number;
    containerH?: number;
  } | null>(null);
  // 双击进入编辑的线性笔画 id：显示所有点 + 中间点，拖点/插折点；Esc 退出。
  const [editingLinearId, setEditingLinearId] = useState<string | null>(null);
  // 退出线性编辑态时重置纯色中点手柄的本地拖动位置（下次进入回到路径中点）。
  useEffect(() => {
    if (!editingLinearId) setSolidMidPos(null);
  }, [editingLinearId]);
  const [viewSize, setViewSize] = useState<Size>({ w: 0, h: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>(() =>
    __hotReloaded ? [] : cloneStrokes(initialStrokes),
  );
  strokesRef.current = strokes; // 同步最新 strokes 供 window 监听回调读取
  const [groups, setGroups] = useState<StrokeGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["demo-1"]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  // select 模式下悬停在可选中线条上时光标改为四向移动箭头（对标 Excalidraw）
  const [hoveringStroke, setHoveringStroke] = useState(false);
  // 吸附辅助线（move/draft 时计算，render 循环末尾画屏幕空间虚线）。ref 不入依赖。
  const guidesRef = useRef<SnapGuide[]>([]);
  const [gridSnap, setGridSnap] = useState(false); // 吸附到网格（GRID_STEP）
  const [brushWidth, setBrushWidth] = useState(4);
  // 新建线性元素的默认边角：sharp=方角折线，round=圆角平滑曲线（对标 Excalidraw roundness）。
  const [brushRoundness, setBrushRoundness] = useState<"sharp" | "round">("sharp");
  // 新建元素的默认边框样式：solid/dashed/dotted（对标 Excalidraw StrokeStyle）。
  const [brushStrokeStyle, setBrushStrokeStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  // 新建画笔的笔刷类型：pen/marker/highlighter/pencil/neon/spray/brush（对标专业绘图工具笔刷质感）。
  const [brushType, setBrushType] = useState<BrushType>("pen");
  // 新建文本的默认字体/字号（对标画笔 brushWidth/brushType：工具栏下方悬浮条设置，落笔即用此值）。
  // 选中已有文本时悬浮条回填该文本值并改该文本，同时同步更新这两个 state 作为下次新建默认。
  const [brushFontSize, setBrushFontSize] = useState(28);
  const [brushFontFamily, setBrushFontFamily] = useState<string>(CANVAS_FONTS[0].value);
  // 箭头端点是否自动绑定到目标元素（对标 Excalidraw binding preference，默认开）。
  const [bindingEnabled, setBindingEnabled] = useState(true);
  // 画布尺寸预设：free=无固定画板框；A4/16:9/4:3/square=可见画板框 + 导出裁剪到该框。
  const [canvasPreset, setCanvasPreset] = useState<"free" | "A4" | "16:9" | "4:3" | "square">(
    "free",
  );
  // 预设画板框（画布坐标，视口中心居中）；free 时为 null。
  const [overlapMode, setOverlapMode] = useState<OverlapMode>("mix");
  const [bgLayout, setBgLayout] = useState<CanvasLayout>("grid");
  const [bgColor, setBgColor] = useState<string>(() => defaultCanvasBg(theme === "dark"));
  const bgColorAutoRef = useRef(true); // 是否仍为自动跟随主题的默认色（用户未手动改色）
  // 画布视口：pan=画布原点在屏幕坐标系的偏移（像素），zoom=缩放倍数。
  // 屏幕↔画布：screen = canvas * zoom + pan；canvas = (screen - pan) / zoom。
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // 预设画板框（画布坐标，视口中心居中）；free 时为 null。
  const presetFrame = useMemo(() => {
    if (canvasPreset === "free") return null;
    const p = CANVAS_PRESETS.find((c) => c.id === canvasPreset)!;
    if (p.w === 0 || p.h === 0) return null;
    const cx = (viewSize.w / 2 - pan.x) / zoom;
    const cy = (viewSize.h / 2 - pan.y) / zoom;
    return { x: cx - p.w / 2, y: cy - p.h / 2, w: p.w, h: p.h };
  }, [canvasPreset, pan.x, pan.y, viewSize.w, viewSize.h, zoom]);
  const spaceDownRef = useRef(false); // 空格键按住：进入抓手平移模式（事件读取）
  const [spaceDown, setSpaceDown] = useState(false); // 空格按下（驱动光标 UI）
  // 图片解码完成时 bump，触发 render 重绘（把占位框换成真实图片）。
  const [imageVersion, setImageVersion] = useState(0);
  // 内部剪贴板：Ctrl/Cmd+C 复制选中 stroke，Ctrl/Cmd+V 粘贴（带偏移）。不与系统剪贴板交互。
  const clipboardRef = useRef<Stroke[]>([]);
  const [panning, setPanning] = useState(false); // 是否正在平移拖动（用于光标 grabbing）
  const [undoStack, setUndoStack] = useState<SceneSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SceneSnapshot[]>([]);
  // 画布面板开关（仅由左上触发按钮控制，不随选中变化）。
  const [canvasOpen, setCanvasOpen] = useState(false);
  // 当前已保存/已打开的 .colora 文件句柄：有值时"保存"直接覆写该文件，无值时弹"另存为"。
  const [coloraFileHandle, setColoraFileHandle] = useState<FileSystemFileHandle | null>(null);
  // 已打开文件的文件名（用于默认保存名 + UI 展示）。
  const [coloraFileName, setColoraFileName] = useState<string>("画布");
  // 导出弹窗：打开状态 + 导出选项（含背景、缩放倍率）。
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // 快捷键速查弹窗开关。
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    withBackground: true,
    scale: 2,
  });
  // 危险操作的二次确认弹窗（替代 window.confirm）：记录待执行动作，点「确定」时触发。
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  const selectedStrokes = useMemo(
    () => strokes.filter((stroke) => selectedIds.includes(stroke.id)),
    [selectedIds, strokes],
  );
  const selectedStroke = selectedStrokes.length === 1 ? selectedStrokes[0] : undefined;
  const selectedGroup = useMemo(() => {
    const groupId = selectedStrokes[0]?.groupId;
    if (!groupId || selectedStrokes.some((strokeItem) => strokeItem.groupId !== groupId))
      return undefined;
    return groups.find((groupItem) => groupItem.id === groupId);
  }, [groups, selectedStrokes]);

  // 元素面板开关：选中元素自动开、取消选中自动收（对标 Excalidraw），与画布面板独立。
  const elementOpen = selectedStrokes.length > 0;

  // 选中笔画的联合包围盒（用于显示变换手柄）。框选/拖动中不显示。
  const selBounds = useMemo(() => selectionBounds(selectedStrokes), [selectedStrokes]);

  // 视口内是否有任何笔画内容：用于决定"适应内容"浮层按钮是否显示。
  const hasContentInViewport = useMemo(() => {
    if (!strokes.length || viewSize.w === 0) return true;
    const minX = -pan.x / zoom;
    const maxX = (viewSize.w - pan.x) / zoom;
    const minY = -pan.y / zoom;
    const maxY = (viewSize.h - pan.y) / zoom;
    return strokes.some((s) => {
      const b = worldBounds(s);
      return b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY;
    });
  }, [strokes, pan.x, pan.y, zoom, viewSize.w, viewSize.h]);

  // 缩放以适应所有内容（对标 Excalidraw zoomToFit）：计算让所有笔画包围盒居中铺满视口的 zoom/pan。
  const zoomToFit = useCallback(() => {
    if (viewSize.w === 0 || viewSize.h === 0 || !strokes.length) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const bounds = unionWorldBounds(strokes);
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    // 留 10% 边距，避免内容贴边；zoom 取宽高比的最小值使内容完整可见。
    const margin = 0.1;
    const availW = viewSize.w * (1 - margin * 2);
    const availH = viewSize.h * (1 - margin * 2);
    const z = clamp(Math.min(availW / bounds.width, availH / bounds.height), 0.1, 8);
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    // 视口中心屏幕坐标 = cx*z + pan = viewSize/2 → pan = viewSize/2 - cx*z
    setZoom(z);
    setPan({ x: viewSize.w / 2 - cx * z, y: viewSize.h / 2 - cy * z });
  }, [strokes, viewSize.w, viewSize.h]);

  // 缩放回调：键盘（Ctrl±/0）、缩放控件按钮与右键菜单共用同一条路径，避免逻辑漂移。
  const zoomIn = useCallback(() => setZoom((z) => clamp(z * 1.2, ZOOM_MIN, ZOOM_MAX)), []);
  const zoomOut = useCallback(() => setZoom((z) => clamp(z / 1.2, ZOOM_MIN, ZOOM_MAX)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  // 选中组合内的笔画是否彼此重叠（包围盒相交）。无重叠时"重叠处理"置灰。
  const groupHasOverlap = useMemo(() => {
    if (!selectedGroup || selectedStrokes.length < 2) return false;
    for (let i = 0; i < selectedStrokes.length; i++) {
      for (let j = i + 1; j < selectedStrokes.length; j++) {
        const a = selectedStrokes[i];
        const b = selectedStrokes[j];
        if (
          boxIntersectsStroke(
            {
              start: { x: worldBounds(a).minX, y: worldBounds(a).minY },
              end: { x: worldBounds(a).maxX, y: worldBounds(a).maxY },
            },
            b,
          )
        )
          return true;
      }
    }
    return false;
  }, [selectedGroup, selectedStrokes]);

  // Shared colors for the inspector trigger and panel
  const cornerStyle = useMemo<React.CSSProperties>(() => {
    const c = inspectorTone(bgColor);
    return {
      "--inspector-surface": c.surface,
      "--inspector-icon": c.icon,
      "--inspector-border": c.border,
      "--inspector-shade": c.shade,
    } as React.CSSProperties;
  }, [bgColor]);

  // 主题变化时，若用户未手动改过画布背景色，则跟随主题切换默认色
  useEffect(() => {
    if (bgColorAutoRef.current) setBgColor(defaultCanvasBg(theme === "dark"));
  }, [theme]);

  // 文本输入浮层打开时延迟聚焦：pointer 事件结束后再 focus，避免浏览器把焦点转回
  // canvas/body 触发立即 blur 清掉浮层。光标定位到文本末尾（对标 Excalidraw 双击编辑）。
  useEffect(() => {
    if (!textInput) return;
    const id = window.setTimeout(() => {
      const ta = textAreaRef.current;
      if (!ta) return;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }, 0);
    return () => window.clearTimeout(id);
  }, [textInput]);

  // 空格键：按住进入抓手平移模式；Esc/0 重置视口。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 弹窗打开时（快捷键速查/导出/确认），Esc 等按键交给弹窗自身处理，不触发画布行为。
      if (shortcutHelpOpen || exportDialogOpen || confirmDialog) return;
      if (e.code === "Space") {
        // 避免在输入框/编辑态吞掉空格
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        spaceDownRef.current = true;
        setSpaceDown(true);
      } else if (e.key === "Escape") {
        // Esc：先退出线性编辑态，再重置视口。
        if (editingLinearId) {
          setEditingLinearId(null);
        } else {
          setPan({ x: 0, y: 0 });
          setZoom(1);
        }
      } else if (e.key === "0") {
        setPan({ x: 0, y: 0 });
        setZoom(1);
      } else if (e.key === "1") {
        // 1：缩放以适应所有内容（对标 Excalidraw zoomToFit）
        zoomToFit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [zoomToFit, editingLinearId, shortcutHelpOpen, exportDialogOpen, confirmDialog]);

  // 滚轮：Ctrl/⌘+滚轮 或触控板 pinch（ctrlKey）→ 以鼠标位置为锚点缩放；
  // 普通滚轮 → 平移画布视口（对标 Excalidraw：滚轮平移、Ctrl 缩放）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * viewSize.w;
      const sy = ((e.clientY - rect.top) / rect.height) * viewSize.h;
      if (e.ctrlKey) {
        // 缩放（鼠标位置为锚点）
        setZoom((z) => {
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          const next = clamp(z * factor, 0.1, 8);
          setPan((p) => ({
            x: sx - (sx - p.x) * (next / z),
            y: sy - (sy - p.y) * (next / z),
          }));
          return next;
        });
      } else if (e.shiftKey) {
        // Shift+滚轮：左右平移（垂直滚动量转横向）。
        setPan((p) => ({ x: p.x - e.deltaY, y: p.y }));
      } else {
        // 平移：滚轮向下→画布向下移动（对齐用户预期方向）。
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [viewSize.w, viewSize.h]);

  // 启动恢复：优先用 IDB 持久化的场景历史（含撤销栈）水合工作现场；无历史则回落到文件句柄自动打开。
  // 等 viewSize 测得后再恢复。IDB 历史优先 = 刷新/HMR 后保留上次工作现场与撤销历史。
  const bootRestoreTriedRef = useRef(false);
  useEffect(() => {
    if (bootRestoreTriedRef.current) return;
    if (viewSize.w === 0 || viewSize.h === 0) return;
    bootRestoreTriedRef.current = true;
    let cancelled = false;
    (async () => {
      // 1) 优先 IDB 历史快照（含 undo/redo 栈）。
      try {
        const hist = await loadSceneHistory();
        if (cancelled) return;
        if (hist && (hist.strokes.length || hist.groups.length || hist.undoStack.length)) {
          applyingRemoteRef.current = true;
          setStrokes(cloneStrokes(hist.strokes));
          setGroups(cloneGroups(hist.groups));
          setUndoStack(hist.undoStack);
          setRedoStack(hist.redoStack);
          requestAnimationFrame(() => {
            applyingRemoteRef.current = false;
          });
          // 仍恢复文件句柄用于"保存至当前文件"（不加载文件内容，避免覆盖现场）。
          const stored = await loadFileHandle();
          if (cancelled) return;
          if (stored) {
            if (await verifyReadPermission(stored.handle)) {
              setColoraFileHandle(stored.handle);
              setColoraFileName(stored.name);
            }
          }
          return;
        }
      } catch {
        /* ignore */
      }
      // 2) 无 IDB 历史：回落到文件句柄自动打开（原行为）。
      const stored = await loadFileHandle();
      if (!stored || cancelled) return;
      try {
        if (!(await verifyReadPermission(stored.handle))) return;
        const file = await stored.handle.getFile();
        const text = await file.text();
        if (cancelled) return;
        await loadColora(text, stored.handle, stored.name);
      } catch {
        void clearFileHandle().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSize.w, viewSize.h]);

  // 测量容器尺寸 → 动态坐标系
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 首次测得画布尺寸后，把演示笔画从 1120×720 一次性缩放入场。
  // 若启动恢复成功，loadColora 会用 commitGroups 覆盖 demo（可撤销回退）。
  useEffect(() => {
    if (scaledRef.current) return;
    if (viewSize.w === 0 || viewSize.h === 0) return;
    scaledRef.current = true;
    setStrokes((current) =>
      current.map((s) => ({
        ...s,
        points: s.points.map((p) => ({
          x: (p.x / INITIAL_W) * viewSize.w,
          y: (p.y / INITIAL_H) * viewSize.h,
        })),
      })),
    );
  }, [viewSize]);

  const commitStrokes = useCallback(
    (next: Stroke[]) => {
      setUndoStack((stack) => [
        ...stack,
        { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
      ]);
      setRedoStack([]);
      setStrokes(next);
    },
    [groups, strokes],
  );
  const commitGroups = useCallback(
    (nextStrokes: Stroke[], nextGroups: StrokeGroup[]) => {
      setUndoStack((stack) => [
        ...stack,
        { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
      ]);
      setRedoStack([]);
      setStrokes(nextStrokes);
      setGroups(nextGroups);
    },
    [groups, strokes],
  );
  const canvasPoint = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // 屏幕坐标（容器像素）→ 画布坐标：canvas = (screen - pan) / zoom
      const sx = ((event.clientX - rect.left) / rect.width) * viewSize.w;
      const sy = ((event.clientY - rect.top) / rect.height) * viewSize.h;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, viewSize, zoom],
  );

  // 渲染
  useEffect(() => {
    const canvas = canvasRef.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (viewSize.w === 0 || viewSize.h === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = viewSize.w * ratio;
    canvas.height = viewSize.h * ratio;
    // 先以单位 transform 清全屏物理像素，再设视口 transform，避免 pan/zoom 后画布外围残留上一帧。
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 视口 transform：画布坐标 → 屏幕（物理像素）：screen = canvas * zoom * ratio + pan * ratio
    ctx.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * pan.x, ratio * pan.y);
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    off.width = viewSize.w * ratio;
    off.height = viewSize.h * ratio;
    off
      .getContext("2d")
      ?.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * pan.x, ratio * pan.y);
    renderScene({
      ctx,
      size: viewSize,
      strokes,
      groups,
      selectedIds,
      overlapMode,
      draft,
      offscreen: off,
      bgLayout,
      bgColor,
      selectionAsGroup: !!selectedGroup,
      skipTextId: textInput?.editingId ?? null,
      pan,
      zoom,
      draftStyle: draft
        ? {
            color: mode === "brush" ? "#7C3AED" : mode === "line" ? "#0EA5E9" : "#F97316",
            width: brushWidth,
            brushType: mode === "brush" ? brushType : undefined,
            id: "draft",
            // 新建元素默认渐变 paint（DEFAULT_STOPS）：画的过程即按渐变实时预览，不等到落笔。
            stops: DEFAULT_STOPS,
            space: "rgb" as const,
          }
        : undefined,
      hideSelectionBox:
        dragRef.current?.type === "pointDrag" ||
        (editingLinearId !== null && selectedStrokes[0]?.id === editingLinearId),
    });
    // 箭头绘制时的端点吸附锚点高亮（画布坐标，视口 transform 下画圆点）。
    const arrowSnap = arrowDraftSnapRef.current;
    if (arrowSnap.start || arrowSnap.end) {
      ctx.save();
      ctx.fillStyle = "rgba(99,102,241,0.9)";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1 / zoom;
      const draw = (p: { point: { x: number; y: number } }) => {
        ctx.beginPath();
        ctx.arc(p.point.x, p.point.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };
      if (arrowSnap.start) draw(arrowSnap.start);
      if (arrowSnap.end) draw(arrowSnap.end);
      ctx.restore();
    }
    // 选中已绑定箭头时，在目标元素锚点画小圆点（可视化绑定关系）。
    if (
      selectedStroke?.bindings &&
      (selectedStroke.kind === "line" || selectedStroke.shape === "arrow")
    ) {
      const b = selectedStroke.bindings;
      const targets: { strokeId: string; anchor: BindingAnchor }[] = [];
      if (b.start) targets.push(b.start);
      if (b.end) targets.push(b.end);
      ctx.save();
      ctx.fillStyle = "rgba(34,197,94,0.95)";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1 / zoom;
      for (const t of targets) {
        const target = strokes.find((s) => s.id === t.strokeId);
        if (!target) continue;
        const ap = anchorPointLocal(target, t.anchor);
        // 目标旋转：局部锚点转世界。
        const a = target.angle ?? 0;
        let wp = ap;
        if (a) {
          const tb = renderBounds(target);
          const c = { x: (tb.minX + tb.maxX) / 2, y: (tb.minY + tb.maxY) / 2 };
          const cos = Math.cos(a),
            sin = Math.sin(a);
          const dx = ap.x - c.x,
            dy = ap.y - c.y;
          wp = { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
        }
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    // 画板预设框（画布坐标，视口 transform 下画虚线）。
    if (presetFrame) {
      ctx.save();
      ctx.strokeStyle = "rgba(99,102,241,0.7)";
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.strokeRect(presetFrame.x, presetFrame.y, presetFrame.w, presetFrame.h);
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (selectionBox) {
      const left = Math.min(selectionBox.start.x, selectionBox.end.x),
        top = Math.min(selectionBox.start.y, selectionBox.end.y);
      const w = Math.abs(selectionBox.end.x - selectionBox.start.x),
        h = Math.abs(selectionBox.end.y - selectionBox.start.y);
      ctx.save();
      ctx.fillStyle = "rgba(59, 130, 246, 0.10)";
      ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
      ctx.setLineDash([8, 6]);
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.restore();
    }
    // 吸附辅助线：屏幕空间全视口虚线（move 时由 guidesRef 写入）。
    const guides = guidesRef.current;
    if (guides.length) {
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // 屏幕空间，不受视口 transform
      ctx.strokeStyle = "rgba(204,120,90,0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const g of guides) {
        const screen = g.axis === "x" ? g.pos * zoom + pan.x : g.pos * zoom + pan.y;
        ctx.beginPath();
        if (g.axis === "x") {
          ctx.moveTo(screen, 0);
          ctx.lineTo(screen, viewSize.h);
        } else {
          ctx.moveTo(0, screen);
          ctx.lineTo(viewSize.w, screen);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
    // pan 用 pan.x/pan.y 依赖（比 pan 整体引用更精确）；renderScene 接收整体 pan 仅用于背景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bgColor,
    bgLayout,
    brushWidth,
    canvasPreset,
    draft,
    editingLinearId,
    groups,
    imageVersion,
    mode,
    overlapMode,
    pan.x,
    pan.y,
    selectedGroup,
    selectedIds,
    selectionBox,
    strokes,
    textInput,
    viewSize,
    zoom,
  ]);

  const addStroke = useCallback(
    (stroke: Stroke) => {
      commitStrokes([...strokes, stroke]);
      setSelectedIds([stroke.id]);
    },
    [commitStrokes, strokes],
  );
  // 提交文本输入浮层：用 DOM value（不受 state 时序影响），创建文本笔画并按锁定状态切工具。
  // 用 textCommittedRef 防止 onBlur 与 onPointerDown 双重提交同一份文本。
  const textCommittedRef = useRef(false);
  // 双击文本进入编辑时记录原 stroke id；提交时更新该 stroke 而非新建。
  const editingTextIdRef = useRef<string | null>(null);
  const commitText = (value: string, cx: number, cy: number) => {
    if (textCommittedRef.current) return;
    textCommittedRef.current = true;
    const v = value.trim();
    const editingId = editingTextIdRef.current;
    const containerId = textInput?.containerId;
    if (v) {
      if (editingId) {
        // 编辑现有文本：只更新 text，保留字体/字号/颜色/容器绑定。
        commitStrokes(strokes.map((s) => (s.id === editingId ? { ...s, text: v } : s)));
      } else if (containerId) {
        // 新建容器绑定文本：points=容器左上角(cx,cy)，w/h=容器尺寸，回写容器 boundTextId。
        const textId = createId("stroke");
        commitGroups(
          [
            ...strokes.map((s) => (s.id === containerId ? { ...s, boundTextId: textId } : s)),
            {
              id: textId,
              name: `文本 ${strokes.length + 1}`,
              kind: "text" as const,
              points: [{ x: cx, y: cy }],
              width: 1,
              paint: {
                mode: "solid" as const,
                solid: isDark ? "#0f172a" : "#fafafa",
                stops: cloneStops(DEFAULT_STOPS),
                space: "rgb" as const,
              },
              text: v,
              fontSize: brushFontSize,
              fontFamily: brushFontFamily,
              containerId,
              w: textInput?.containerW,
              h: textInput?.containerH,
            },
          ],
          groups,
        );
      } else {
        addStroke({
          id: createId("stroke"),
          name: `文本 ${strokes.length + 1}`,
          kind: "text",
          points: [{ x: cx, y: cy }],
          width: 1,
          paint: {
            mode: "solid",
            solid: isDark ? "#fafafa" : "#0f172a",
            stops: cloneStops(DEFAULT_STOPS),
            space: "rgb",
          },
          text: v,
          fontSize: brushFontSize,
          fontFamily: brushFontFamily,
        });
      }
    }
    // 提交即退出文本模式（无论文本是否为空、是否新建），对标 Excalidraw：点别处即结束输入。
    // 否则空文本提交后 mode 停在 text，画布外光标仍是文本光标。
    if (!lockedTool) setMode("select");
    editingTextIdRef.current = null;
    setTextInput(null);
  };
  // 对标 Excalidraw hitElement：从顶层往下找第一个命中。
  // 统一本体命中：无论是否已选中，只有点中线条本体（线宽半宽内）才算命中。
  // 与 hover 光标判定一致——光标是四向箭头才可能选中，普通箭头点空白不选中。
  const hitTopStroke = useCallback(
    (point: Point) => {
      for (let index = strokes.length - 1; index >= 0; index--)
        if (hitStroke(strokes[index], point)) return strokes[index];
      return undefined;
    },
    [strokes],
  );

  // 形状 Mode → ShapeType（落笔时用）。椭圆复用 circle，矩形用 rect。
  const shapeOfMode = (m: Mode): ShapeType | undefined => {
    if (m === "rectangle") return "rect";
    if (m === "diamond") return "diamond";
    if (m === "ellipse") return "circle";
    if (m === "arrow") return "arrow";
    return undefined;
  };
  const isShapeMode = (m: Mode) => shapeOfMode(m) !== undefined;

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    // 右键：交给 ContextMenu，不启动任何画布交互。
    if (event.button === 2) return;
    // text 模式只开输入浮层，不捕获指针（否则 textarea 无法获焦）。
    if (mode !== "text") event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    // 抓手工具或空格/中键 → 平移画布视口。
    if (mode === "hand" || spaceDownRef.current || event.button === 1) {
      const rect = event.currentTarget.getBoundingClientRect();
      const last = {
        x: ((event.clientX - rect.left) / rect.width) * viewSize.w,
        y: ((event.clientY - rect.top) / rect.height) * viewSize.h,
      };
      dragRef.current = { type: "pan", last };
      setPanning(true);
      return;
    }
    if (mode === "eraser") {
      // 橡皮：按下即删除命中的笔画（划过在 move 中继续）。
      const hit = hitTopStroke(point);
      if (hit) commitStrokes(strokes.filter((s) => s.id !== hit.id));
      dragRef.current = { type: "marquee", start: point }; // 占位，move 中按 eraser 处理
      return;
    }
    if (mode === "brush") {
      setDraft({ type: "brush", points: [point] });
      return;
    }
    if (mode === "text") {
      // 若正在输入文本，这次点击用于提交当前文本（对标 Excalidraw：点别处提交），
      // 不在点击位置开新浮层；未锁定时提交后切回选择工具。
      if (textInput) {
        const ta = textAreaRef.current;
        commitText(ta?.value ?? textInput.value, textInput.cx, textInput.cy);
        return;
      }
      // 否则在点击位置进入新文本创建，先清空当前选中。
      setSelectedIds([]);

      textCommittedRef.current = false;
      editingTextIdRef.current = null; // 新建文本，非编辑态
      const rect = event.currentTarget.getBoundingClientRect();
      setTextInput({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        cx: point.x,
        cy: point.y,
        value: "",
        editingId: null,
      });
      return;
    }
    if (mode === "line") {
      setDraft({ type: "line", start: point, end: point });
      return;
    }
    if (isShapeMode(mode)) {
      const shape = shapeOfMode(mode)!;
      // 箭头：按下时对起点做锚点吸附，记录用于落地绑定 + 高亮。
      if (shape === "arrow" && bindingEnabled) {
        const snap = findSnapAnchor(strokes, point, 12 / zoom);
        arrowDraftSnapRef.current = {
          start: snap ?? undefined,
          end: undefined,
        };
        const start = snap?.point ?? point;
        setDraft({ type: "shape", shape, start, end: start });
      } else {
        arrowDraftSnapRef.current = {};
        setDraft({ type: "shape", shape, start: point, end: point });
      }
      return;
    }
    const hit = hitTopStroke(point);
    if (hit) {
      if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id]);
      // 选中的线条变化时退出线性编辑态（编辑态仅对当前选中线条生效）。
      if (editingLinearId && editingLinearId !== hit.id) setEditingLinearId(null);
      dragRef.current = {
        type: "move",
        start: point,
        last: point,
        startStrokes: cloneStrokes(strokes),
        startGroups: cloneGroups(groups),
      };
      return;
    }
    // 未命中线条本体：若点落在已选中组合的联合大框内（含空白），则拖动整组，
    // 不清空选中、不启 marquee——所见即所点，大框内任意处都可拖动。
    if (selBounds && pointInBounds(point, selBounds)) {
      dragRef.current = {
        type: "move",
        start: point,
        last: point,
        startStrokes: cloneStrokes(strokes),
        startGroups: cloneGroups(groups),
      };
      return;
    }
    setSelectedIds([]);

    setEditingLinearId(null);
    setSelectionBox({ start: point, end: point });
    dragRef.current = { type: "marquee", start: point };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    // 平移视口：用屏幕坐标增量直接加到 pan（不经过 zoom）。
    if (dragRef.current?.type === "pan") {
      const rect = event.currentTarget.getBoundingClientRect();
      const sx = ((event.clientX - rect.left) / rect.width) * viewSize.w;
      const sy = ((event.clientY - rect.top) / rect.height) * viewSize.h;
      const dx = sx - dragRef.current.last.x,
        dy = sy - dragRef.current.last.y;
      dragRef.current.last = { x: sx, y: sy };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }
    if (draft?.type === "brush") {
      setDraft({ type: "brush", points: [...draft.points, point] });
      return;
    }
    if (draft?.type === "line" || draft?.type === "shape") {
      // 箭头：实时对终点做锚点吸附，更新 draft.end 与吸附信息。
      if (draft.type === "shape" && draft.shape === "arrow" && bindingEnabled) {
        const snap = findSnapAnchor(strokes, point, 12 / zoom);
        arrowDraftSnapRef.current = { ...arrowDraftSnapRef.current, end: snap ?? undefined };
        setDraft({ ...draft, end: snap?.point ?? point });
        return;
      }
      setDraft({ ...draft, end: point });
      return;
    }
    // 橡皮划过：持续删除命中的笔画。
    if (mode === "eraser" && dragRef.current?.type === "marquee") {
      const hit = hitTopStroke(point);
      if (hit) commitStrokes(strokes.filter((s) => s.id !== hit.id));
      return;
    }
    if (dragRef.current?.type === "move") {
      const drag = dragRef.current;
      // 用按下快照的选中联合 bounds + 累计位移算绝对目标 bounds，跑吸附（避免增量累积抖动）。
      const startSelected = drag.startStrokes.filter((s) => selectedIds.includes(s.id));
      const startUnion = unionWorldBounds(startSelected);
      const totalDx = point.x - drag.start.x;
      const totalDy = point.y - drag.start.y;
      let dx = totalDx;
      let dy = totalDy;
      guidesRef.current = [];
      if (startUnion && (startUnion.width || startUnion.height)) {
        const targetBounds = {
          minX: startUnion.minX + totalDx,
          minY: startUnion.minY + totalDy,
          maxX: startUnion.maxX + totalDx,
          maxY: startUnion.maxY + totalDy,
        };
        const snap = snapMove(
          targetBounds,
          drag.startStrokes,
          new Set(selectedIds),
          6 / zoom,
          gridSnap,
        );
        dx += snap.dx;
        dy += snap.dy;
        guidesRef.current = snap.guides;
      }
      // 本帧增量 = 修正后累计位移 - 上次累计位移（last 存的是上次 point）。
      const frameDx = dx - (drag.last.x - drag.start.x);
      const frameDy = dy - (drag.last.y - drag.start.y);
      drag.last = { x: drag.start.x + dx, y: drag.start.y + dy };
      const movedIds = new Set(selectedIds);
      setStrokes((current) => {
        const next = current.map((stroke) =>
          selectedIds.includes(stroke.id)
            ? {
                ...stroke,
                points: stroke.points.map((item) => ({ x: item.x + frameDx, y: item.y + frameDy })),
              }
            : stroke,
        );
        return rebindArrows(next, movedIds);
      });
    }
    if (dragRef.current?.type === "marquee")
      setSelectionBox({ start: dragRef.current.start, end: point });
    if (dragRef.current?.type === "resize") applyResizeMove(point);
    // 纯悬停（无拖动、无草稿、select 模式）：命中线条本体或在已选中组合大框内，
    // 均显示四向移动光标——大框内任意处可拖动整组。
    if (mode === "select" && !draft && !dragRef.current) {
      const hit = hitTopStroke(point);
      setHoveringStroke(Boolean(hit) || Boolean(selBounds && pointInBounds(point, selBounds)));
    }
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (dragRef.current?.type === "pan") {
      dragRef.current = null;
      setPanning(false);
      return;
    }
    if (draft?.type === "brush") {
      if (draft.points.length > 2)
        addStroke({
          id: createId("stroke"),
          name: `画笔 ${strokes.length + 1}`,
          kind: "brush",
          points: [...draft.points, point],
          width: brushWidth,
          paint: defaultPaint("#7C3AED"),
          roundness: brushRoundness,
          strokeStyle: brushStrokeStyle,
          ...(brushType !== "pen" ? { brushType } : {}),
        });
      setDraft(null);
      if (!lockedTool) setMode("select");
      return;
    }
    if (draft?.type === "line" || draft?.type === "shape") {
      if (distance(draft.start, point) > 8) {
        const isLine = draft.type === "line";
        const sh = isLine ? undefined : draft.shape;
        const label = isLine
          ? "直线"
          : sh === "rect"
            ? "矩形"
            : sh === "diamond"
              ? "菱形"
              : sh === "circle"
                ? "椭圆"
                : sh === "arrow"
                  ? "箭头"
                  : "形状";
        // 箭头：用绘制时记录的端点吸附信息（实时吸附已写入 arrowDraftSnapRef）。
        const isArrowShape = !isLine && sh === "arrow";
        let arrowPoints: Point[] | undefined;
        let arrowBindings: Stroke["bindings"] | undefined;
        if (isArrowShape && bindingEnabled) {
          const snapStart = arrowDraftSnapRef.current.start;
          const snapEnd = arrowDraftSnapRef.current.end;
          const start = snapStart?.point ?? draft.start;
          const end = snapEnd?.point ?? point;
          arrowPoints = [start, end];
          if (snapStart || snapEnd) {
            arrowBindings = {
              ...(snapStart
                ? { start: { strokeId: snapStart.strokeId, anchor: snapStart.anchor } }
                : {}),
              ...(snapEnd ? { end: { strokeId: snapEnd.strokeId, anchor: snapEnd.anchor } } : {}),
            };
          }
        }
        arrowDraftSnapRef.current = {};
        addStroke({
          id: createId("stroke"),
          name: `${label} ${strokes.length + 1}`,
          kind: isLine ? "line" : "shape",
          shape: sh,
          points:
            arrowPoints ??
            (isLine ? [draft.start, point] : makeShapePoints(sh!, draft.start, point)),
          width: brushWidth,
          paint: defaultPaint(isLine ? "#0EA5E9" : "#F97316"),
          // 仅线性元素（直线/箭头/波浪/曲线/螺旋）带边角；闭合形状不使用 roundness。
          ...(isLine || sh === "arrow" || sh === "wave" || sh === "curve" || sh === "spiral"
            ? { roundness: brushRoundness }
            : {}),
          strokeStyle: brushStrokeStyle,
          ...(arrowBindings ? { bindings: arrowBindings } : {}),
        });
      }
      setDraft(null);
      if (!lockedTool) setMode("select");
      return;
    }
    if (dragRef.current?.type === "marquee" && selectionBox) {
      const w = Math.abs(selectionBox.end.x - selectionBox.start.x),
        h = Math.abs(selectionBox.end.y - selectionBox.start.y);
      // 拖出面积才算框选；零/微移动视为点击空白 → 清空选中（不命中任何线条）
      if (w > 2 && h > 2) {
        setSelectedIds(
          strokes
            .filter((stroke) => boxIntersectsStroke(selectionBox, stroke))
            .map((stroke) => stroke.id),
        );
      } else {
        setSelectedIds([]);
      }
      setSelectionBox(null);
    }
    if (dragRef.current?.type === "move") {
      const drag = dragRef.current;
      const before = drag.startStrokes;
      if (JSON.stringify(before) !== JSON.stringify(strokes)) {
        setUndoStack((stack) => [
          ...stack,
          { strokes: before, groups: cloneGroups(drag.startGroups) },
        ]);
        setRedoStack([]);
      }
    }
    if (dragRef.current?.type === "resize") {
      applyResizeEnd();
    }
    guidesRef.current = [];
    dragRef.current = null;
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    // 双击空白处：切到文本工具并在该位置进入文本输入（对标 Excalidraw 双击空白创建文本）。
    // 命中线条本体、或点在已选中闭合形状内部时走下面的编辑逻辑，不触发新建文本。
    if (
      mode === "select" &&
      !hitTopStroke(point) &&
      !(selBounds && pointInBounds(point, selBounds))
    ) {
      setMode("text");
      setSelectedIds([]);

      textCommittedRef.current = false;
      editingTextIdRef.current = null;
      const rect = event.currentTarget.getBoundingClientRect();
      setTextInput({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        cx: point.x,
        cy: point.y,
        value: "",
        editingId: null,
      });
      return;
    }
    if (mode !== "select" || !selectedStroke || selectedGroup) return;
    // 闭合形状：点落在包围盒内即可（不必精确命中边线，便于从中间进入文本编辑）。
    // 线性/文本仍要求命中本体。
    const isClosedShapeKind = !isLinearStroke(selectedStroke) && selectedStroke.kind !== "text";
    if (isClosedShapeKind) {
      if (!pointInBounds(point, renderBounds(selectedStroke))) return;
    } else if (!hitStroke(selectedStroke, point)) return;
    // 文本双击：进入编辑（预填原文本，提交时更新而非新建）。
    if (selectedStroke.kind === "text") {
      // textarea 定位用文本锚点的屏幕坐标（画布坐标 → 容器像素）。
      const tp = selectedStroke.points[0];
      const sx = tp.x * zoom + pan.x;
      const sy = tp.y * zoom + pan.y;
      editingTextIdRef.current = selectedStroke.id;
      textCommittedRef.current = false;
      setTextInput({
        x: sx,
        y: sy,
        cx: tp.x,
        cy: tp.y,
        value: selectedStroke.text ?? "",
        editingId: selectedStroke.id,
      });
      return;
    }
    // 线性元素双击：进入/退出点编辑态（对标 Excalidraw），显示端点 + 中间点手柄。
    if (isLinearStroke(selectedStroke)) {
      setEditingLinearId((id) => (id === selectedStroke.id ? null : selectedStroke.id));
      return;
    }
    // 闭合形状双击：进入容器文本编辑（对标 Excalidraw）。若形状已绑定文本则编辑它，否则新建绑定文本。
    {
      const container = selectedStroke;
      const b = renderBounds(container);
      // 已绑定文本：取该文本 stroke 进入编辑。
      const existing = container.boundTextId
        ? strokes.find((s) => s.id === container.boundTextId)
        : undefined;
      const textStroke = existing ?? (container.kind === "shape" ? undefined : undefined);
      // 文本定位锚点 = 容器左上角；w/h = 容器尺寸。
      const tp = { x: b.minX, y: b.minY };
      const sx = tp.x * zoom + pan.x;
      const sy = tp.y * zoom + pan.y;
      editingTextIdRef.current = textStroke?.id ?? null;
      textCommittedRef.current = false;
      setTextInput({
        x: sx,
        y: sy,
        cx: tp.x,
        cy: tp.y,
        value: textStroke?.text ?? "",
        editingId: textStroke?.id ?? null,
        // 容器 id：提交时用——新建文本时设 containerId 并回写容器的 boundTextId。
        containerId: container.id,
        containerW: b.width,
        containerH: b.height,
      });
      return;
    }
  };

  const updateSelectedStroke = (updater: (stroke: Stroke) => Stroke) => {
    if (!selectedStroke) return;
    commitStrokes(
      strokes.map((stroke) => (stroke.id === selectedStroke.id ? updater(stroke) : stroke)),
    );
  };
  const updateSelectedStrokes = (updater: (stroke: Stroke) => Stroke) => {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    commitStrokes(strokes.map((stroke) => (ids.has(stroke.id) ? updater(stroke) : stroke)));
  };
  const updateSelectedGroup = (updater: (group: StrokeGroup) => StrokeGroup) => {
    if (!selectedGroup) return;
    commitGroups(
      strokes,
      groups.map((groupItem) =>
        groupItem.id === selectedGroup.id ? updater(groupItem) : groupItem,
      ),
    );
  };

  const flushStopDrag = useCallback(() => {
    stopDragRafRef.current = 0;
    const info = stopDragInfoRef.current;
    if (!info || !selectedStroke || selectedGroup) return;
    if (info.stopId === SOLID_MID_STOP_ID) {
      // 纯色中点手柄：拖动跟随指针（屏幕百分比），不改线条/颜色，松手不回弹。
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const left = ((info.x - rect.left) / rect.width) * 100;
      const top = ((info.y - rect.top) / rect.height) * 100;
      setSolidMidPos({ left, top });
      return;
    }
    const points = renderPoints(selectedStroke);
    const point = canvasPoint({ clientX: info.x, clientY: info.y });
    // 旋转态：指针逆旋转到 angle=0 局部坐标再求路径百分比。
    const pos = nearestPercentOnPath(points, toLocalPoint(selectedStroke, point));
    const stopId = info.stopId;
    setStrokes((current) =>
      current.map((stroke) =>
        stroke.id === selectedStroke.id
          ? {
              ...stroke,
              paint: {
                ...stroke.paint,
                stops: stroke.paint.stops.map((stop) =>
                  stop.id === stopId ? { ...stop, pos: Math.round(pos) } : stop,
                ),
              },
            }
          : stroke,
      ),
    );
  }, [canvasPoint, selectedGroup, selectedStroke]);
  const scheduleStopDrag = () => {
    if (stopDragRafRef.current) return;
    stopDragRafRef.current = requestAnimationFrame(flushStopDrag);
  };
  useEffect(
    () => () => {
      if (stopDragRafRef.current) cancelAnimationFrame(stopDragRafRef.current);
    },
    [],
  );

  const setStopPos = (stopId: string, pos: number) =>
    updateSelectedStroke((stroke) => ({
      ...stroke,
      paint: {
        ...stroke.paint,
        stops: stroke.paint.stops.map((stop) =>
          stop.id === stopId ? { ...stop, pos: clamp(Math.round(pos), 0, 100) } : stop,
        ),
      },
    }));
  const setSelectedPaintStop = (stopId: string, hex: string) =>
    updateSelectedStroke((stroke) => ({
      ...stroke,
      paint: {
        ...stroke.paint,
        stops: stroke.paint.stops.map((stop) => (stop.id === stopId ? { ...stop, hex } : stop)),
      },
    }));
  const removeStopFromSelected = (stopId: string) =>
    updateSelectedStroke((stroke) =>
      stroke.paint.stops.length <= 2
        ? stroke
        : {
            ...stroke,
            paint: {
              ...stroke.paint,
              stops: stroke.paint.stops.filter((stop) => stop.id !== stopId),
            },
          },
    );
  const setGroupStop = (stopId: string, hex: string) =>
    updateSelectedGroup((groupItem) => ({
      ...groupItem,
      stops: groupItem.stops.map((stop) => (stop.id === stopId ? { ...stop, hex } : stop)),
    }));
  const setGroupStopPos = (stopId: string, pos: number) =>
    updateSelectedGroup((groupItem) => ({
      ...groupItem,
      stops: groupItem.stops.map((stop) =>
        stop.id === stopId ? { ...stop, pos: clamp(Math.round(pos), 0, 100) } : stop,
      ),
    }));

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    commitGroups(
      strokes.filter((stroke) => !selectedIds.includes(stroke.id)),
      groups
        .map((groupItem) => ({
          ...groupItem,
          strokeIds: groupItem.strokeIds.filter((id) => !selectedIds.includes(id)),
        }))
        .filter((groupItem) => groupItem.strokeIds.length > 1),
    );
    setSelectedIds([]);
  }, [commitGroups, groups, selectedIds, strokes]);
  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const copies = selectedStrokes.map((stroke, index) => ({
      ...stroke,
      id: createId("stroke"),
      name: `${stroke.name} 副本`,
      groupId: undefined,
      points: stroke.points.map((point) => ({
        x: point.x + 28 + index * 8,
        y: point.y + 28 + index * 8,
      })),
      paint: clonePaint(stroke.paint),
    }));
    commitStrokes([...strokes, ...copies]);
    setSelectedIds(copies.map((copyItem) => copyItem.id));
  }, [commitStrokes, selectedIds.length, selectedStrokes, strokes]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      // 弹窗打开时不响应画布删除/复制，避免误操作。
      if (shortcutHelpOpen || exportDialogOpen || confirmDialog) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, duplicateSelected, shortcutHelpOpen, exportDialogOpen, confirmDialog]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((stack) => [
      ...stack,
      { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
    ]);
    setStrokes(cloneStrokes(previous.strokes));
    setGroups(cloneGroups(previous.groups));
    setUndoStack((stack) => stack.slice(0, -1));
    setSelectedIds([]);
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((stack) => [
      ...stack,
      { strokes: cloneStrokes(strokes), groups: cloneGroups(groups) },
    ]);
    setStrokes(cloneStrokes(next.strokes));
    setGroups(cloneGroups(next.groups));
    setRedoStack((stack) => stack.slice(0, -1));
    setSelectedIds([]);
  };
  const createGroup = () => {
    if (selectedIds.length < 2) return;
    const id = createId("group");
    commitGroups(
      strokes.map((stroke) =>
        selectedIds.includes(stroke.id) ? { ...stroke, groupId: id } : stroke,
      ),
      [
        ...groups,
        {
          id,
          name: `组合 ${groups.length + 1}`,
          strokeIds: [...selectedIds],
          stops: cloneStops(DEFAULT_STOPS),
          space: "rgb",
        },
      ],
    );
    toast.success("已创建组合渐变");
  };
  const ungroup = () => {
    if (!selectedGroup) return;
    commitGroups(
      strokes.map((stroke) =>
        stroke.groupId === selectedGroup.id ? { ...stroke, groupId: undefined } : stroke,
      ),
      groups.filter((groupItem) => groupItem.id !== selectedGroup.id),
    );
  };
  const moveLayer = (direction: "front" | "back") => {
    if (!selectedIds.length) return;
    const selected = strokes.filter((stroke) => selectedIds.includes(stroke.id));
    const rest = strokes.filter((stroke) => !selectedIds.includes(stroke.id));
    commitStrokes(direction === "front" ? [...rest, ...selected] : [...selected, ...rest]);
  };
  // 对齐/分布/翻转：作用于 selectedStrokes，经 commitStrokes 入 undo。
  const alignSelected = (mode: "left" | "center-h" | "right" | "top" | "middle-v" | "bottom") => {
    if (selectedStrokes.length < 2) return;
    commitStrokes(alignStrokes(strokes, selectedStrokes, mode));
  };
  const distributeSelected = (mode: "horizontal" | "vertical") => {
    if (selectedStrokes.length < 3) return;
    commitStrokes(distributeStrokes(strokes, selectedStrokes, mode));
  };
  const flipSelected = (mode: "horizontal" | "vertical") => {
    if (!selectedStrokes.length) return;
    commitStrokes(flipStrokes(strokes, selectedStrokes, mode));
  };

  // 数值输入：单选时改 x/y/w/h/angle（世界坐标）。blur/Enter 提交，一步 undo。
  // x/y=平移 selBounds.minX/minY 到目标；w/h=缩放到目标尺寸（以左上角为锚）；
  // angle=设 stroke.angle。线性/形状缩放用 resizeTransform，image/容器文本设 w/h。
  const clearCanvas = () => {
    setConfirmDialog({
      title: "清空画布",
      description: "将清空所有线条与组合，可用撤销恢复。",
      action: () => {
        commitGroups([], []);
        setSelectedIds([]);
      },
    });
  };
  // 重置画布（对照 Excalidraw actionClearCanvas）：清空笔画与组合，
  // 背景与重叠模式恢复默认，保留当前 .colora 文件关联（fileHandle 不动）。可撤销。
  const resetCanvas = () => {
    setConfirmDialog({
      title: "重置画布",
      description: "将清空所有线条并恢复默认背景，可用撤销恢复。",
      action: () => {
        commitGroups([], []);
        setOverlapMode("mix");
        setBgLayout("grid");
        setBgColor(defaultCanvasBg(isDark));
        bgColorAutoRef.current = true;
        setSelectedIds([]);
      },
    });
  };
  const exportPng = (scale: number, withBackground = true) => {
    if (viewSize.w === 0) return;
    // 预设画板：导出裁剪到画板框（画布坐标 frame），否则用视口尺寸。
    const frame = presetFrame;
    const w = frame ? frame.w : viewSize.w;
    const h = frame ? frame.h : viewSize.h;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, frame ? -frame.x : 0, frame ? -frame.y : 0);
    const off = document.createElement("canvas");
    off.width = w * scale;
    off.height = h * scale;
    off
      .getContext("2d")
      ?.setTransform(scale, 0, 0, scale, frame ? -frame.x : 0, frame ? -frame.y : 0);
    renderScene({
      ctx,
      size: { w, h },
      strokes,
      groups,
      overlapMode,
      offscreen: off,
      bgLayout,
      bgColor,
      showBackground: withBackground,
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
    const link = document.createElement("a");
    link.download = `colora-canvas-${scale}x.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const selectedExportBounds = () => {
    const bounds = unionRenderBounds(selectedStrokes);
    if (!bounds) return undefined;
    const padding = Math.max(
      16,
      Math.max(...selectedStrokes.map((stroke) => stroke.width)) / 2 + 12,
    );
    const minX = clamp(Math.floor(bounds.minX - padding), 0, viewSize.w);
    const minY = clamp(Math.floor(bounds.minY - padding), 0, viewSize.h);
    const maxX = clamp(Math.ceil(bounds.maxX + padding), 0, viewSize.w);
    const maxY = clamp(Math.ceil(bounds.maxY + padding), 0, viewSize.h);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  };
  const selectedScene = () => {
    const ids = new Set(selectedIds);
    const selected = strokes.filter((stroke) => ids.has(stroke.id));
    const selectedStrokeIds = new Set(selected.map((stroke) => stroke.id));
    const selectedGroups = groups
      .map((groupItem) => ({
        ...groupItem,
        strokeIds: groupItem.strokeIds.filter((id) => selectedStrokeIds.has(id)),
      }))
      .filter((groupItem) => groupItem.strokeIds.length > 1);
    return { selected, selectedGroups };
  };
  const exportSelectedPng = (includeBackground: boolean) => {
    const bounds = selectedExportBounds();
    if (!bounds) return;
    const { selected, selectedGroups } = selectedScene();
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(-bounds.minX, -bounds.minY);
    const off = document.createElement("canvas");
    off.width = viewSize.w;
    off.height = viewSize.h;
    renderScene({
      ctx,
      size: viewSize,
      strokes: selected,
      groups: selectedGroups,
      overlapMode,
      offscreen: off,
      bgLayout,
      bgColor,
      showBackground: includeBackground,
      showSelection: false,
    });
    const link = document.createElement("a");
    link.download = includeBackground ? "colora-selection-bg.png" : "colora-selection.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const selectedSvgCode = (includeBackground: boolean) => {
    const bounds = selectedExportBounds();
    if (!bounds) return "";
    const { selected, selectedGroups } = selectedScene();
    const shifted = selected.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({
        x: point.x - bounds.minX,
        y: point.y - bounds.minY,
      })),
    }));
    return createSvg(
      { w: bounds.width, h: bounds.height },
      shifted,
      selectedGroups,
      overlapMode,
      bgLayout,
      bgColor,
      includeBackground,
    );
  };
  const exportSelectedSvg = (includeBackground: boolean) => {
    const code = selectedSvgCode(includeBackground);
    if (!code) return;
    downloadText(
      includeBackground ? "colora-selection-bg.svg" : "colora-selection.svg",
      code,
      "image/svg+xml",
    );
  };
  const jsonCode = useMemo(
    () =>
      JSON.stringify(
        {
          type: "canvas",
          version: 2,
          size: viewSize,
          overlapMode,
          background: { layout: bgLayout, color: bgColor },
          strokes,
          groups,
        },
        null,
        2,
      ),
    [bgColor, bgLayout, groups, overlapMode, strokes, viewSize],
  );
  // 保存到当前已打开的文件（覆写）。仅当已有 fileHandle 时可用。
  const saveToActiveFile = async () => {
    if (viewSize.w === 0 || viewSize.h === 0) return;
    if (!coloraFileHandle) return;
    try {
      const data = {
        size: viewSize,
        overlapMode,
        background: { layout: bgLayout, color: bgColor },
        strokes,
        groups,
      };
      const { fileHandle } = await saveColoraFile(data, coloraFileName, coloraFileHandle);
      if (fileHandle) {
        setColoraFileHandle(fileHandle);
        const nextName = fileHandle.name.replace(/\.[^.]+$/, "");
        setColoraFileName(nextName);
        void saveFileHandle(fileHandle, nextName).catch(() => {});
      }
      toast.success(`已保存到 ${coloraFileName}.colora`);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      console.error(err);
      toast.error("保存失败");
    }
  };
  // 另存为新文件：总是弹出"保存到..."对话框选位置，存完后当前文件切换为该新文件。
  const saveFileToDisk = async () => {
    if (viewSize.w === 0 || viewSize.h === 0) return;
    try {
      const data = {
        size: viewSize,
        overlapMode,
        background: { layout: bgLayout, color: bgColor },
        strokes,
        groups,
      };
      const { fileHandle } = await saveColoraFile(data, coloraFileName, null);
      if (fileHandle) {
        setColoraFileHandle(fileHandle);
        const nextName = fileHandle.name.replace(/\.[^.]+$/, "");
        setColoraFileName(nextName);
        void saveFileHandle(fileHandle, nextName).catch(() => {});
        toast.success(`已另存为 ${nextName}.colora`);
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      console.error(err);
      toast.error("保存失败");
    }
  };
  // 从 .colora 文件载入画布。closeExisting=false 用于初次启动恢复（不先清场）。
  const loadColora = useCallback(
    async (text: string, handle: FileSystemFileHandle | null, name: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("文件损坏或不是有效的 .colora 文件");
        return;
      }
      const fallback = {
        size: viewSize.w ? viewSize : { w: INITIAL_W, h: INITIAL_H },
        overlapMode,
        background: { layout: bgLayout, color: bgColor },
        strokes,
        groups,
      };
      let restored;
      try {
        restored = restoreCanvas(
          parsed,
          viewSize.w ? viewSize : { w: INITIAL_W, h: INITIAL_H },
          fallback,
        );
      } catch {
        toast.error("文件格式无效");
        return;
      }
      commitGroups(restored.strokes, restored.groups);
      setOverlapMode(restored.overlapMode);
      setBgLayout(restored.background.layout);
      setBgColor(restored.background.color);
      bgColorAutoRef.current = false;
      setSelectedIds([]);
      if (handle) {
        setColoraFileHandle(handle);
        const nextName = name || handle.name.replace(/\.[^.]+$/, "");
        setColoraFileName(nextName);
        void saveFileHandle(handle, nextName).catch(() => {});
      } else if (name) {
        setColoraFileName(name);
      }
    },
    [bgColor, bgLayout, commitGroups, groups, overlapMode, strokes, viewSize],
  );
  const openLocal = async () => {
    try {
      const { text, handle, name } = await openColoraFile();
      await loadColora(text, handle, name);
      toast.success("已打开画布");
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      console.error(err);
      toast.error("打开失败");
    }
  };
  const copyText = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  };

  // 读图片文件 → data URL + 自然像素尺寸。SVG 用 text() 包成 data URL，其它位图用 readAsDataURL。
  // 大图（>5MB data URL）给 toast 警告，避免 .colora 文件膨胀。
  const readImageFile = (file: File): Promise<{ src: string; nw: number; nh: number } | null> =>
    new Promise((resolve) => {
      const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
      const done = (src: string) => {
        const probe = new Image();
        probe.onload = () => {
          const nw = probe.naturalWidth || 100;
          const nh = probe.naturalHeight || 100;
          resolve({ src, nw, nh });
        };
        probe.onerror = () => {
          toast.error("无法读取图片");
          resolve(null);
        };
        probe.src = src;
      };
      if (isSvg) {
        file
          .text()
          .then((text) => done(`data:image/svg+xml;utf8,${encodeURIComponent(text)}`))
          .catch(() => resolve(null));
      } else {
        const reader = new FileReader();
        reader.onload = () => done(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }
    });

  // 在画布坐标 (cx,cy) 插入图片；w/h 用自然尺寸（按 zoom 适配视口，最大不超过视口 60%）。
  // 落地后触发重绘（图片解码完成由 img.decode 异步回调 setStrokes 触发一次重渲）。
  const insertImageAt = useCallback(
    async (file: File, cx: number, cy: number) => {
      const meta = await readImageFile(file);
      if (!meta) return;
      // 初始尺寸：按自然尺寸，若过大则缩到视口 60%。
      let w = meta.nw;
      let h = meta.nh;
      const maxW = viewSize.w * 0.6;
      const maxH = viewSize.h * 0.6;
      if (w > maxW || h > maxH) {
        const k = Math.min(maxW / w, maxH / h);
        w = Math.round(w * k);
        h = Math.round(h * k);
      }
      // 左上角对齐到点击点。
      const x = cx - w / 2;
      const y = cy - h / 2;
      const id = createId("stroke");
      addStroke({
        id,
        name: `图片 ${strokes.length + 1}`,
        kind: "image",
        points: [{ x, y }],
        width: 0,
        paint: { mode: "solid", solid: "#000000", stops: [], space: "rgb" },
        src: meta.src,
        nw: meta.nw,
        nh: meta.nh,
        w,
        h,
      });
      // 图片解码完成后强制重绘（解码是异步的，首帧可能画占位框）。
      const probe = new Image();
      probe.onload = () => setStrokes((cur) => [...cur]);
      probe.src = meta.src;
    },
    [addStroke, strokes.length, viewSize.h, viewSize.w],
  );

  // 图片 file input 选中文件后：按 imageInsertTargetRef 的框插入（w/h=0 表示用自然尺寸在点居中）。
  const onImageInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file) return;
    const target = imageInsertTargetRef.current;
    imageInsertTargetRef.current = null;
    const meta = await readImageFile(file);
    if (!meta) return;
    let w: number;
    let h: number;
    let x: number;
    let y: number;
    if (target && target.w > 0 && target.h > 0) {
      // 拖拽框：按图片比例 contain 到框内，居中。
      const k = Math.min(target.w / meta.nw, target.h / meta.nh);
      w = Math.max(1, Math.round(meta.nw * k));
      h = Math.max(1, Math.round(meta.nh * k));
      x = target.x + (target.w - w) / 2;
      y = target.y + (target.h - h) / 2;
    } else {
      // 单击：用自然尺寸（同 insertImageAt 的尺寸适配），在点击点居中。
      w = meta.nw;
      h = meta.nh;
      const maxW = viewSize.w * 0.6;
      const maxH = viewSize.h * 0.6;
      if (w > maxW || h > maxH) {
        const k = Math.min(maxW / w, maxH / h);
        w = Math.round(w * k);
        h = Math.round(h * k);
      }
      x = (target?.x ?? viewSize.w / 2) - w / 2;
      y = (target?.y ?? viewSize.h / 2) - h / 2;
    }
    addStroke({
      id: createId("stroke"),
      name: `图片 ${strokes.length + 1}`,
      kind: "image",
      points: [{ x, y }],
      width: 0,
      paint: { mode: "solid", solid: "#000000", stops: [], space: "rgb" },
      src: meta.src,
      nw: meta.nw,
      nh: meta.nh,
      w,
      h,
    });
    const probe = new Image();
    probe.onload = () => setStrokes((cur) => [...cur]);
    probe.src = meta.src;
  };

  // 全局粘贴图片：在视口中心插入剪贴板里的图片。焦点在输入框/可编辑元素时跳过（交给其原生处理）。
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const t = event.target as HTMLElement | null;
      if (t && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      let file: File | null = null;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          file = item.getAsFile();
          if (file) break;
        }
      }
      if (!file) return;
      event.preventDefault();
      // 落点 = 视口中心（画布坐标）。
      const cx = (viewSize.w / 2 - pan.x) / zoom;
      const cy = (viewSize.h / 2 - pan.y) / zoom;
      void insertImageAt(file, cx, cy);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [insertImageAt, pan.x, pan.y, viewSize.h, viewSize.w, zoom]);

  // 多窗口同步：初始化 BroadcastChannel，监听其它 tab 的场景广播/hello。
  useEffect(() => {
    const ch = getChannel();
    channelRef.current = ch;
    if (!ch) return;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.origin === ORIGIN) return; // 忽略自己的回声
      if (msg.kind === "hello") {
        // 新 tab 上线：回应自己的当前快照让它追上。
        broadcastScene(ch, {
          strokes: strokesRef.current,
          groups,
          undoStack,
          redoStack,
        });
        return;
      }
      if (msg.kind === "scene") {
        // 直接应用远端快照（不走 commit，避免循环广播）。
        applyingRemoteRef.current = true;
        setStrokes(cloneStrokes(msg.snapshot.strokes as Stroke[]));
        setGroups(cloneGroups(msg.snapshot.groups as StrokeGroup[]));
        setUndoStack(msg.snapshot.undoStack as SceneSnapshot[]);
        setRedoStack(msg.snapshot.redoStack as SceneSnapshot[]);
        // 下一帧清除标志，让后续本地变更可正常广播。
        requestAnimationFrame(() => {
          applyingRemoteRef.current = false;
        });
      }
    };
    ch.addEventListener("message", onMessage);
    broadcastHello(ch); // 上线广播 hello，让现有 tab 回应
    return () => {
      ch.removeEventListener("message", onMessage);
      ch.close();
      channelRef.current = null;
    };
    // 仅在挂载时建通道；内部用 ref 读取最新状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 持久化 + 广播：监听场景与历史变化，debounced 写 IDB + 广播给其它 tab。
  // 收到远端快照时（applyingRemoteRef）跳过，避免循环。
  useEffect(() => {
    if (applyingRemoteRef.current) return;
    const id = window.setTimeout(() => {
      const snapshot = {
        strokes: cloneStrokes(strokes),
        groups: cloneGroups(groups),
        undoStack,
        redoStack,
      };
      void saveSceneHistory(snapshot);
      broadcastScene(channelRef.current, snapshot);
    }, 300);
    return () => window.clearTimeout(id);
  }, [strokes, groups, undoStack, redoStack]);

  // 图片解码完成回调：bump imageVersion 触发 render 重绘。
  useEffect(() => {
    setImageReadyCallback(() => setImageVersion((v) => v + 1));
    return () => setImageReadyCallback(null);
  }, []);

  // 完整快捷键：撤销/重做、全选、复制/粘贴、组合/取消、图层、方向键微移、工具单键、缩放、Zen。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t?.closest('input, textarea, select, [contenteditable="true"]');
      const mod = e.ctrlKey || e.metaKey;
      // 输入框内：只放行全局必要快捷键（undo/redo 仍交由原生）——这里一律跳过，交给字段自身。
      if (inField) return;
      // 速查面板快捷键（? 或 Shift+/）最先处理；弹窗打开时其余按键不落到画布。
      if (!mod && !e.altKey && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        setShortcutHelpOpen((v) => !v);
        return;
      }
      if (shortcutHelpOpen || exportDialogOpen || confirmDialog) return;
      // 撤销/重做。
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "z") ||
        (mod && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
        return;
      }
      // 全选。
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(strokes.map((s) => s.id));
        return;
      }
      // 复制/粘贴（内部剪贴板）。
      if (mod && e.key.toLowerCase() === "c") {
        if (selectedStrokes.length) {
          clipboardRef.current = cloneStrokes(selectedStrokes);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (clipboardRef.current.length) {
          e.preventDefault();
          const copies = clipboardRef.current.map((s, i) => ({
            ...s,
            id: createId("stroke"),
            name: `${s.name} 副本`,
            groupId: undefined,
            points: s.points.map((p) => ({ x: p.x + 28 + i * 8, y: p.y + 28 + i * 8 })),
            paint: clonePaint(s.paint),
            ...(s.bindings
              ? {
                  bindings: {
                    ...(s.bindings.start ? { start: { ...s.bindings.start } } : {}),
                    ...(s.bindings.end ? { end: { ...s.bindings.end } } : {}),
                  },
                }
              : {}),
          }));
          commitStrokes([...strokes, ...copies]);
          setSelectedIds(copies.map((c) => c.id));
        }
        return;
      }
      // 组合/取消。
      if (mod && !e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        createGroup();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        ungroup();
        return;
      }
      // 图层前后。
      if (mod && e.key === "]") {
        e.preventDefault();
        moveLayer("front");
        return;
      }
      if (mod && e.key === "[") {
        e.preventDefault();
        moveLayer("back");
        return;
      }
      // 方向键微移（Shift=10px），每次一步 undo。
      if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        selectedIds.length
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const ids = new Set(selectedIds);
        commitStrokes(
          rebindArrows(
            strokes.map((s) =>
              ids.has(s.id)
                ? { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
                : s,
            ),
            ids,
          ),
        );
        return;
      }
      // 缩放（Ctrl/Cmd + +/-/0）。
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (mod && e.key === "0") {
        // 与视口重置的 0 冲突——Ctrl+0 缩放 100%，裸 0 重置视口（已在监听 A）。
        e.preventDefault();
        zoomReset();
        return;
      }
      // Zen 切换（Alt+Z）。
      if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        toggleZen();
        return;
      }
      // 工具单键（无修饰键）。
      if (!mod && !e.altKey && !e.shiftKey) {
        const map: Record<string, Mode> = {
          v: "select",
          h: "hand",
          r: "rectangle",
          d: "diamond",
          o: "ellipse",
          a: "arrow",
          l: "line",
          p: "brush",
          t: "text",
          e: "eraser",
        };
        const m = map[e.key.toLowerCase()];
        if (m) {
          e.preventDefault();
          setMode(m);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    strokes,
    selectedIds,
    selectedStrokes,
    undo,
    redo,
    createGroup,
    ungroup,
    moveLayer,
    commitStrokes,
    toggleZen,
    zoomIn,
    zoomOut,
    zoomReset,
    shortcutHelpOpen,
    exportDialogOpen,
    confirmDialog,
  ]);

  const toolButtons: { id: Mode; label: string; icon: typeof MousePointer2 }[] = [
    { id: "hand", label: "抓手", icon: Hand },
    { id: "select", label: "选择", icon: MousePointer2 },
    { id: "rectangle", label: "矩形", icon: Square },
    { id: "diamond", label: "菱形", icon: Diamond },
    { id: "ellipse", label: "椭圆", icon: Circle },
    { id: "arrow", label: "箭头", icon: ArrowRight },
    { id: "line", label: "直线", icon: Slash },
    { id: "brush", label: "画笔", icon: Pencil },
    { id: "text", label: "文本", icon: Type },
    { id: "image", label: "图片", icon: ImageIcon },
    { id: "eraser", label: "橡皮", icon: Eraser },
  ];

  // 画布上的路径色标手柄（仅选中单笔画、非组、编辑态）。
  // 渐变元素：每个 stop 沿路径 pos 分布，可拖动改色标位置。
  // 纯色元素：编辑态也显示一个中点手柄，可拖动跟随指针、不改线条/颜色，松手不回弹。
  const stopHandles = useMemo(() => {
    if (!selectedStroke || selectedGroup) return [];
    if (viewSize.w === 0) return [];
    if (editingLinearId !== selectedStroke.id) return [];
    const points = renderPoints(selectedStroke);
    const total = totalLength(points);
    if (total <= 0) return [];
    const toPercent = (p: Point) => {
      const w = toWorldPoint(selectedStroke, p);
      return {
        left: ((w.x * zoom + pan.x) / viewSize.w) * 100,
        top: ((w.y * zoom + pan.y) / viewSize.h) * 100,
      };
    };
    if (selectedStroke.paint.mode === "gradient") {
      return selectedStroke.paint.stops.map((stop) => ({
        stop,
        ...toPercent(pointAtLength(points, percentToLength(stop.pos, total))),
      }));
    }
    // 纯色：一个中点手柄，颜色用 solid；拖动跟随指针（本地 solidMidPos）、不改线条。
    const base = toPercent(pointAtLength(points, percentToLength(50, total)));
    return [
      {
        stop: { id: SOLID_MID_STOP_ID, hex: selectedStroke.paint.solid, alpha: 100, pos: 50 },
        ...(solidMidPos ?? base),
      },
    ];
  }, [editingLinearId, pan.x, pan.y, selectedStroke, selectedGroup, solidMidPos, viewSize, zoom]);

  // 选中笔画的变换手柄（八向缩放）。框选/拖动草稿/编辑态中不显示。
  const resizeHandles = useMemo(() => {
    if (!selBounds || viewSize.w === 0 || viewSize.h === 0) return [];
    if (draft || selectionBox) return [];
    // 编辑态：包围框/resize 手柄隐藏，由色标手柄接管。
    if (selectedStrokes.length === 1 && editingLinearId === selectedStrokes[0].id) return [];
    // 拖点中（含中点变弯）：包围框/方形 resize 隐藏，由圆点手柄接管，避免拖动中闪现包围框。
    if (dragRef.current?.type === "pointDrag") return [];
    // 两点直线/箭头无外框 → 无 resize 手柄（仅端点+中点点手柄）；
    // 多点线/箭头有外框 + 方形 resize（与点手柄共存，对标 Excalidraw）。
    if (selectedStrokes.length === 1) {
      const s = selectedStrokes[0];
      if ((s.kind === "line" || s.shape === "arrow") && renderPoints(s).length <= 2) return [];
    }
    const cursors: Record<ResizeHandle, string> = {
      nw: "nwse-resize",
      n: "ns-resize",
      ne: "nesw-resize",
      e: "ew-resize",
      se: "nwse-resize",
      s: "ns-resize",
      sw: "nesw-resize",
      w: "ew-resize",
    };
    // 单元素：手柄位于 renderBounds 局部框角，旋转态经 toWorldPoint 转到世界（旋转矩形角）。
    // 多选：手柄位于 selectionBounds(AABB) 角，无旋转。
    const single = selectedStrokes.length === 1 ? selectedStrokes[0] : undefined;
    const isLinearMulti =
      single &&
      (single.kind === "line" || single.shape === "arrow") &&
      renderPoints(single).length > 2;
    const margin = 10; // 屏幕像素外移（线性多点角手柄，对标 Excalidraw）
    const cornerOffset: Record<string, { dx: number; dy: number }> = {
      nw: { dx: -margin, dy: -margin },
      ne: { dx: margin, dy: -margin },
      se: { dx: margin, dy: margin },
      sw: { dx: -margin, dy: margin },
    };
    // 单元素手柄基准 = 视觉选中框（renderBounds ± padding），与 render.ts 画的外框一致，
    // 否则手柄会落在视觉框内侧。多选用 selBounds（selectionBounds，无 padding，与多选框一致）。
    const singleBox = single
      ? (() => {
          const b = renderBounds(single);
          const pad =
            single.kind === "text"
              ? Math.max((single.fontSize ?? 28) * 0.12, 6)
              : single.kind === "image"
                ? 6
                : single.width / 2;
          return {
            minX: b.minX - pad,
            minY: b.minY - pad,
            maxX: b.maxX + pad,
            maxY: b.maxY + pad,
            width: b.width + pad * 2,
            height: b.height + pad * 2,
          };
        })()
      : selBounds;
    const toScreen = (p: Point) => ({
      left: ((p.x * zoom + pan.x) / viewSize.w) * 100,
      top: ((p.y * zoom + pan.y) / viewSize.h) * 100,
    });
    // 方形手柄中心相对包围框角/边的外移方向（屏幕空间）。
    // 对标 Excalidraw：仅线性多点元素把角手柄整体推到框外；普通形状/文本/多选
    // 手柄跨在框角上（中心=框角，一半在内一半在外），不外移。
    const handlesToList = (keys: ResizeHandle[]) =>
      keys.map((handle) => {
        const box = single ? singleBox : selBounds;
        const local = handlePoint(box, handle);
        // 线性多点角手柄：局部外移 margin（屏幕像素，除以 zoom 转局部，旋转态经 toWorldPoint）。
        const off =
          single && isLinearMulti ? (cornerOffset[handle] ?? { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
        const localOff = { x: local.x + off.dx / zoom, y: local.y + off.dy / zoom };
        const world = single ? toWorldPoint(single, localOff) : localOff;
        const screen = toScreen(world);
        return { handle, cursor: cursors[handle], ...screen };
      });
    if (isLinearMulti) {
      return handlesToList(["nw", "ne", "se", "sw"]);
    }
    return handlesToList(Object.keys(cursors) as ResizeHandle[]);
  }, [
    draft,
    editingLinearId,
    pan.x,
    pan.y,
    selBounds,
    selectionBox,
    selectedStrokes,
    viewSize,
    zoom,
  ]);

  // 旋转手柄：选中态在包围盒上方显示一个圆形手柄，拖动绕中心旋转（对标 Excalidraw）。
  // 单元素：局部顶边中点上方 gap，旋转态经 toWorldPoint 转世界。多选：AABB 顶边中点上方，不旋转。
  const rotationHandles = useMemo(() => {
    if (viewSize.w === 0 || viewSize.h === 0) return [];
    if (draft || selectionBox || !selectedStrokes.length) return [];
    if (editingLinearId && selectedStrokes.some((s) => s.id === editingLinearId)) return [];
    if (dragRef.current?.type === "pointDrag") return [];
    const gap = 16 / zoom + 2; // 屏幕约 16px + spacing，对标 Excalidraw ROTATION_RESIZE_HANDLE_GAP
    const toScreen = (p: Point) => ({
      left: ((p.x * zoom + pan.x) / viewSize.w) * 100,
      top: ((p.y * zoom + pan.y) / viewSize.h) * 100,
    });
    if (selectedStrokes.length === 1) {
      const s = selectedStrokes[0];
      const pts = renderPoints(s);
      // 两点线/箭头：旋转手柄在直线中点沿法向偏上（与 Excalidraw 一致——其倾斜由 angle 实现，
      // 手柄跟 angle 旋转，始终在直线中点法向；我们倾斜靠 points，故直接按直线方向算法向中点）。
      const isTwoPoint = (s.kind === "line" || s.shape === "arrow") && pts.length === 2;
      let handleLocal: Point;
      if (isTwoPoint) {
        const [a, b] = pts;
        const mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        // 法向（顺时针 90°）：(-dy/len, dx/len)，取 y 为负方向（向上）使手柄在直线上方。
        let nx = -dy / len,
          ny = dx / len;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        } // 保证法向朝上
        const pad = s.width / 2;
        handleLocal = { x: mx + nx * (pad + gap), y: my + ny * (pad + gap) };
      } else {
        const b = renderBounds(s);
        const pad =
          s.kind === "text"
            ? Math.max((s.fontSize ?? 28) * 0.12, 6)
            : s.kind === "image"
              ? 6
              : s.width / 2;
        const cx = (b.minX + b.maxX) / 2;
        handleLocal = { x: cx, y: b.minY - pad - gap };
      }
      return [toScreen(toWorldPoint(s, handleLocal))];
    }
    const sb = selectionBounds(selectedStrokes);
    if (!sb) return [];
    return [toScreen({ x: (sb.minX + sb.maxX) / 2, y: sb.minY - gap })];
  }, [draft, editingLinearId, pan.x, pan.y, selectionBox, selectedStrokes, viewSize, zoom]);

  // 线性元素点手柄：直线/箭头选中态显示端点/折点（拖改坐标）+ 各段中点（拖动插点变弯/续弯）。
  // 画笔（brush）不显示逐点手柄（点数多会满屏，选中态用包围框）；编辑态由色标手柄接管。
  // 拖动中点变弯后元素变多点：拖动期间只显示点圆（不显示中点、不切包围框），圆点跟随指针。
  const pointHandles = useMemo(() => {
    if (viewSize.w === 0 || viewSize.h === 0) return [];
    if (draft || selectionBox || selectedStrokes.length !== 1) return [];
    const stroke = selectedStrokes[0];
    if (!isLinearStroke(stroke)) return [];
    // 仅直线/箭头显示逐点手柄；画笔/波浪/曲线/螺旋用包围框。
    if (stroke.kind !== "line" && stroke.shape !== "arrow") return [];
    if (editingLinearId === stroke.id) return []; // 编辑态交给色标手柄
    const pts = renderPoints(stroke);
    const toPercent = (p: Point) => {
      const w = toWorldPoint(stroke, p);
      return {
        left: ((w.x * zoom + pan.x) / viewSize.w) * 100,
        top: ((w.y * zoom + pan.y) / viewSize.h) * 100,
      };
    };
    // 拖动点中：只显示当前所有点圆（含被拖的新折点），不显示中点，避免包围框闪现。
    const dragging =
      dragRef.current?.type === "pointDrag" && dragRef.current.strokeId === stroke.id;
    if (dragging) {
      return pts.map((p, i) => ({ kind: "point" as const, pointIndex: i, ...toPercent(p) }));
    }
    const endpoints = pts.map((p, i) => ({
      kind: "point" as const,
      pointIndex: i,
      ...toPercent(p),
    }));
    // 中点手柄（对标 Excalidraw getEditorMidPoints）：仅两点线选中态显示一个中点
    // 作为"变弯入口"；多点线选中态不显示中点（进编辑态由色标手柄接管，不再逐段插点）。
    if (pts.length !== 2) return endpoints;
    const mid = getMidPoints(pts)[0];
    return [...endpoints, { kind: "mid" as const, pointIndex: 0, ...toPercent(mid) }];
  }, [draft, editingLinearId, pan.x, pan.y, selectedStrokes, selectionBox, viewSize, zoom]);

  const onResizeHandlePointerDown = (event: React.PointerEvent, handle: ResizeHandle) => {
    if (!selBounds) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = canvasPoint(event);
    // box 用点的真实包围盒（无 padding），缩放以点的真实范围为基准，
    // 避免外框 padding 参与缩放导致"鼠标动一点、线条大幅变动"的杠杆放大。
    const box = unionRenderBounds(selectedStrokes) ?? { ...selBounds };
    // 单元素旋转态：存 originLocal（指针逆旋转到局部）+ center，供 applyResizeMove 在局部框算缩放。
    const singleRotated =
      selectedStrokes.length === 1 && selectedStrokes[0].angle ? selectedStrokes[0] : undefined;
    dragRef.current = {
      type: "resize",
      handle,
      origin,
      ...(singleRotated
        ? { originLocal: toLocalPoint(singleRotated, origin), center: strokeCenter(singleRotated) }
        : {}),
      box,
      startStrokes: cloneStrokes(selectedStrokes),
      startGroups: cloneGroups(groups),
    };
  };
  // 线性元素点手柄按下：端点/现有点拖动改该点坐标；中间点先在数组插入新点再拖动该新点。
  // 指针捕获与移动/结束交给 window 监听（对标 Excalidraw 在画布/文档层处理拖动），
  // 而非手柄 button 自身——否则插入点后 button 卸载会丢失 capture，拖动中断。
  const onPointHandlePointerDown = (
    event: React.PointerEvent,
    strokeId: string,
    pointIndex: number,
    kind: "point" | "mid",
  ) => {
    event.stopPropagation();
    const startStrokes = cloneStrokes(strokes);
    let idx = pointIndex;
    if (kind === "mid") {
      // 中间点：在 pointIndex+1 处插入当前指针位置作为新折点，然后拖动该新点。
      const point = canvasPoint(event);
      const s = startStrokes.find((x) => x.id === strokeId);
      if (s) {
        s.points.splice(pointIndex + 1, 0, { x: point.x, y: point.y });
        idx = pointIndex + 1;
      }
    }
    dragRef.current = {
      type: "pointDrag",
      strokeId,
      pointIndex: idx,
      startStrokes,
      startGroups: cloneGroups(groups),
    };
    // 在 window 上接管 move/up，手柄 button 中途卸载也不影响拖动。
    const onMove = (e: PointerEvent) =>
      applyPointDragMove(canvasPoint({ clientX: e.clientX, clientY: e.clientY }));
    const onUp = () => {
      applyPointDragEnd();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  // 把 resize 拖动逻辑抽出来，手柄 button（已 capture 指针）和 canvas 都可调用
  const applyResizeMove = useCallback(
    (point: Point) => {
      const drag = dragRef.current;
      if (drag?.type !== "resize") return;
      // 旋转态（单元素）：指针逆旋转到 angle=0 局部坐标，用 originLocal 在局部框算缩放。
      // points 缩放后仍是 angle=0 坐标，angle 不变，渲染时再绕新中心旋转。
      const isRotated =
        drag.originLocal && drag.center && selectedStrokes.length === 1 && selectedStrokes[0].angle;
      const localPoint = isRotated ? toLocalPoint(selectedStrokes[0], point) : point;
      const origin = drag.originLocal ?? drag.origin;
      const { mapPoint, sx, sy } = resizeTransform(drag.box, drag.handle, origin, localPoint);
      const ids = new Set(selectedIds);
      const snapshot = drag.startStrokes; // 始终从按下时的原始点快照映射，避免在已缩放点上重复应用导致指数累积
      // 文本 resize 缩放比：角点取两轴平均，单轴手柄取该轴。
      const handle = drag.handle;
      const isCorner = handle.length === 2; // nw/ne/se/sw
      const isVertical = handle === "n" || handle === "s";
      const isHorizontal = handle === "e" || handle === "w";
      const movedIds = new Set(selectedIds);
      setStrokes((current) => {
        const next = current.map((stroke) => {
          if (!ids.has(stroke.id)) return stroke;
          const original = snapshot.find((s) => s.id === stroke.id);
          if (!original) return stroke;
          // 文本笔画：按缩放比调 fontSize，定位点用 mapPoint 跟随。
          if (original.kind === "text") {
            const scale = isCorner
              ? (Math.abs(sx) + Math.abs(sy)) / 2 || 1
              : isVertical
                ? Math.abs(sy) || 1
                : isHorizontal
                  ? Math.abs(sx) || 1
                  : 1;
            const fs = Math.max(8, Math.round((original.fontSize ?? 28) * scale));
            return {
              ...stroke,
              fontSize: fs,
              points: original.points.map((p) => mapPoint(p)),
            };
          }
          // 图片笔画：单点左上角 + w/h，按手柄调整左上角与宽高（角/边手柄分别锁两轴/单轴）。
          // 旋转态下 localPoint 已是局部坐标，box 也是 angle=0 局部框（renderBounds），直接局部算。
          if (original.kind === "image") {
            const op = original.points[0] ?? { x: 0, y: 0 };
            const ow = original.w ?? original.nw ?? 0;
            const oh = original.h ?? original.nh ?? 0;
            // 固定锚 = 被拖手柄的对角（在 box 局部坐标）。box = 单 image 的 renderBounds。
            const opposite: Record<ResizeHandle, ResizeHandle> = {
              nw: "se",
              ne: "sw",
              se: "nw",
              sw: "ne",
              n: "s",
              s: "n",
              e: "w",
              w: "e",
            };
            const fixed = handlePoint(drag.box, opposite[handle]);
            const fx = fixed.x;
            const fy = fixed.y;
            let nx = op.x;
            let ny = op.y;
            let nw = ow;
            let nh = oh;
            // 右/下方向手柄：固定左/上边，改宽/高。
            if (handle === "e" || handle === "ne" || handle === "se")
              nw = Math.max(1, localPoint.x - fx);
            if (handle === "s" || handle === "sw" || handle === "se")
              nh = Math.max(1, localPoint.y - fy);
            // 左/上方向手柄：固定右/下边，改左上角坐标 + 宽/高。
            if (handle === "w" || handle === "nw" || handle === "sw") {
              nx = Math.min(localPoint.x, fx);
              nw = Math.max(1, fx - localPoint.x);
            }
            if (handle === "n" || handle === "ne" || handle === "nw") {
              ny = Math.min(localPoint.y, fy);
              nh = Math.max(1, fy - localPoint.y);
            }
            return { ...stroke, points: [{ x: nx, y: ny }], w: nw, h: nh };
          }
          return { ...stroke, points: original.points.map((p) => mapPoint(p)) };
        });
        const rebound = rebindArrows(next, movedIds);
        // 容器缩放后同步其绑定文本的 w/h（reflow），并入同一次提交。
        return rebound.map((s) => {
          if (s.kind !== "text" || !s.containerId) return s;
          const container = rebound.find((c) => c.id === s.containerId);
          if (!container) return s;
          const b = renderBounds(container);
          return b.width === (s.w ?? 0) && b.height === (s.h ?? 0)
            ? s
            : { ...s, w: b.width, h: b.height };
        });
      });
    },
    [selectedIds, selectedStrokes],
  );
  const applyResizeEnd = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.type !== "resize") return;
    const before = drag.startStrokes;
    if (JSON.stringify(before) !== JSON.stringify(strokes)) {
      setUndoStack((stack) => [
        ...stack,
        { strokes: before, groups: cloneGroups(drag.startGroups) },
      ]);
      setRedoStack([]);
    }
    dragRef.current = null;
  }, [strokes]);

  // 旋转手柄拖动：绕中心旋转选中元素。单元素仅改 angle；多选每个元素 points 绕全局中心旋转 + angle += delta。
  const applyRotationMove = useCallback(
    (point: Point, shift: boolean) => {
      const drag = dragRef.current;
      if (drag?.type !== "rotation") return;
      const cur = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
      let delta = cur - drag.startPointerAngle;
      if (shift) {
        const snap = Math.PI / 12; // 15°
        delta = Math.round(delta / snap) * snap;
      }
      const ids = new Set(selectedIds);
      const multi = selectedStrokes.length > 1;
      setStrokes((current) => {
        const next = current.map((stroke) => {
          if (!ids.has(stroke.id)) return stroke;
          const origAngle = drag.origAngles[stroke.id] ?? 0;
          if (!multi) return { ...stroke, angle: normalizeAngle(origAngle + delta) };
          // 多选：points 绕全局中心旋转 delta + angle += delta（整体绕中心旋转 δ，见 plan 多选正确性）。
          return {
            ...stroke,
            points: rotatePoints(stroke.points, drag.center, delta),
            angle: normalizeAngle(origAngle + delta),
          };
        });
        return rebindArrows(next, ids);
      });
    },
    [selectedIds, selectedStrokes.length],
  );
  const applyRotationEnd = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.type !== "rotation") return;
    const before = drag.startStrokes;
    if (JSON.stringify(before) !== JSON.stringify(strokesRef.current)) {
      setUndoStack((stack) => [
        ...stack,
        { strokes: before, groups: cloneGroups(drag.startGroups) },
      ]);
      setRedoStack([]);
    }
    dragRef.current = null;
  }, []);
  const onRotationHandlePointerDown = (event: React.PointerEvent) => {
    if (!selectedStrokes.length) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    let center: Point | null = null;
    if (selectedStrokes.length === 1) {
      center = strokeCenter(selectedStrokes[0]);
    } else {
      const sb = selectionBounds(selectedStrokes);
      if (sb) center = { x: (sb.minX + sb.maxX) / 2, y: (sb.minY + sb.maxY) / 2 };
    }
    if (!center) return;
    const p = canvasPoint(event);
    const startPointerAngle = Math.atan2(p.y - center.y, p.x - center.x);
    const origAngles = Object.fromEntries(selectedStrokes.map((s) => [s.id, s.angle ?? 0]));
    dragRef.current = {
      type: "rotation",
      startPointerAngle,
      origAngles,
      center,
      startStrokes: cloneStrokes(selectedStrokes),
      startGroups: cloneGroups(groups),
    };
    // window 监听接管 move/up（同 pointDrag，避免手柄卸载丢 capture）。
    setHandleDragging(true);
    const onMove = (e: PointerEvent) =>
      applyRotationMove(canvasPoint({ clientX: e.clientX, clientY: e.clientY }), e.shiftKey);
    const onUp = () => {
      applyRotationEnd();
      setHandleDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const applyPointDragMove = useCallback((point: Point) => {
    const drag = dragRef.current;
    if (drag?.type !== "pointDrag") return;
    const snapshot = drag.startStrokes;
    setStrokes((current) =>
      current.map((stroke) => {
        if (stroke.id !== drag.strokeId) return stroke;
        const original = snapshot.find((s) => s.id === stroke.id);
        if (!original) return stroke;
        // 旋转态：指针逆旋转到 angle=0 局部坐标再存入（points 始终是局部坐标）。
        const lp = toLocalPoint(stroke, point);
        const points = original.points.map((p, i) =>
          i === drag.pointIndex ? { x: lp.x, y: lp.y } : p,
        );
        // 拖箭头端点 → 解除该端绑定（端点已手动移开，不再跟随目标）。
        let bindings = original.bindings;
        if (bindings) {
          const isStart = drag.pointIndex === 0;
          const isEnd = drag.pointIndex === original.points.length - 1;
          const keepStart = !(isStart && bindings.start);
          const keepEnd = !(isEnd && bindings.end);
          const next: typeof bindings = {
            ...(keepStart && bindings.start ? { start: bindings.start } : {}),
            ...(keepEnd && bindings.end ? { end: bindings.end } : {}),
          };
          bindings = next.start || next.end ? next : undefined;
        }
        return bindings !== original.bindings
          ? { ...stroke, points, bindings }
          : { ...stroke, points };
      }),
    );
  }, []);
  const applyPointDragEnd = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.type !== "pointDrag") return;
    const before = drag.startStrokes;
    if (JSON.stringify(before) !== JSON.stringify(strokesRef.current)) {
      setUndoStack((stack) => [
        ...stack,
        { strokes: before, groups: cloneGroups(drag.startGroups) },
      ]);
      setRedoStack([]);
    }
    dragRef.current = null;
  }, []);

  const selectionPaint = selectedGroup
    ? {
        mode: "gradient" as PaintMode,
        solid: selectedStroke?.paint.solid ?? "#7C3AED",
        stops: selectedGroup.stops,
        space: selectedGroup.space,
      }
    : selectedStrokes[0]?.paint;
  const updateSelectionPaint = (updater: (paint: StrokePaint) => StrokePaint) => {
    if (selectedGroup) {
      updateSelectedGroup((groupItem) => {
        const next = updater({
          mode: "gradient",
          solid: selectedStroke?.paint.solid ?? "#7C3AED",
          stops: cloneStops(groupItem.stops),
          space: groupItem.space,
        });
        return { ...groupItem, stops: cloneStops(next.stops), space: next.space };
      });
      return;
    }
    updateSelectedStrokes((stroke) => ({ ...stroke, paint: updater(clonePaint(stroke.paint)) }));
  };
  const setSelectionStopPos = (stopId: string, pos: number) => {
    if (!selectionPaint) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop, i) =>
        i === index ? { ...stop, pos: clamp(Math.round(pos), 0, 100) } : stop,
      ),
    }));
  };
  const setSelectionStopHex = (stopId: string, hex: string) => {
    if (!selectionPaint) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop, i) => (i === index ? { ...stop, hex } : stop)),
    }));
  };
  const setSelectionStopAlpha = (stopId: string, alpha: number) => {
    if (!selectionPaint) return;
    const index = selectionPaint.stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop, i) =>
        i === index ? { ...stop, alpha: clamp(Math.round(alpha), 0, 100) } : stop,
      ),
    }));
  };
  // 复制色标：在 sorted 中该色标之后插入同色同 alpha 的新色标，pos 比原值 +1（夹到 100）
  const duplicateSelectionStop = (stopId: string) => {
    if (!selectionPaint) return;
    const sorted = [...selectionPaint.stops].sort((a, b) => a.pos - b.pos);
    const idx = sorted.findIndex((stop) => stop.id === stopId);
    if (idx < 0) return;
    const src = sorted[idx];
    const newStop: PathStop = {
      id: createStopId("stop"),
      hex: src.hex,
      alpha: src.alpha,
      pos: clamp(src.pos + 1, 0, 100),
    };
    updateSelectionPaint((paint) => ({ ...paint, stops: [...paint.stops, newStop] }));
  };
  const addSelectionStopAt = (pos: number) => {
    if (!selectionPaint) return "";
    const p = clamp(Math.round(pos), 0, 100);
    const id = createStopId("stop");
    const newStop = {
      id,
      hex: stopAtPercent(selectionPaint.stops, p, selectionPaint.space).hex,
      alpha: 100,
      pos: p,
    };
    updateSelectionPaint((paint) => ({ ...paint, stops: [...paint.stops, newStop] }));
    return id;
  };
  // 删除色标：保留至少 2 个色标
  const removeSelectionStop = (stopId: string) => {
    if (!selectionPaint) return;
    if (selectionPaint.stops.length <= 2) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.filter((stop) => stop.id !== stopId),
    }));
  };
  // 拖拽落点：把被拖色标按给定顺序插入 stops 数组，并将其 pos 设为自定义值（其余色标 pos 不变）。
  // 用完整顺序而非均匀重排，既支持任意自定义位置，又能在 pos=0/100 与相邻色标平手时通过数组顺序把被拖色标排到首位/末位。
  const dropSelectionStop = (draggedId: string, orderedIds: string[], pos: number) => {
    if (!selectionPaint) return;
    const byId = new Map(selectionPaint.stops.map((s) => [s.id, s]));
    const order = orderedIds.filter((id) => byId.has(id));
    selectionPaint.stops.forEach((s) => {
      if (!order.includes(s.id)) order.push(s.id);
    });
    const p = clamp(Math.round(pos), 0, 100);
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: order
        .map((id) => {
          const s = byId.get(id);
          if (!s) return null;
          return id === draggedId ? { ...s, pos: p } : s;
        })
        .filter(Boolean) as typeof paint.stops,
    }));
  };
  // 翻转色标顺序：把每个色标的位置镜像翻转（pos → 100 - pos），从而把颜色排列反过来
  const reverseSelectionStops = () => {
    if (!selectionPaint) return;
    updateSelectionPaint((paint) => ({
      ...paint,
      stops: paint.stops.map((stop) => ({ ...stop, pos: clamp(100 - stop.pos, 0, 100) })),
    }));
  };

  return (
    <section
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-white dark:bg-neutral-950"
      onDragOver={(event) => {
        if (event.dataTransfer?.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={async (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const isColora =
          file.name.toLowerCase().endsWith(".colora") ||
          file.type === "application/vnd.colora+json";
        const isImage = file.type.startsWith("image/");
        if (!isColora && !isImage) return;
        event.preventDefault();
        if (isImage && !isColora) {
          // 拖入图片：在落点用自然尺寸插入。
          const rect = event.currentTarget.getBoundingClientRect();
          const sx = ((event.clientX - rect.left) / rect.width) * viewSize.w;
          const sy = ((event.clientY - rect.top) / rect.height) * viewSize.h;
          const point = { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
          await insertImageAt(file, point.x, point.y);
          return;
        }
        try {
          const text = await file.text();
          await loadColora(text, null, file.name.replace(/\.[^.]+$/, ""));
          toast.success("已打开画布");
        } catch (err) {
          console.error(err);
          toast.error("打开失败");
        }
      }}
    >
      {/* 隐藏的图片文件选择 input（图片工具点击/拖框时触发） */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
        className="hidden"
        onChange={onImageInputChange}
      />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Colora 画布工作区"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => {
              setHoveringStroke(false);
            }}
            onDoubleClick={onDoubleClick}
            onContextMenu={(e) => {
              // 右键命中元素则选中（便于菜单操作作用于该元素）。
              const point = canvasPoint(e);
              const hit = hitTopStroke(point);
              if (hit && !selectedIds.includes(hit.id)) setSelectedIds([hit.id]);
            }}
            className={cn(
              "absolute inset-0 h-full w-full touch-none",
              panning
                ? "cursor-grabbing"
                : mode === "hand" || spaceDown
                  ? "cursor-grab"
                  : mode === "text"
                    ? "cursor-text"
                    : mode === "select"
                      ? hoveringStroke
                        ? "cursor-move"
                        : "cursor-default"
                      : "cursor-crosshair",
            )}
            style={mode === "eraser" ? { cursor: ERASER_CURSOR } : undefined}
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {selectedStrokes.length > 0 ? (
            <>
              <ContextMenuItem onSelect={duplicateSelected}>
                <Copy className="mr-2 size-4" /> 复制
                <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+D</span>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => moveLayer("front")}>
                <BringToFront className="mr-2 size-4" /> 上移一层
                <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+]</span>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => moveLayer("back")}>
                <SendToBack className="mr-2 size-4" /> 下移一层
                <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+[</span>
              </ContextMenuItem>
              {(selectedIds.length >= 2 || selectedGroup) && (
                <>
                  <ContextMenuSeparator />
                  {selectedIds.length >= 2 && (
                    <ContextMenuItem onSelect={createGroup}>
                      <Group className="mr-2 size-4" /> 组合
                      <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+G</span>
                    </ContextMenuItem>
                  )}
                  {selectedGroup && (
                    <ContextMenuItem onSelect={ungroup}>
                      <Ungroup className="mr-2 size-4" /> 取消组合
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        Ctrl+Shift+G
                      </span>
                    </ContextMenuItem>
                  )}
                </>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={deleteSelected}
                className="text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:text-red-400"
              >
                <Trash2 className="mr-2 size-4" /> 删除
                <span className="ml-auto text-[11px] opacity-70">Del</span>
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem onSelect={() => setSelectedIds(strokes.map((s) => s.id))}>
                <MousePointer2 className="mr-2 size-4" /> 全选
                <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+A</span>
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  setPan({ x: 0, y: 0 });
                  zoomReset();
                }}
              >
                <Maximize className="mr-2 size-4" /> 重置视图
              </ContextMenuItem>
              <ContextMenuItem onSelect={zoomToFit}>
                <Maximize className="mr-2 size-4" /> 适应内容
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={resetCanvas}>
                <Trash2 className="mr-2 size-4" /> 重置画布
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* 画布上的路径色标手柄 */}
      {stopHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 touch-none">
          {stopHandles.map(({ stop, left, top }) => (
            <button
              key={stop.id}
              type="button"
              aria-label={`色标 ${Math.round(stop.pos)}%`}
              className={cn(
                "pointer-events-auto absolute size-5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white shadow-[0_0_0_1px_var(--color-border),0_6px_18px_rgb(0_0_0/0.30)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                handleDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                backgroundColor: hexAlphaToCss(stop.hex, stop.alpha),
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                stopDragInfoRef.current = { stopId: stop.id, x: event.clientX, y: event.clientY };
                setHandleDragging(true);
                flushStopDrag();
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                stopDragInfoRef.current = { stopId: stop.id, x: event.clientX, y: event.clientY };
                scheduleStopDrag();
              }}
              onPointerUp={() => {
                stopDragInfoRef.current = null;
                setHandleDragging(false);
              }}
              onPointerCancel={() => {
                stopDragInfoRef.current = null;
                setHandleDragging(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  const step = event.shiftKey ? 5 : 1;
                  setStopPos(stop.id, stop.pos + (event.key === "ArrowLeft" ? -step : step));
                }
              }}
            />
          ))}
        </div>
      )}

      {/* 选中笔画变换手柄（八向缩放） */}
      {resizeHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 touch-none">
          {resizeHandles.map(({ handle, cursor, left, top }) => (
            <button
              key={handle}
              type="button"
              aria-label={`缩放手柄 ${handle}`}
              className="pointer-events-auto absolute size-2 -translate-x-1/2 -translate-y-1/2 touch-none rounded-[2px] border border-blue-500 bg-white shadow-[0_0_0_1px_rgb(255_255_255)] outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${left}%`, top: `${top}%`, cursor }}
              onPointerDown={(event) => onResizeHandlePointerDown(event, handle)}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                applyResizeMove(canvasPoint(event));
              }}
              onPointerUp={() => applyResizeEnd()}
              onPointerCancel={() => applyResizeEnd()}
            />
          ))}
        </div>
      )}

      {/* 旋转手柄：选中态顶部圆形，拖动绕中心旋转（对标 Excalidraw） */}
      {rotationHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 touch-none">
          {rotationHandles.map((h, i) => (
            <button
              key={`rot-${i}`}
              type="button"
              aria-label="旋转手柄"
              className={cn(
                "pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-blue-500 bg-white shadow-[0_0_0_1px_rgb(255_255_255)] outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
                handleDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              style={{ left: `${h.left}%`, top: `${h.top}%` }}
              onPointerDown={onRotationHandlePointerDown}
            />
          ))}
        </div>
      )}

      {/* 线性元素点手柄：两端点（拖改端点）+ 中点（拖动插点变弯），仅两点元素选中态 */}
      {pointHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 touch-none">
          {pointHandles.map((h, i) => (
            <button
              key={`${h.kind}-${h.pointIndex}-${i}`}
              type="button"
              aria-label={h.kind === "mid" ? "中点（拖动变弯）" : "端点"}
              className={
                h.kind === "mid"
                  ? "pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-blue-500 bg-white/80 outline-none transition-transform hover:scale-125"
                  : "pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-blue-500 bg-blue-500 shadow-[0_0_0_1px_rgb(255_255_255)] outline-none transition-transform hover:scale-125"
              }
              style={{ left: `${h.left}%`, top: `${h.top}%`, cursor: "move" }}
              onPointerDown={(event) =>
                onPointHandlePointerDown(event, selectedStrokes[0].id, h.pointIndex, h.kind)
              }
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                applyPointDragMove(canvasPoint(event));
              }}
              onPointerUp={() => applyPointDragEnd()}
              onPointerCancel={() => applyPointDragEnd()}
            />
          ))}
        </div>
      )}

      {/* 左上：属性面板触发按钮（打开/收起属性面板）。zen 时隐藏。
          用画布背景对比色作底，常态半透、hover 加深、展开时实心高亮，三态分明。 */}
      {!zenMode && (
        <Tip label={canvasOpen ? "收起画布面板" : "展开画布面板"}>
          <button
            type="button"
            onClick={() => setCanvasOpen((v) => !v)}
            aria-label="画布面板"
            aria-expanded={canvasOpen}
            className="colora-inspector-trigger pointer-events-auto absolute left-3 top-3 z-30 inline-flex size-9 items-center justify-center overflow-hidden rounded-md shadow-md transition-all hover:scale-105"
            style={
              {
                "--trigger-bg": bestTextOn(bgColor),
                "--trigger-fg": bgColor,
              } as React.CSSProperties
            }
          >
            <SlidersHorizontal className="size-4" strokeWidth={2.2} />
          </button>
        </Tip>
      )}

      {/* 元素面板（选中时自动打开）+ 画布面板（trigger 控制），左上一列堆叠，可同时出现。 */}
      {(elementOpen || canvasOpen) && !zenMode && (
        <div className="pointer-events-none absolute left-3 top-14 z-30 flex max-h-[calc(100dvh-5rem)] flex-col gap-3 overflow-y-auto pb-3">
          {/* 元素面板：仅 elementOpen 时显示。 */}
          {elementOpen && (
            <div
              className="colora-inspector-panel pointer-events-auto flex w-80 max-w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                <div className="text-xs font-semibold text-foreground">元素</div>
              </div>

              <div className="max-h-[min(70dvh,560px)] overflow-y-auto overflow-x-hidden p-3">
                <div className="space-y-3">
                  {/* 描边粗细。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">描边粗细</div>
                    <div className="flex rounded-xl bg-muted/60 p-1">
                      {STROKE_WIDTHS.map((w) => {
                        const active = selectedStrokes.some((s) => s.width === w.value);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            aria-pressed={active}
                            aria-label={w.label}
                            title={w.label}
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-lg px-2 py-2.5 transition-colors",
                              active
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => {
                              updateSelectedStrokes((stroke) => ({ ...stroke, width: w.value }));
                              setBrushWidth(w.value);
                            }}
                          >
                            {/* 粗细横线图标：宽度随档位变化。 */}
                            <span
                              className="block w-5 rounded-full bg-current"
                              style={{ height: w.value }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 边角：仅线性元素可切换。 */}
                  {selectedStrokes.some(isLinearStroke) && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-medium text-muted-foreground">边角</div>
                      <div className="flex rounded-xl bg-muted/60 p-1">
                        {(["sharp", "round"] as const).map((r) => {
                          const active = selectedStrokes.some(
                            (s) => isLinearStroke(s) && (s.roundness ?? "sharp") === r,
                          );
                          return (
                            <button
                              key={r}
                              type="button"
                              aria-pressed={active}
                              aria-label={r === "sharp" ? "方角" : "圆角"}
                              title={r === "sharp" ? "方角" : "圆角"}
                              className={cn(
                                "flex flex-1 items-center justify-center rounded-lg px-2 py-2.5 transition-colors",
                                active
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                              onClick={() => {
                                updateSelectedStrokes((stroke) =>
                                  isLinearStroke(stroke) ? { ...stroke, roundness: r } : stroke,
                                );
                                setBrushRoundness(r);
                              }}
                            >
                              {/* 边角折线图标：方角直角、圆角圆弧。 */}
                              <svg
                                viewBox="0 0 20 20"
                                className="size-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                {r === "sharp" ? (
                                  <path d="M5 15 V6 H15" />
                                ) : (
                                  <path d="M5 15 V11 Q5 6 10 6 H15" />
                                )}
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 边框样式：实线/虚线/点线。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">边框样式</div>
                    <div className="flex rounded-xl bg-muted/60 p-1">
                      {(["solid", "dashed", "dotted"] as const).map((st) => {
                        const active = selectedStrokes.some(
                          (s) => (s.strokeStyle ?? "solid") === st,
                        );
                        return (
                          <button
                            key={st}
                            type="button"
                            aria-pressed={active}
                            aria-label={st === "solid" ? "实线" : st === "dashed" ? "虚线" : "点线"}
                            title={st === "solid" ? "实线" : st === "dashed" ? "虚线" : "点线"}
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-lg px-2 py-2.5 transition-colors",
                              active
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => {
                              updateSelectedStrokes((stroke) => ({ ...stroke, strokeStyle: st }));
                              setBrushStrokeStyle(st);
                            }}
                          >
                            {/* 线型图标：实线/虚线/点线。 */}
                            <svg
                              viewBox="0 0 20 4"
                              className="h-1 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <line
                                x1="1"
                                y1="2"
                                x2="19"
                                y2="2"
                                strokeDasharray={
                                  st === "solid" ? undefined : st === "dashed" ? "4 3" : "0.5 3"
                                }
                              />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectionPaint && (
                    <ColorEditor
                      title={selectedGroup ? "组合渐变" : "颜色"}
                      subtitle={selectedGroup ? "统一色阶沿组内每条线条分布" : undefined}
                      paint={selectionPaint}
                      onStopPos={setSelectionStopPos}
                      onStopHex={setSelectionStopHex}
                      onStopAlpha={setSelectionStopAlpha}
                      onDuplicateStop={duplicateSelectionStop}
                      onDeleteStop={removeSelectionStop}
                      onDropStop={dropSelectionStop}
                      onCopyHex={(stopId) => {
                        const stop = selectionPaint.stops.find((s) => s.id === stopId);
                        if (stop) copyText(stop.hex.toUpperCase(), "已复制 hex 值");
                      }}
                      onAddStopAt={addSelectionStopAt}
                      onSetSpace={(space) => updateSelectionPaint((paint) => ({ ...paint, space }))}
                      onSetMode={(paintMode) =>
                        updateSelectionPaint((paint) => ({ ...paint, mode: paintMode }))
                      }
                      onSetSolid={(hex) =>
                        updateSelectionPaint((paint) => ({ ...paint, solid: hex }))
                      }
                      onReverse={reverseSelectionStops}
                      text={selectedStroke?.kind === "text" ? selectedStroke.text : undefined}
                    />
                  )}

                  {selectedGroup && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-medium text-muted-foreground">重叠处理</div>
                      <div className="flex rounded-xl bg-muted/60 p-1">
                        {(["mix", "cover"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={overlapMode === m}
                            disabled={!groupHasOverlap}
                            className={cn(
                              "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                              overlapMode === m
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => setOverlapMode(m)}
                          >
                            {m === "mix" ? "自动混色" : "前层覆盖"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 操作：组合/取消 + 图层上移/下移 + 复制 + 删除（纯图标行，对标 Excalidraw actions）。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">操作</div>
                    <div className="grid grid-cols-6 gap-1.5">
                      <Tip label="复制（Ctrl+D）">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-full"
                          onClick={duplicateSelected}
                          aria-label="复制"
                        >
                          <Copy className="size-4" />
                        </Button>
                      </Tip>
                      <Tip label="组合（Ctrl+G）">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-full"
                          onClick={createGroup}
                          disabled={selectedIds.length < 2}
                          aria-label="组合"
                        >
                          <Group className="size-4" />
                        </Button>
                      </Tip>
                      <Tip label="取消组合（Ctrl+Shift+G）">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-full"
                          onClick={ungroup}
                          disabled={!selectedGroup}
                          aria-label="取消组合"
                        >
                          <Ungroup className="size-4" />
                        </Button>
                      </Tip>
                      <Tip label="上移一层（Ctrl+]）">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-full"
                          onClick={() => moveLayer("front")}
                          aria-label="上移一层"
                        >
                          <BringToFront className="size-4" />
                        </Button>
                      </Tip>
                      <Tip label="下移一层（Ctrl+[）">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-full"
                          onClick={() => moveLayer("back")}
                          aria-label="下移一层"
                        >
                          <SendToBack className="size-4" />
                        </Button>
                      </Tip>
                      <Tip label="删除选中">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-full text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                          onClick={deleteSelected}
                          aria-label="删除选中"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </Tip>
                    </div>
                  </div>

                  {/* 导出选中：长选项 + 二级菜单选格式。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">导出选中</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-full justify-start gap-1.5 px-2 text-xs"
                        >
                          <Download className="size-3.5" />
                          <span className="flex-1 text-left">导出选中元素...</span>
                          <ChevronRight className="size-3.5 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        sideOffset={6}
                        className="w-44"
                      >
                        <DropdownMenuItem onSelect={() => exportSelectedPng(false)}>
                          透明 PNG
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => exportSelectedPng(true)}>
                          带背景 PNG
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => exportSelectedSvg(false)}>
                          透明 SVG
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => exportSelectedSvg(true)}>
                          带背景 SVG
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* 画布面板：仅 canvasOpen 时显示（trigger 控制，不随选中变化）。 */}
          {canvasOpen && (
            <div
              className="colora-inspector-panel pointer-events-auto flex w-80 max-w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                <div className="text-xs font-semibold text-foreground">画布</div>
              </div>
              <div className="max-h-[min(70dvh,560px)] overflow-y-auto overflow-x-hidden p-3">
                <div className="space-y-3">
                  {/* 文件。 */}
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-full justify-start gap-1.5 text-xs"
                      onClick={openLocal}
                    >
                      <FolderOpen className="size-3.5" /> 打开
                    </Button>
                    {coloraFileHandle && (
                      <Tip label={`保存到当前文件 ${coloraFileName}.colora`}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-full justify-start gap-1.5 text-xs"
                          onClick={saveToActiveFile}
                        >
                          <Save className="size-3.5" /> 保存至当前文件
                        </Button>
                      </Tip>
                    )}
                    <Tip label="另存为新文件">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full justify-start gap-1.5 text-xs"
                        onClick={saveFileToDisk}
                      >
                        <FileOutput className="size-3.5" /> 保存到...
                      </Button>
                    </Tip>
                    <Tip label="重置画布：清空线条并恢复默认背景">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full justify-start gap-1.5 text-xs"
                        onClick={resetCanvas}
                        aria-label="重置画布"
                      >
                        <Trash2 className="size-3.5" /> 重置画布
                      </Button>
                    </Tip>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-full justify-start gap-1.5 text-xs"
                      onClick={() => setExportDialogOpen(true)}
                    >
                      <Download className="size-3.5" /> 导出画布...
                    </Button>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      可把 .colora 文件直接拖入画布导入，跨设备打开继续编辑。
                    </p>
                  </div>

                  {/* 画布背景。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">画布背景</div>
                    <div className="flex rounded-xl bg-muted/60 p-1">
                      {CANVAS_LAYOUTS.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          aria-pressed={bgLayout === item.value}
                          className={cn(
                            "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                            bgLayout === item.value
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => setBgLayout(item.value)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 画板尺寸。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">画板尺寸</div>
                    <div className="flex rounded-xl bg-muted/60 p-1">
                      {CANVAS_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={canvasPreset === p.id}
                          className={cn(
                            "flex-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors",
                            canvasPreset === p.id
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => setCanvasPreset(p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 画布颜色。 */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">画布颜色</div>
                    <div className="grid grid-cols-9 gap-1.5">
                      {CANVAS_BG_PRESETS.map((item) => {
                        const active = bgColor.toUpperCase() === item.hex;
                        return (
                          <Tip key={item.hex} label={`${item.label} ${item.hex}`}>
                            <button
                              type="button"
                              aria-label={`${item.label} ${item.hex}`}
                              onClick={() => {
                                bgColorAutoRef.current = false;
                                setBgColor(item.hex);
                              }}
                              className={cn(
                                "h-7 w-full rounded-lg border transition-transform hover:scale-110",
                                active ? "border-foreground ring-2 ring-ring" : "border-border/60",
                              )}
                              style={{ backgroundColor: item.hex }}
                            />
                          </Tip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* 悬浮工具栏（对标 Excalidraw）：icon 按钮组 + 锁定 + 撤销/重做 */}
      <div
        className={cn(
          "absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-border/60 bg-background/80 p-1.5 shadow-lg backdrop-blur-md",
          zenMode && "hidden",
        )}
      >
        <Tip label={lockedTool ? "解锁工具" : "锁定工具（画完不切回选择）"}>
          <Button
            type="button"
            variant={lockedTool ? "default" : "ghost"}
            size="icon"
            className="size-8"
            onClick={() => setLockedTool((v) => !v)}
            aria-label="锁定工具"
            aria-pressed={lockedTool}
          >
            <Lock className="size-4" />
          </Button>
        </Tip>
        <div className="mx-0.5 h-5 w-px bg-border" />
        {toolButtons.map((item) => {
          const Icon = item.icon;
          return (
            <Tip key={item.id} label={item.label}>
              <Button
                type="button"
                variant={mode === item.id ? "default" : "ghost"}
                size="icon"
                className="size-8"
                onClick={() => {
                  // 图片：直接弹出文件选择，不进入画布交互模式。
                  if (item.id === "image") {
                    imageInsertTargetRef.current = null;
                    imageInputRef.current?.click();
                    return;
                  }
                  setMode(item.id);
                }}
                aria-label={item.label}
              >
                <Icon className="size-4" />
              </Button>
            </Tip>
          );
        })}
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Tip label="撤销">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={undo}
            disabled={!undoStack.length}
            aria-label="撤销"
          >
            <Undo2 className="size-4" />
          </Button>
        </Tip>
        <Tip label="重做">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={redo}
            disabled={!redoStack.length}
            aria-label="重做"
          >
            <Redo2 className="size-4" />
          </Button>
        </Tip>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Tip label={gridSnap ? "关闭网格吸附" : "开启网格吸附"}>
          <Button
            type="button"
            variant={gridSnap ? "default" : "ghost"}
            size="icon"
            className="size-8"
            onClick={() => setGridSnap((v) => !v)}
            aria-label="网格吸附"
            aria-pressed={gridSnap}
          >
            <Magnet className="size-4" />
          </Button>
        </Tip>
      </div>

      {/* 画笔工具：笔刷类型选择条（对标 Excalidraw 选中元素时的属性栏），工具栏下方常驻。 */}
      {mode === "brush" && !zenMode && (
        <div className="absolute left-1/2 top-14 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-border/60 bg-background/80 p-1 shadow-lg backdrop-blur-md">
          {BRUSH_TYPES.map((b) => (
            <Tip key={b.id} label={b.label}>
              <Button
                type="button"
                size="sm"
                variant={brushType === b.id ? "default" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setBrushType(b.id)}
                aria-pressed={brushType === b.id}
              >
                {b.label}
              </Button>
            </Tip>
          ))}
        </div>
      )}

      {/* 多选：对齐 / 分布 / 翻转条（工具栏下方悬浮，≥2 选中时显示）。 */}
      {selectedStrokes.length >= 2 && !zenMode && (
        <div className="absolute left-1/2 top-14 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-border/60 bg-background/80 p-1 shadow-lg backdrop-blur-md">
          <Tip label="左对齐">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => alignSelected("left")}
              aria-label="左对齐"
            >
              <AlignLeft className="size-4" />
            </Button>
          </Tip>
          <Tip label="水平居中">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => alignSelected("center-h")}
              aria-label="水平居中"
            >
              <AlignCenter className="size-4" />
            </Button>
          </Tip>
          <Tip label="右对齐">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => alignSelected("right")}
              aria-label="右对齐"
            >
              <AlignRight className="size-4" />
            </Button>
          </Tip>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <Tip label="顶对齐">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => alignSelected("top")}
              aria-label="顶对齐"
            >
              <AlignStartVertical className="size-4" />
            </Button>
          </Tip>
          <Tip label="垂直居中">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => alignSelected("middle-v")}
              aria-label="垂直居中"
            >
              <AlignCenterVertical className="size-4" />
            </Button>
          </Tip>
          <Tip label="底对齐">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => alignSelected("bottom")}
              aria-label="底对齐"
            >
              <AlignEndVertical className="size-4" />
            </Button>
          </Tip>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <Tip label="水平等距分布">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => distributeSelected("horizontal")}
              disabled={selectedStrokes.length < 3}
              aria-label="水平等距分布"
            >
              <AlignHorizontalDistributeCenter className="size-4" />
            </Button>
          </Tip>
          <Tip label="垂直等距分布">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => distributeSelected("vertical")}
              disabled={selectedStrokes.length < 3}
              aria-label="垂直等距分布"
            >
              <AlignVerticalDistributeCenter className="size-4" />
            </Button>
          </Tip>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <Tip label="水平翻转">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => flipSelected("horizontal")}
              aria-label="水平翻转"
            >
              <FlipHorizontal2 className="size-4" />
            </Button>
          </Tip>
          <Tip label="垂直翻转">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => flipSelected("vertical")}
              aria-label="垂直翻转"
            >
              <FlipVertical2 className="size-4" />
            </Button>
          </Tip>
        </div>
      )}

      {/* 文本工具：字体/字号选择条（与画笔笔刷条一致，工具栏下方悬浮）。
          文本模式时设新建默认；选中单条文本笔画时回填该文本值并改该文本。 */}
      {(() => {
        const selectedText =
          mode === "select" && selectedStroke?.kind === "text" ? selectedStroke : undefined;
        if (zenMode || (mode !== "text" && !selectedText)) return null;
        const curFont = selectedText?.fontFamily ?? brushFontFamily;
        const curSize = selectedText?.fontSize ?? brushFontSize;
        const apply = (family: string, size: number) => {
          setBrushFontFamily(family);
          setBrushFontSize(size);
          if (selectedText) {
            updateSelectedStrokes((stroke) => ({
              ...stroke,
              fontFamily: family,
              fontSize: size,
            }));
          }
        };
        return (
          <div className="absolute left-1/2 top-14 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/80 p-1 shadow-lg backdrop-blur-md">
            <Tip label="字体">
              <select
                value={curFont}
                onChange={(e) => apply(e.target.value, curSize)}
                aria-label="字体"
                className="h-7 max-w-[8rem] truncate rounded-md border border-border/60 bg-background px-1.5 text-xs outline-none focus:border-ring"
                style={{ fontFamily: curFont }}
              >
                {CANVAS_FONTS.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Tip>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <Tip label="字号">
              <input
                type="range"
                min={8}
                max={120}
                step={1}
                value={curSize}
                onChange={(e) => apply(curFont, Number(e.target.value))}
                aria-label="字号"
                className="w-24 accent-foreground"
              />
            </Tip>
            <span className="min-w-[3rem] text-center font-mono text-xs tabular-nums text-muted-foreground">
              {Math.round(curSize)}px
            </span>
          </div>
        );
      })()}

      {/* 适应内容浮层：视口内无任何笔画时，屏幕正下中显示（对标 Excalidraw）。 */}
      {strokes.length > 0 && !hasContentInViewport && (
        <button
          type="button"
          onClick={zoomToFit}
          className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-accent"
        >
          <Maximize className="size-3.5" /> 返回当前内容
        </button>
      )}

      {/* 缩放控件（右下角）：混合式 pill —— 减/加 快捷缩放，中间百分比点开完整菜单。
          遵守单色设计系统：仅用边框 + 背景 + 阴影浮起，不用任何色相。 */}
      <div
        className={cn(
          "absolute bottom-6 right-3 z-30 inline-flex items-center rounded-lg border border-border/60 bg-background/80 shadow-lg backdrop-blur-md",
          zenMode && "opacity-90",
        )}
        role="group"
        aria-label="缩放"
      >
        <Tip label="缩小（Ctrl+-）">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN + 1e-6}
            aria-label="缩小"
            className="inline-flex size-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
        </Tip>
        <div className="h-4 w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`缩放 ${Math.round(zoom * 100)}%，点开更多选项`}
              className="inline-flex h-8 w-[4.5rem] items-center justify-center gap-0.5 font-mono text-xs tabular-nums text-foreground transition-colors hover:bg-accent"
            >
              {Math.round(zoom * 100)}%
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={6} className="w-52">
            <DropdownMenuItem onSelect={zoomIn} className="text-xs">
              放大
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">Ctrl+=</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={zoomOut} className="text-xs">
              缩小
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">Ctrl+-</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={zoomReset} className="text-xs">
              缩放至 100%
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">Ctrl+0</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={zoomToFit}
              className="text-xs"
              disabled={!strokes.length}
            >
              适应内容
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">1</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-4 w-px bg-border" />
        <Tip label="放大（Ctrl+=）">
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX - 1e-6}
            aria-label="放大"
            className="inline-flex size-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
        </Tip>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute right-3 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2",
        )}
        style={cornerStyle}
      >
        {/* 快捷键速查：右上角常驻入口，Zen 模式下也可用。 */}
        <Tip label="键盘快捷键（?）">
          <button
            type="button"
            onClick={() => setShortcutHelpOpen(true)}
            aria-label="键盘快捷键"
            className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/80 shadow-lg backdrop-blur-md transition-colors hover:bg-accent"
          >
            <Keyboard className="size-4" />
          </button>
        </Tip>
        {/* Zen 按钮：非 zen 显示进入，zen 显示退出（高对比）。 */}
        <Tip label={zenMode ? "退出 Zen 模式（Alt+Z）" : "进入 Zen 模式（隐藏侧栏与工具栏）"}>
          {zenMode ? (
            <button
              type="button"
              onClick={toggleZen}
              className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background shadow-lg hover:bg-foreground/90"
              aria-label="退出 Zen 模式"
            >
              <EyeOff className="size-4" />
              退出 Zen
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleZen}
              aria-label="进入 Zen 模式"
              className="colora-inspector-trigger pointer-events-auto inline-flex size-9 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-background/80 shadow-lg backdrop-blur-md"
            >
              <EyeOff className="size-4" />
            </button>
          )}
        </Tip>
      </div>
      {textInput &&
        (() => {
          const editingStroke = strokes.find((s) => s.id === editingTextIdRef.current);
          const fs = editingStroke?.fontSize ?? brushFontSize;
          const ff = editingStroke?.fontFamily ?? brushFontFamily;
          const isContainer = !!textInput.containerId;
          const boxW = isContainer ? (textInput.containerW ?? 0) * zoom : undefined;
          const boxH = isContainer ? (textInput.containerH ?? 0) * zoom : undefined;
          // 容器文本：textarea 占满容器框，文本水平+垂直居中，自动换行（编辑位置与渲染一致）。
          // 垂直居中用 padding-top = (boxH - 首行高)/2；水平居中用 text-align:center。
          const padTop = isContainer && boxH ? Math.max(0, (boxH - fs * zoom * 1.2) / 2) : 0;
          return (
            <textarea
              ref={textAreaRef}
              rows={1}
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onBlur={(e) => {
                // 用 DOM value 而非 state，避免点画布时 setTextInput(新) 先于 blur 更新导致读到空值丢文本。
                commitText((e.target as HTMLTextAreaElement).value, textInput.cx, textInput.cy);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  textCommittedRef.current = true; // Esc 取消，不提交，阻止后续 blur 提交
                  setTextInput(null);
                  if (!lockedTool) setMode("select"); // 退出文本模式，光标回指针
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              // 对标 Excalidraw wysiwyg：纯透明、无边框/无 outline，文字直接显示在画布上。
              className="colora-text-input absolute z-50 inline-block min-h-[1em] resize-none overflow-visible"
              style={{
                left: `${textInput.x}px`,
                top: `${textInput.y}px`,
                fontFamily: ff,
                fontSize: fs * zoom,
                lineHeight: 1.2,
                width: boxW,
                height: boxH,
                color: isDark ? "#fafafa" : "#0f172a",
                caretColor: isDark ? "#fafafa" : "#0f172a",
                margin: 0,
                padding: `${padTop}px 0 0 0`,
                border: 0,
                outline: 0,
                background: "transparent",
                whiteSpace: isContainer ? "pre-wrap" : "pre",
                wordBreak: isContainer ? "break-word" : "normal",
                textAlign: isContainer ? "center" : "left",
                boxSizing: "border-box",
                backfaceVisibility: "hidden",
              }}
            />
          );
        })()}
      <ShortcutHelpDialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
      <ExportCanvasDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        options={exportOptions}
        onOptionsChange={(next) => setExportOptions((prev) => ({ ...prev, ...next }))}
        onExportPng={() => {
          exportPng(exportOptions.scale, exportOptions.withBackground);
          setExportDialogOpen(false);
        }}
        onExportSvg={() => {
          if (viewSize.w === 0) return;
          if (presetFrame) {
            // 预设画板：SVG viewBox 裁剪到画板框，strokes 平移 -frame。
            const shifted = strokes.map((s) => ({
              ...s,
              points: s.points.map((p) => ({ x: p.x - presetFrame.x, y: p.y - presetFrame.y })),
            }));
            const code = createSvg(
              { w: presetFrame.w, h: presetFrame.h },
              shifted,
              groups,
              overlapMode,
              bgLayout,
              bgColor,
              exportOptions.withBackground,
            );
            downloadText("colora-canvas.svg", code, "image/svg+xml");
          } else {
            const code = createSvg(
              viewSize,
              strokes,
              groups,
              overlapMode,
              bgLayout,
              bgColor,
              exportOptions.withBackground,
            );
            downloadText("colora-canvas.svg", code, "image/svg+xml");
          }
          setExportDialogOpen(false);
        }}
        onExportJson={() => {
          downloadText("colora-canvas.json", jsonCode, "application/json");
          setExportDialogOpen(false);
        }}
      />
      <AlertDialog
        open={confirmDialog !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog?.action();
                setConfirmDialog(null);
              }}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
