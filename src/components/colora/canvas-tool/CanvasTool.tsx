import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Download,
  Eraser,
  FileOutput,
  FolderOpen,
  Group,
  Hand,
  Lock,
  Maximize,
  MousePointer2,
  Pencil,
  Redo2,
  Save,
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
  BRUSH_TYPES,
  DEFAULT_STOPS,
  INITIAL_H,
  INITIAL_W,
  STROKE_WIDTHS,
  defaultCanvasBg,
} from "./constants";
import { ColorEditor } from "./ColorEditor";
import { Tip } from "../primitives";
import { ExportCanvasDialog, type ExportOptions } from "./ExportCanvasDialog";
import { initialStrokes } from "./initial-strokes";
import { boxIntersectsStroke, hitStroke } from "./collision";
import { openColoraFile, restoreCanvas, saveColoraFile } from "./file-format";
import {
  clearFileHandle,
  loadFileHandle,
  saveFileHandle,
  verifyReadPermission,
} from "./file-handle-store";
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
import { renderPoints } from "./path";
import { createSvg, renderScene } from "./render";
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
  CanvasLayout,
  Draft,
  DragState,
  BrushType,
  InspectorTab,
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

export function CanvasTool() {
  const { theme } = useColora();
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const scaledRef = useRef(false);
  const stopDragRafRef = useRef(0);
  const stopDragInfoRef = useRef<{ stopId: string; x: number; y: number } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
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
  } | null>(null);
  // 双击进入编辑的线性笔画 id：显示所有点 + 中间点，拖点/插折点；Esc 退出。
  const [editingLinearId, setEditingLinearId] = useState<string | null>(null);
  // 退出线性编辑态时重置纯色中点手柄的本地拖动位置（下次进入回到路径中点）。
  useEffect(() => {
    if (!editingLinearId) setSolidMidPos(null);
  }, [editingLinearId]);
  const [viewSize, setViewSize] = useState<Size>({ w: 0, h: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>(() => cloneStrokes(initialStrokes));
  strokesRef.current = strokes; // 同步最新 strokes 供 window 监听回调读取
  const [groups, setGroups] = useState<StrokeGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["demo-1"]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  // select 模式下悬停在可选中线条上时光标改为四向移动箭头（对标 Excalidraw）
  const [hoveringStroke, setHoveringStroke] = useState(false);
  const [brushWidth, setBrushWidth] = useState(4);
  // 新建线性元素的默认边角：sharp=方角折线，round=圆角平滑曲线（对标 Excalidraw roundness）。
  const [brushRoundness, setBrushRoundness] = useState<"sharp" | "round">("sharp");
  // 新建元素的默认边框样式：solid/dashed/dotted（对标 Excalidraw StrokeStyle）。
  const [brushStrokeStyle, setBrushStrokeStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  // 新建画笔的笔刷类型：pen/marker/highlighter/pencil/neon/spray/brush（对标专业绘图工具笔刷质感）。
  const [brushType, setBrushType] = useState<BrushType>("pen");
  const [overlapMode, setOverlapMode] = useState<OverlapMode>("mix");
  const [bgLayout, setBgLayout] = useState<CanvasLayout>("grid");
  const [bgColor, setBgColor] = useState<string>(() => defaultCanvasBg(theme === "dark"));
  const bgColorAutoRef = useRef(true); // 是否仍为自动跟随主题的默认色（用户未手动改色）
  // 画布视口：pan=画布原点在屏幕坐标系的偏移（像素），zoom=缩放倍数。
  // 屏幕↔画布：screen = canvas * zoom + pan；canvas = (screen - pan) / zoom。
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const spaceDownRef = useRef(false); // 空格键按住：进入抓手平移模式（事件读取）
  const [spaceDown, setSpaceDown] = useState(false); // 空格按下（驱动光标 UI）
  const [panning, setPanning] = useState(false); // 是否正在平移拖动（用于光标 grabbing）
  const [undoStack, setUndoStack] = useState<SceneSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SceneSnapshot[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("canvas");
  // 当前已保存/已打开的 .colora 文件句柄：有值时"保存"直接覆写该文件，无值时弹"另存为"。
  const [coloraFileHandle, setColoraFileHandle] = useState<FileSystemFileHandle | null>(null);
  // 已打开文件的文件名（用于默认保存名 + UI 展示）。
  const [coloraFileName, setColoraFileName] = useState<string>("画布");
  // 导出弹窗：打开状态 + 导出选项（含背景、缩放倍率）。
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
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

  const openCanvasInspector = useCallback(() => {
    setInspectorTab("canvas");
    setInspectorOpen((open) => !(open && inspectorTab === "canvas"));
  }, [inspectorTab]);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

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

  useEffect(() => {
    if (mode !== "select") return;
    if (!selectedStrokes.length) return;
    setInspectorTab("line");
    setInspectorOpen(true);
  }, [mode, selectedStrokes.length]);

  useEffect(() => {
    if (mode !== "select" || selectedStrokes.length || inspectorTab !== "line") return;
    setInspectorOpen(false);
  }, [inspectorTab, mode, selectedStrokes.length]);

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
  }, [zoomToFit, editingLinearId]);

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

  // 启动时：若 IDB 存有最近一次的文件句柄且有读权限，则自动恢复该画布。
  // 等 viewSize 测得后再恢复，使 restoreCanvas 能按真实画布尺寸映射坐标。
  // 首次进入页面通常无权限句柄（需用户主动打开过），此时不弹窗、静默跳过。
  const bootRestoreTriedRef = useRef(false);
  useEffect(() => {
    if (bootRestoreTriedRef.current) return;
    if (viewSize.w === 0 || viewSize.h === 0) return;
    bootRestoreTriedRef.current = true;
    let cancelled = false;
    (async () => {
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
          }
        : undefined,
      hideSelectionBox:
        dragRef.current?.type === "pointDrag" ||
        (editingLinearId !== null && selectedStrokes[0]?.id === editingLinearId),
    });
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
    // pan 用 pan.x/pan.y 依赖（比 pan 整体引用更精确）；renderScene 接收整体 pan 仅用于背景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bgColor,
    bgLayout,
    brushWidth,
    draft,
    editingLinearId,
    groups,
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
    if (v) {
      if (editingId) {
        // 编辑现有文本：只更新 text，保留字体/字号/颜色。
        commitStrokes(strokes.map((s) => (s.id === editingId ? { ...s, text: v } : s)));
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
          fontSize: 28,
          fontFamily: CANVAS_FONTS[0].value,
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
      closeInspector();
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
      setDraft({ type: "shape", shape: shapeOfMode(mode)!, start: point, end: point });
      return;
    }
    const hit = hitTopStroke(point);
    if (hit) {
      if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id]);
      // 选中的线条变化时退出线性编辑态（编辑态仅对当前选中线条生效）。
      if (editingLinearId && editingLinearId !== hit.id) setEditingLinearId(null);
      dragRef.current = {
        type: "move",
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
        last: point,
        startStrokes: cloneStrokes(strokes),
        startGroups: cloneGroups(groups),
      };
      return;
    }
    setSelectedIds([]);
    closeInspector();
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
      const dx = point.x - dragRef.current.last.x,
        dy = point.y - dragRef.current.last.y;
      dragRef.current.last = point;
      setStrokes((current) =>
        current.map((stroke) =>
          selectedIds.includes(stroke.id)
            ? {
                ...stroke,
                points: stroke.points.map((item) => ({ x: item.x + dx, y: item.y + dy })),
              }
            : stroke,
        ),
      );
    }
    if (dragRef.current?.type === "marquee")
      setSelectionBox({ start: dragRef.current.start, end: point });
    if (dragRef.current?.type === "resize") applyResizeMove(point);
    // 纯悬停（无拖动、无草稿、select 模式）：命中线条本体或在已选中组合大框内，
    // 均显示四向移动光标——大框内任意处可拖动整组。
    if (mode === "select" && !draft && !dragRef.current)
      setHoveringStroke(
        Boolean(hitTopStroke(point)) || Boolean(selBounds && pointInBounds(point, selBounds)),
      );
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
        addStroke({
          id: createId("stroke"),
          name: `${label} ${strokes.length + 1}`,
          kind: isLine ? "line" : "shape",
          shape: sh,
          points: isLine ? [draft.start, point] : makeShapePoints(sh!, draft.start, point),
          width: brushWidth,
          paint: defaultPaint(isLine ? "#0EA5E9" : "#F97316"),
          // 仅线性元素（直线/箭头/波浪/曲线/螺旋）带边角；闭合形状不使用 roundness。
          ...(isLine || sh === "arrow" || sh === "wave" || sh === "curve" || sh === "spiral"
            ? { roundness: brushRoundness }
            : {}),
          strokeStyle: brushStrokeStyle,
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
    dragRef.current = null;
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "select" || !selectedStroke || selectedGroup) return;
    const point = canvasPoint(event);
    if (!hitStroke(selectedStroke, point)) return;
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
    // 闭合形状双击（渐变模式）：在双击位置插入色标。
    const points = renderPoints(selectedStroke);
    const pos = nearestPercentOnPath(points, point);
    const source = selectedStroke.paint;
    const picked = stopAtPercent(source.stops, pos, source.space);
    const newStop: PathStop = {
      id: createStopId("stop"),
      hex: picked.hex,
      alpha: picked.alpha,
      pos: Math.round(pos),
    };
    commitStrokes(
      strokes.map((stroke) =>
        stroke.id === selectedStroke.id
          ? { ...stroke, paint: { ...stroke.paint, stops: [...stroke.paint.stops, newStop] } }
          : stroke,
      ),
    );
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
  }, [deleteSelected, duplicateSelected]);

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
    const canvas = document.createElement("canvas");
    canvas.width = viewSize.w * scale;
    canvas.height = viewSize.h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const off = document.createElement("canvas");
    off.width = viewSize.w * scale;
    off.height = viewSize.h * scale;
    off.getContext("2d")?.setTransform(scale, 0, 0, scale, 0, 0);
    renderScene({
      ctx,
      size: viewSize,
      strokes,
      groups,
      overlapMode,
      offscreen: off,
      bgLayout,
      bgColor,
      showBackground: withBackground,
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
            single.kind === "text" ? Math.max((single.fontSize ?? 28) * 0.12, 6) : single.width / 2;
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
        const pad = s.kind === "text" ? Math.max((s.fontSize ?? 28) * 0.12, 6) : s.width / 2;
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
      setStrokes((current) =>
        current.map((stroke) => {
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
          return { ...stroke, points: original.points.map((p) => mapPoint(p)) };
        }),
      );
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
      setStrokes((current) =>
        current.map((stroke) => {
          if (!ids.has(stroke.id)) return stroke;
          const origAngle = drag.origAngles[stroke.id] ?? 0;
          if (!multi) return { ...stroke, angle: normalizeAngle(origAngle + delta) };
          // 多选：points 绕全局中心旋转 delta + angle += delta（整体绕中心旋转 δ，见 plan 多选正确性）。
          return {
            ...stroke,
            points: rotatePoints(stroke.points, drag.center, delta),
            angle: normalizeAngle(origAngle + delta),
          };
        }),
      );
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
    const onMove = (e: PointerEvent) =>
      applyRotationMove(canvasPoint({ clientX: e.clientX, clientY: e.clientY }), e.shiftKey);
    const onUp = () => {
      applyRotationEnd();
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
        return { ...stroke, points };
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
        if (!isColora) return;
        event.preventDefault();
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
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Colora 画布工作区"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoveringStroke(false)}
        onDoubleClick={onDoubleClick}
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

      {/* 画布上的路径色标手柄 */}
      {stopHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 touch-none">
          {stopHandles.map(({ stop, left, top }) => (
            <button
              key={stop.id}
              type="button"
              aria-label={`色标 ${Math.round(stop.pos)}%`}
              className="pointer-events-auto absolute size-5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white shadow-[0_0_0_1px_var(--color-border),0_6px_18px_rgb(0_0_0/0.30)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                backgroundColor: hexAlphaToCss(stop.hex, stop.alpha),
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                stopDragInfoRef.current = { stopId: stop.id, x: event.clientX, y: event.clientY };
                flushStopDrag();
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                stopDragInfoRef.current = { stopId: stop.id, x: event.clientX, y: event.clientY };
                scheduleStopDrag();
              }}
              onPointerUp={() => {
                stopDragInfoRef.current = null;
              }}
              onPointerCancel={() => {
                stopDragInfoRef.current = null;
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
              className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-blue-500 bg-white shadow-[0_0_0_1px_rgb(255_255_255)] outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${h.left}%`, top: `${h.top}%`, cursor: "grab" }}
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

      {/* 悬浮工具栏（对标 Excalidraw）：icon 按钮组 + 锁定 + 撤销/重做 */}
      <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-border/60 bg-background/80 p-1.5 shadow-lg backdrop-blur-md">
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
                onClick={() => setMode(item.id)}
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
      </div>

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

      <div
        className="pointer-events-none absolute right-3 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2"
        style={cornerStyle}
      >
        <button
          type="button"
          aria-label="打开画布设置"
          aria-expanded={inspectorOpen}
          onClick={openCanvasInspector}
          className="colora-inspector-trigger pointer-events-auto inline-flex size-9 items-center justify-center overflow-hidden rounded-md border shadow-lg backdrop-blur-md"
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={2.2} />
        </button>
        {inspectorOpen && (
          <div
            className="colora-inspector-panel pointer-events-auto flex w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md animate-inspector-open"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
              <div className="grid flex-1 grid-cols-2 rounded-xl bg-background/45 p-1">
                <button
                  type="button"
                  onClick={() => setInspectorTab("line")}
                  disabled={!selectedStrokes.length}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                    inspectorTab === "line"
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  线条
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("canvas")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    inspectorTab === "canvas"
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  画布
                </button>
              </div>
            </div>

            <div className="max-h-[min(70dvh,560px)] overflow-y-auto overflow-x-hidden p-3">
              {inspectorTab === "line" ? (
                selectedStrokes.length ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedStrokes.length === 1
                          ? "线条"
                          : `已选中 ${selectedStrokes.length} 条线条`}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        调整颜色、粗细、重叠方式，并导出当前选中线条。
                      </p>
                    </div>

                    {/* 线宽三档（细/中/粗，对标 Excalidraw STROKE_WIDTH）。 */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {STROKE_WIDTHS.map((w) => {
                        const active = selectedStrokes.some((s) => s.width === w.value);
                        return (
                          <Button
                            key={w.id}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => {
                              updateSelectedStrokes((stroke) => ({ ...stroke, width: w.value }));
                              setBrushWidth(w.value);
                            }}
                          >
                            {w.label}
                          </Button>
                        );
                      })}
                    </div>

                    {/* 边角：仅线性元素（直线/箭头/画笔/波浪/曲线/螺旋）可切换。
                        sharp=方角折线，round=圆角平滑曲线（Catmull-Rom，对标 Excalidraw roundness）。 */}
                    {selectedStrokes.some(isLinearStroke) && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["sharp", "round"] as const).map((r) => {
                          // 多选时，任一选中线性元素当前为该边角即高亮（混合态不强行统一）。
                          const active = selectedStrokes.some(
                            (s) => isLinearStroke(s) && (s.roundness ?? "sharp") === r,
                          );
                          return (
                            <Button
                              key={r}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              className="h-8 text-xs"
                              onClick={() => {
                                // 同时更新选中线性元素的边角与"新建默认边角"。
                                updateSelectedStrokes((stroke) =>
                                  isLinearStroke(stroke) ? { ...stroke, roundness: r } : stroke,
                                );
                                setBrushRoundness(r);
                              }}
                            >
                              {r === "sharp" ? "方角" : "圆角"}
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    {/* 边框样式：实线/虚线/点线（对标 Excalidraw StrokeStyle）。所有元素可用。 */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["solid", "dashed", "dotted"] as const).map((st) => {
                        const active = selectedStrokes.some(
                          (s) => (s.strokeStyle ?? "solid") === st,
                        );
                        return (
                          <Button
                            key={st}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => {
                              updateSelectedStrokes((stroke) => ({ ...stroke, strokeStyle: st }));
                              setBrushStrokeStyle(st);
                            }}
                          >
                            {st === "solid" ? "实线" : st === "dashed" ? "虚线" : "点线"}
                          </Button>
                        );
                      })}
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
                        onSetSpace={(space) =>
                          updateSelectionPaint((paint) => ({ ...paint, space }))
                        }
                        onSetMode={(paintMode) =>
                          updateSelectionPaint((paint) => ({ ...paint, mode: paintMode }))
                        }
                        onSetSolid={(hex) =>
                          updateSelectionPaint((paint) => ({ ...paint, solid: hex }))
                        }
                        onReverse={reverseSelectionStops}
                        text={selectedStroke?.kind === "text" ? selectedStroke.text : undefined}
                        fontSize={
                          selectedStroke?.kind === "text" ? selectedStroke.fontSize : undefined
                        }
                        fontFamily={
                          selectedStroke?.kind === "text" ? selectedStroke.fontFamily : undefined
                        }
                        onSetFont={
                          selectedStroke?.kind === "text"
                            ? (family) =>
                                updateSelectedStrokes((stroke) => ({
                                  ...stroke,
                                  fontFamily: family,
                                }))
                            : undefined
                        }
                        onSetFontSize={
                          selectedStroke?.kind === "text"
                            ? (size) =>
                                updateSelectedStrokes((stroke) => ({ ...stroke, fontSize: size }))
                            : undefined
                        }
                      />
                    )}

                    {selectedGroup && (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          重叠处理
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Tip label={groupHasOverlap ? "在重叠处混合颜色" : "组合内线条无重叠"}>
                            <Button
                              type="button"
                              size="sm"
                              variant={overlapMode === "mix" ? "default" : "outline"}
                              className="h-8 text-xs"
                              disabled={!groupHasOverlap}
                              onClick={() => setOverlapMode("mix")}
                            >
                              自动混色
                            </Button>
                          </Tip>
                          <Tip label={groupHasOverlap ? "上层线条覆盖下层" : "组合内线条无重叠"}>
                            <Button
                              type="button"
                              size="sm"
                              variant={overlapMode === "cover" ? "default" : "outline"}
                              className="h-8 text-xs"
                              disabled={!groupHasOverlap}
                              onClick={() => setOverlapMode("cover")}
                            >
                              前层覆盖
                            </Button>
                          </Tip>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 border-t border-border/60 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={createGroup}
                        disabled={selectedIds.length < 2}
                      >
                        <Group className="size-3.5" /> 组合
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={ungroup}
                        disabled={!selectedGroup}
                      >
                        <Ungroup className="size-3.5" /> 取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => moveLayer("front")}
                      >
                        上移顶层
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => moveLayer("back")}
                      >
                        下移底层
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="col-span-2 h-8 gap-1 border-red-500/60 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                        onClick={deleteSelected}
                      >
                        <Trash2 className="size-3.5" /> 删除选中
                      </Button>
                    </div>

                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <Download className="size-3.5" /> 导出选中
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => exportSelectedPng(false)}
                        >
                          透明 PNG
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => exportSelectedPng(true)}
                        >
                          背景 PNG
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => exportSelectedSvg(false)}
                        >
                          透明 SVG
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => exportSelectedSvg(true)}
                        >
                          背景 SVG
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                    选择线条后可编辑颜色、粗细与导出选中内容。
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {/* 画笔工具：笔刷类型选择（影响新建画笔的质感，对标专业绘图工具）。 */}
                  {mode === "brush" && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-muted-foreground">笔刷</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {BRUSH_TYPES.map((b) => (
                          <Button
                            key={b.id}
                            type="button"
                            size="sm"
                            variant={brushType === b.id ? "default" : "outline"}
                            className="h-8 text-xs"
                            onClick={() => setBrushType(b.id)}
                          >
                            {b.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full gap-1 text-xs"
                      onClick={openLocal}
                    >
                      <FolderOpen className="size-3.5" /> 打开
                    </Button>
                    {coloraFileHandle && (
                      <Tip label={`保存到当前文件 ${coloraFileName}.colora`}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full gap-1 text-xs"
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
                        variant="outline"
                        className="h-8 w-full gap-1 text-xs"
                        onClick={saveFileToDisk}
                      >
                        <FileOutput className="size-3.5" /> 保存到...
                      </Button>
                    </Tip>
                    <Tip label="重置画布：清空线条并恢复默认背景">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full gap-1 text-xs"
                        onClick={resetCanvas}
                        aria-label="重置画布"
                      >
                        <Trash2 className="size-3.5" /> 重置画布
                      </Button>
                    </Tip>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-medium text-muted-foreground">画布背景</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {CANVAS_LAYOUTS.map((item) => (
                        <Button
                          key={item.value}
                          type="button"
                          size="sm"
                          variant={bgLayout === item.value ? "default" : "outline"}
                          className="h-8 text-xs"
                          onClick={() => setBgLayout(item.value)}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-medium text-muted-foreground">画布颜色</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {CANVAS_BG_PRESETS.map((item) => (
                        <Tip key={item.hex} label={`${item.label} ${item.hex}`}>
                          <button
                            type="button"
                            aria-label={`${item.label} ${item.hex}`}
                            onClick={() => {
                              bgColorAutoRef.current = false;
                              setBgColor(item.hex);
                            }}
                            className={cn(
                              "flex h-9 items-center justify-center rounded-md border text-xs",
                              bgColor.toUpperCase() === item.hex
                                ? "border-foreground ring-2 ring-ring"
                                : "border-border/60",
                            )}
                            style={{ backgroundColor: item.hex, color: bestTextOn(item.hex) }}
                          >
                            {item.label}
                          </button>
                        </Tip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <Download className="size-3.5" /> 导出
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full gap-1 text-xs"
                      onClick={() => setExportDialogOpen(true)}
                    >
                      <Download className="size-3.5" /> 导出画布...
                    </Button>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      可把 .colora 文件直接拖入画布导入，跨设备打开继续编辑。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {textInput &&
        (() => {
          const editingStroke = strokes.find((s) => s.id === editingTextIdRef.current);
          const fs = editingStroke?.fontSize ?? 28;
          const ff = editingStroke?.fontFamily ?? CANVAS_FONTS[0].value;
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
              // 对标 Excalidraw wysiwyg：纯透明、无边框/无 outline/无 padding，文字直接显示在画布上。
              className="colora-text-input absolute z-50 inline-block min-h-[1em] min-w-[1ch] resize-none overflow-hidden"
              style={{
                left: `${textInput.x}px`,
                top: `${textInput.y}px`,
                fontFamily: ff,
                fontSize: fs * zoom,
                lineHeight: 1,
                color: isDark ? "#fafafa" : "#0f172a",
                caretColor: isDark ? "#fafafa" : "#0f172a",
                margin: 0,
                padding: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                whiteSpace: "pre",
                boxSizing: "content-box",
                backfaceVisibility: "hidden",
              }}
            />
          );
        })()}
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
