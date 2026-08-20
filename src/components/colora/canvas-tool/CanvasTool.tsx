import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileOutput,
  FolderOpen,
  Group,
  MousePointer2,
  Paintbrush,
  Plus,
  Redo2,
  Save,
  Shapes,
  Slash,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Ungroup,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  CANVAS_LAYOUTS,
  DEFAULT_STOPS,
  INITIAL_H,
  INITIAL_W,
  PRESETS,
  SHAPES,
  defaultCanvasBg,
} from "./constants";
import { ColorEditor } from "./ColorEditor";
import { ExportCanvasDialog, type ExportOptions } from "./ExportCanvasDialog";
import { SliderRow } from "./controls";
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
  handlePoint,
  pointInBounds,
  renderBounds,
  resizeTransform,
  selectionBounds,
  unionRenderBounds,
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

  const [mode, setMode] = useState<Mode>("select");
  const [shape, setShape] = useState<ShapeType>("circle");
  const [presetShape, setPresetShape] = useState<ShapeType>("curve");
  const [viewSize, setViewSize] = useState<Size>({ w: 0, h: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>(() => cloneStrokes(initialStrokes));
  const [groups, setGroups] = useState<StrokeGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["demo-1"]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  // select 模式下悬停在可选中线条上时光标改为四向移动箭头（对标 Excalidraw）
  const [hoveringStroke, setHoveringStroke] = useState(false);
  const [brushWidth, setBrushWidth] = useState(18);
  const [overlapMode, setOverlapMode] = useState<OverlapMode>("mix");
  const [bgLayout, setBgLayout] = useState<CanvasLayout>("grid");
  const [bgColor, setBgColor] = useState<string>(() => defaultCanvasBg(theme === "dark"));
  const bgColorAutoRef = useRef(true); // 是否仍为自动跟随主题的默认色（用户未手动改色）
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
              start: { x: renderBounds(a).minX, y: renderBounds(a).minY },
              end: { x: renderBounds(a).maxX, y: renderBounds(a).maxY },
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
      return {
        x: ((event.clientX - rect.left) / rect.width) * viewSize.w,
        y: ((event.clientY - rect.top) / rect.height) * viewSize.h,
      };
    },
    [viewSize],
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
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    off.width = viewSize.w * ratio;
    off.height = viewSize.h * ratio;
    off.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
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
  }, [
    bgColor,
    bgLayout,
    draft,
    groups,
    overlapMode,
    selectedGroup,
    selectedIds,
    selectionBox,
    strokes,
    viewSize,
  ]);

  const addStroke = useCallback(
    (stroke: Stroke) => {
      commitStrokes([...strokes, stroke]);
      setSelectedIds([stroke.id]);
    },
    [commitStrokes, strokes],
  );
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    if (mode === "brush") {
      setDraft({ type: "brush", points: [point] });
      return;
    }
    if (mode === "line" || mode === "shape") {
      setDraft({ type: mode, start: point, end: point });
      return;
    }
    const hit = hitTopStroke(point);
    if (hit) {
      if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id]);
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
    setSelectionBox({ start: point, end: point });
    dragRef.current = { type: "marquee", start: point };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (draft?.type === "brush") {
      setDraft({ type: "brush", points: [...draft.points, point] });
      return;
    }
    if (draft?.type === "line" || draft?.type === "shape") {
      setDraft({ ...draft, end: point });
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
    if (draft?.type === "brush") {
      if (draft.points.length > 2)
        addStroke({
          id: createId("stroke"),
          name: `画笔 ${strokes.length + 1}`,
          kind: "brush",
          points: [...draft.points, point],
          width: brushWidth,
          paint: defaultPaint("#7C3AED"),
        });
      setDraft(null);
      return;
    }
    if (draft?.type === "line" || draft?.type === "shape") {
      if (distance(draft.start, point) > 8) {
        const isLine = draft.type === "line";
        addStroke({
          id: createId("stroke"),
          name: `${isLine ? "直线" : SHAPES.find((item) => item.value === shape)?.label} ${strokes.length + 1}`,
          kind: isLine ? "line" : "shape",
          shape: isLine ? undefined : shape,
          points: isLine ? [draft.start, point] : makeShapePoints(shape, draft.start, point),
          width: brushWidth,
          paint: defaultPaint(isLine ? "#0EA5E9" : "#F97316"),
        });
      }
      setDraft(null);
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
    const points = renderPoints(selectedStroke);
    const point = canvasPoint({ clientX: info.x, clientY: info.y });
    const pos = nearestPercentOnPath(points, point);
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
    if (!window.confirm("确定清空画布？此操作可用撤销恢复。")) return;
    commitGroups([], []);
    setSelectedIds([]);
  };
  // 重置画布（对照 Excalidraw actionClearCanvas）：清空笔画与组合，
  // 背景与重叠模式恢复默认，保留当前 .colora 文件关联（fileHandle 不动）。可撤销。
  const resetCanvas = () => {
    if (!window.confirm("确定重置画布？将清空所有线条并恢复默认背景，可用撤销恢复。")) return;
    commitGroups([], []);
    setOverlapMode("mix");
    setBgLayout("grid");
    setBgColor(defaultCanvasBg(isDark));
    bgColorAutoRef.current = true;
    setSelectedIds([]);
  };
  const addPresetStroke = () => {
    if (viewSize.w === 0) return;
    const cx = viewSize.w / 2,
      cy = viewSize.h / 2,
      halfW = 220,
      halfH = 150;
    addStroke({
      id: createId("stroke"),
      name: `${PRESETS.find((item) => item.value === presetShape)?.label} ${strokes.length + 1}`,
      kind: "shape",
      shape: presetShape,
      points: makeShapePoints(
        presetShape,
        { x: cx - halfW, y: cy - halfH },
        { x: cx + halfW, y: cy + halfH },
      ),
      width: brushWidth,
      paint: defaultPaint("#8B5CF6"),
    });
    setMode("select");
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
    { id: "select", label: "选择", icon: MousePointer2 },
    { id: "brush", label: "画笔", icon: Paintbrush },
    { id: "line", label: "直线", icon: Slash },
    { id: "shape", label: "形状", icon: Shapes },
  ];

  // 画布上的路径色标手柄（仅选中单笔画、渐变模式、非组）
  const stopHandles = useMemo(() => {
    if (!selectedStroke || selectedGroup) return [];
    if (selectedStroke.paint.mode !== "gradient") return [];
    if (viewSize.w === 0) return [];
    const points = renderPoints(selectedStroke);
    const total = totalLength(points);
    if (total <= 0) return [];
    return selectedStroke.paint.stops.map((stop) => {
      const p = pointAtLength(points, percentToLength(stop.pos, total));
      return { stop, left: (p.x / viewSize.w) * 100, top: (p.y / viewSize.h) * 100 };
    });
  }, [selectedStroke, selectedGroup, viewSize]);

  // 选中笔画的变换手柄（八向缩放）。框选/拖动草稿中不显示。
  const resizeHandles = useMemo(() => {
    if (!selBounds || viewSize.w === 0 || viewSize.h === 0) return [];
    if (draft || selectionBox) return [];
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
    return (Object.keys(cursors) as ResizeHandle[]).map((handle) => {
      const p = handlePoint(selBounds, handle);
      return {
        handle,
        cursor: cursors[handle],
        left: (p.x / viewSize.w) * 100,
        top: (p.y / viewSize.h) * 100,
      };
    });
  }, [draft, selBounds, selectionBox, viewSize]);

  const onResizeHandlePointerDown = (event: React.PointerEvent, handle: ResizeHandle) => {
    if (!selBounds) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = canvasPoint(event);
    // box 用点的真实包围盒（无 padding），缩放以点的真实范围为基准，
    // 避免外框 padding 参与缩放导致"鼠标动一点、线条大幅变动"的杠杆放大。
    const box = unionRenderBounds(selectedStrokes) ?? { ...selBounds };
    dragRef.current = {
      type: "resize",
      handle,
      origin,
      box,
      startStrokes: cloneStrokes(selectedStrokes),
      startGroups: cloneGroups(groups),
    };
  };
  // 把 resize 拖动逻辑抽出来，手柄 button（已 capture 指针）和 canvas 都可调用
  const applyResizeMove = useCallback(
    (point: Point) => {
      const drag = dragRef.current;
      if (drag?.type !== "resize") return;
      const { mapPoint } = resizeTransform(drag.box, drag.handle, drag.origin, point);
      const ids = new Set(selectedIds);
      const snapshot = drag.startStrokes; // 始终从按下时的原始点快照映射，避免在已缩放点上重复应用导致指数累积
      setStrokes((current) =>
        current.map((stroke) => {
          if (!ids.has(stroke.id)) return stroke;
          const original = snapshot.find((s) => s.id === stroke.id);
          if (!original) return stroke;
          return { ...stroke, points: original.points.map((p) => mapPoint(p)) };
        }),
      );
    },
    [selectedIds],
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
          mode === "select"
            ? hoveringStroke
              ? "cursor-move"
              : "cursor-default"
            : "cursor-crosshair",
        )}
      />

      {/* 画布上的路径色标手柄 */}
      {stopHandles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 touch-none">
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
              className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-sm border border-blue-500 bg-white shadow-[0_0_0_1px_rgb(255_255_255)] outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring"
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

      {/* 悬浮工具栏 */}
      <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-border/60 bg-background/80 p-1.5 shadow-lg backdrop-blur-md">
        {toolButtons.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              type="button"
              variant={mode === item.id ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => setMode(item.id)}
            >
              <Icon className="size-4" />
              <span className="hidden text-xs sm:inline">{item.label}</span>
            </Button>
          );
        })}
        <select
          value={shape}
          onChange={(event) => setShape(event.target.value as ShapeType)}
          disabled={mode !== "shape"}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs outline-none disabled:opacity-50"
          aria-label="预设形状"
        >
          {SHAPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <select
          value={presetShape}
          onChange={(event) => setPresetShape(event.target.value as ShapeType)}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs outline-none"
          aria-label="预设路径"
        >
          {PRESETS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-1 px-2.5"
          onClick={addPresetStroke}
        >
          <Plus className="size-3.5" /> <span className="text-xs">添加</span>
        </Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={clearCanvas}
          aria-label="清空画布"
        >
          <Trash2 className="size-4" />
        </Button>
        <div className="ml-1 hidden items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
          <Sparkles className="size-3" />
          {strokes.length} 线 · {groups.length} 组
        </div>
      </div>

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

                    <SliderRow
                      label="线宽"
                      value={selectedStrokes[0]?.width ?? brushWidth}
                      unit="px"
                      min={1}
                      max={100}
                      onChange={(value) =>
                        updateSelectedStrokes((stroke) => ({ ...stroke, width: value }))
                      }
                    />

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
                      />
                    )}

                    {selectedGroup && (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          重叠处理
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={overlapMode === "mix" ? "default" : "outline"}
                            className="h-8 text-xs"
                            disabled={!groupHasOverlap}
                            title={groupHasOverlap ? "在重叠处混合颜色" : "组合内线条无重叠"}
                            onClick={() => setOverlapMode("mix")}
                          >
                            自动混色
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={overlapMode === "cover" ? "default" : "outline"}
                            className="h-8 text-xs"
                            disabled={!groupHasOverlap}
                            title={groupHasOverlap ? "上层线条覆盖下层" : "组合内线条无重叠"}
                            onClick={() => setOverlapMode("cover")}
                          >
                            前层覆盖
                          </Button>
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
                        variant="destructive"
                        className="col-span-2 h-8 gap-1 text-xs"
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full gap-1 text-xs"
                        onClick={saveToActiveFile}
                        title={`保存到当前文件 ${coloraFileName}.colora`}
                      >
                        <Save className="size-3.5" /> 保存至当前文件
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full gap-1 text-xs"
                      onClick={saveFileToDisk}
                      title="另存为新文件"
                    >
                      <FileOutput className="size-3.5" /> 保存到...
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full gap-1 text-xs"
                      onClick={resetCanvas}
                      title="重置画布：清空线条并恢复默认背景"
                      aria-label="重置画布"
                    >
                      <Trash2 className="size-3.5" /> 重置画布
                    </Button>
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
                        <button
                          key={item.hex}
                          type="button"
                          title={`${item.label} ${item.hex}`}
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
    </section>
  );
}
