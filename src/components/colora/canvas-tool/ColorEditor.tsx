import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { hexAlphaToCss, hexToRgb, hslToRgb, normalizeHex, rgbToHex, rgbToHsl } from "@/lib/color";
import { CANVAS_FONTS, INTERP_SPACES } from "./constants";
import { clamp } from "./utils";
import { ColorSlider } from "./ColorSlider";
import { Tip } from "../primitives";
import type { InterpSpace, PaintMode, StrokePaint } from "./types";

/** 极简单色风颜色编辑器：HSL 拾色 + 色标行（圆点连线 / 位置% / 颜色方块 / 透明度%）+ 插值空间分段 */
export function ColorEditor({
  title,
  subtitle,
  paint,
  onStopPos,
  onStopHex,
  onStopAlpha,
  onDuplicateStop,
  onDeleteStop,
  onCopyHex,
  onAddStopAt,
  onDropStop,
  onSetSpace,
  onSetMode,
  onSetSolid,
  onReverse,
  hideModeToggle,
  extra,
  text,
  fontSize,
  fontFamily,
  onSetFont,
  onSetFontSize,
}: {
  title: string;
  subtitle?: string;
  paint: StrokePaint;
  onStopPos: (stopId: string, pos: number) => void;
  onStopHex: (stopId: string, hex: string) => void;
  onStopAlpha: (stopId: string, alpha: number) => void;
  onDuplicateStop: (stopId: string) => void;
  onDeleteStop: (stopId: string) => void;
  onCopyHex: (stopId: string) => void;
  onAddStopAt: (pos: number) => string;
  onDropStop: (draggedId: string, orderedIds: string[], pos: number) => void;
  onSetSpace: (space: InterpSpace) => void;
  onSetMode?: (mode: PaintMode) => void;
  onSetSolid?: (hex: string) => void;
  onReverse?: () => void;
  hideModeToggle?: boolean;
  extra?: React.ReactNode;
  // 文本笔画专属：传入 text（非 undefined）时显示字体/字号控件。
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  onSetFont?: (family: string) => void;
  onSetFontSize?: (size: number) => void;
}) {
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editingAlphaId, setEditingAlphaId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState(-1); // 被拖行目标插入索引（冻结顺序中）
  const [dragCursor, setDragCursor] = useState(0); // 被拖行目标槽位（浮点，按下槽 + 整行高倍数位移）
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragCandidateRef = useRef<{
    stopId: string;
    startX: number;
    startY: number;
    index: number;
  } | null>(null);
  // 拖拽期间冻结排序：记录按下时的顺序与被拖行索引，拖拽中行保持原位、用 transform 让位/跟随，松手再按 pos 重排。
  const dragSnapshotRef = useRef<string[] | null>(null);
  const dragDraggedIndexRef = useRef(-1); // 按下时被拖行在冻结顺序中的索引
  const rowHRef = useRef(52); // 一行（含行间 gap）的单元高度，拖拽中用 offsetTop 测量
  const dropPosRef = useRef(0); // 被拖行当前自定义 pos（按下到松手期间随光标更新）

  // 可原地全选编辑的百分比数字：数字与 % 始终是同一 flex 行内两个独立 span，
  // 编辑只是把数字 span 标为 contentEditable 并全选其文本，布局/位置完全不变；% 不可编辑。
  const renderEditablePercent = (
    value: number,
    editing: boolean,
    onStart: () => void,
    onSubmit: (v: number) => void,
    onCancel: () => void,
    align: "left" | "right",
  ) => (
    <span
      className={cn(
        "flex h-6 min-w-0 items-center gap-0.5 rounded px-1 font-mono text-xs font-semibold text-neutral-200 hover:bg-neutral-900",
        align === "right" ? "justify-end" : "justify-start",
      )}
      aria-label="编辑百分比"
    >
      {editing ? (
        <span
          contentEditable
          suppressContentEditableWarning
          role="button"
          tabIndex={-1}
          data-stop-handle="edit"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          ref={(el) => {
            if (!el) return;
            if (el.dataset.focused === "true") return;
            el.dataset.focused = "true";
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel?.removeAllRanges();
            sel?.addRange(range);
            el.focus();
          }}
          onBlur={(e) => {
            const v = Number(e.currentTarget.textContent?.replace(/[^0-9.\-]/g, ""));
            if (Number.isFinite(v)) onSubmit(clamp(Math.round(v), 0, 100));
            onCancel();
            if (e.currentTarget) e.currentTarget.dataset.focused = "false";
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              const v = Number(e.currentTarget.textContent?.replace(/[^0-9.\-]/g, ""));
              if (Number.isFinite(v)) onSubmit(clamp(Math.round(v), 0, 100));
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 cursor-text select-text outline-none"
          style={{ caretColor: "rgb(245 245 245)" }}
        >
          {Math.round(value)}
        </span>
      ) : (
        <span
          role="button"
          tabIndex={0}
          data-stop-handle="number"
          onClick={() => onStart()}
          className="min-w-0 cursor-text"
        >
          {Math.round(value)}
        </span>
      )}
      <span
        data-stop-handle="unit"
        onClick={() => onStart()}
        className="cursor-text select-none text-[9px] text-neutral-500"
      >
        %
      </span>
    </span>
  );
  const stops = paint.stops;
  const sortedStops = useMemo(() => [...stops].sort((a, b) => a.pos - b.pos), [stops]);
  // 拖拽中保持按下时的顺序（冻结），行不重排，靠 transform 让位/跟随，松手再按 pos 落位。
  const renderStops = useMemo(() => {
    if (!dragId || !dragSnapshotRef.current) return sortedStops;
    return dragSnapshotRef.current
      .map((id) => stops.find((s) => s.id === id))
      .filter(Boolean) as typeof sortedStops;
  }, [dragId, sortedStops, stops]);
  // 一行（含行间 gap）的单元高度：拖拽中用两行 offsetTop 差值测量（offsetTop 不受 transform 影响）
  const measureRowUnit = () => {
    const snapshot = dragSnapshotRef.current;
    if (snapshot && snapshot.length > 1) {
      const a = rowRefs.current[snapshot[0]];
      const b = rowRefs.current[snapshot[1]];
      if (a && b) {
        const h = b.offsetTop - a.offsetTop;
        if (h > 0) return h;
      }
    }
    return 52;
  };
  const activeStop = sortedStops.find((stop) => stop.id === activeStopId) ?? sortedStops[0];
  const activeHex = paint.mode === "solid" ? paint.solid : (activeStop?.hex ?? paint.solid);
  const activeHsl = rgbToHsl(hexToRgb(activeHex));
  const hueColor = rgbToHex(hslToRgb({ h: activeHsl.h, s: 100, l: 50 }));
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortedStops.length) return;
    if (!activeStopId || !sortedStops.some((stop) => stop.id === activeStopId)) {
      setActiveStopId(sortedStops[0].id);
    }
  }, [activeStopId, sortedStops]);

  const setActiveHex = (hex: string) => {
    if (paint.mode === "solid") onSetSolid?.(hex);
    else if (activeStop) onStopHex(activeStop.id, hex);
  };
  const setActiveHsl = (next: { h?: number; s?: number; l?: number }) => {
    setActiveHex(
      rgbToHex(
        hslToRgb({
          h: next.h ?? activeHsl.h,
          s: clamp(next.s ?? activeHsl.s, 0, 100),
          l: clamp(next.l ?? activeHsl.l, 0, 100),
        }),
      ),
    );
  };
  const pickFromSquare = (clientX: number, clientY: number) => {
    const picker = pickerRef.current;
    if (!picker) return;
    const rect = picker.getBoundingClientRect();
    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const l = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
    setActiveHsl({ s, l });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-neutral-100 shadow-2xl shadow-black/30">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-neutral-100">{title}</div>
            {subtitle && <div className="mt-1 text-[11px] text-neutral-500">{subtitle}</div>}
          </div>
          {onReverse && (
            <Tip label="翻转颜色顺序">
              <button
                type="button"
                onClick={onReverse}
                aria-label="翻转颜色顺序"
                className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100"
              >
                <ArrowUpDown className="size-3.5" />
              </button>
            </Tip>
          )}
        </div>

        {text !== undefined && onSetFont && onSetFontSize && (
          <div className="mb-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2">
            <div>
              <div className="mb-1 text-[10px] font-medium text-neutral-500">字体</div>
              <select
                value={fontFamily ?? CANVAS_FONTS[0].value}
                onChange={(e) => onSetFont(e.target.value)}
                className="h-8 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-200 outline-none focus:border-neutral-500"
              >
                {CANVAS_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-neutral-500">
                <span>字号</span>
                <span className="font-mono text-neutral-300">{Math.round(fontSize ?? 28)}px</span>
              </div>
              <input
                type="range"
                min={8}
                max={120}
                step={1}
                value={fontSize ?? 28}
                onChange={(e) => onSetFontSize(Number(e.target.value))}
                className="w-full accent-neutral-300"
              />
            </div>
          </div>
        )}

        {!hideModeToggle && onSetMode && (
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-neutral-900 p-1">
            {(["solid", "gradient"] as PaintMode[]).map((modeOption) => (
              <button
                key={modeOption}
                type="button"
                onClick={() => onSetMode(modeOption)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  paint.mode === modeOption
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-500 hover:text-neutral-200",
                )}
              >
                {modeOption === "solid" ? "纯色" : "沿路径"}
              </button>
            ))}
          </div>
        )}

        <div
          ref={pickerRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pickFromSquare(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 1) return;
            pickFromSquare(event.clientX, event.clientY);
          }}
          className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-md border border-neutral-700/70 shadow-inner"
          style={{
            background: `linear-gradient(to top, #000 0%, rgba(0,0,0,0) 54%, rgba(255,255,255,0.92) 100%), linear-gradient(to right, #ffffff 0%, ${hueColor} 100%)`,
          }}
        >
          <span
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.75)]"
            style={{
              left: `${clamp(activeHsl.s, 0, 100)}%`,
              top: `${100 - clamp(activeHsl.l, 0, 100)}%`,
              backgroundColor: activeHex,
            }}
          />
        </div>

        <div className="mt-3 space-y-2">
          <ColorSlider
            label="H"
            value={Math.round(activeHsl.h)}
            max={360}
            unit="°"
            markerColor={activeHex}
            track="linear-gradient(to right, #f00 0%, #ff0 16.6%, #0f0 33.3%, #0ff 50%, #00f 66.6%, #f0f 83.3%, #f00 100%)"
            onChange={(value) => setActiveHsl({ h: value })}
          />
          <ColorSlider
            label="S"
            value={Math.round(activeHsl.s)}
            max={100}
            unit="%"
            track={`linear-gradient(to right, ${rgbToHex(hslToRgb({ h: activeHsl.h, s: 0, l: activeHsl.l }))}, ${rgbToHex(hslToRgb({ h: activeHsl.h, s: 100, l: activeHsl.l }))})`}
            onChange={(value) => setActiveHsl({ s: value })}
          />
          <ColorSlider
            label="L"
            value={Math.round(activeHsl.l)}
            max={100}
            unit="%"
            track={`linear-gradient(to right, #000 0%, ${hueColor} 50%, #fff 100%)`}
            onChange={(value) => setActiveHsl({ l: value })}
          />
        </div>

        {paint.mode === "gradient" ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
              <span>混合</span>
              <div className="flex rounded-md bg-black/50 p-0.5 tracking-normal">
                {INTERP_SPACES.map((space) => (
                  <button
                    key={space}
                    type="button"
                    onClick={() => onSetSpace(space)}
                    className={cn(
                      "rounded px-2 py-1 font-mono text-[10px] uppercase transition-colors",
                      paint.space === space
                        ? "bg-neutral-700 text-neutral-100"
                        : "text-neutral-500 hover:text-neutral-200",
                    )}
                  >
                    {space === "rgb" ? "RGB" : space.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={listRef}
              className="relative mt-3 rounded-lg border border-neutral-800 bg-neutral-950/70 py-2 touch-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute bottom-7 top-7 z-10 w-px rounded-full bg-neutral-500 transition-opacity duration-200",
                  dragId ? "opacity-0" : "opacity-100",
                )}
                style={{ left: "22px" }}
              />
              {renderStops.map((stop, i) => {
                const isActive = activeStop?.id === stop.id;
                const editingPos = editingPosId === stop.id;
                const editingAlpha = editingAlphaId === stop.id;
                return [
                  i > 0 && (
                    <div
                      key={`gap-${stop.id}`}
                      role="button"
                      tabIndex={0}
                      aria-label="在两色之间添加色标"
                      onClick={() => {
                        // 点击两行之间整条带状区域即在两色标中点插入新色标，
                        // 颜色取该位置插值色，并自动选中以便立即微调。
                        const mid = Math.round((renderStops[i - 1].pos + stop.pos) / 2);
                        const newId = onAddStopAt(mid);
                        if (newId) setActiveStopId(newId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          const mid = Math.round((renderStops[i - 1].pos + stop.pos) / 2);
                          const newId = onAddStopAt(mid);
                          if (newId) setActiveStopId(newId);
                        }
                      }}
                      className="group relative flex h-3 cursor-pointer items-center"
                    >
                      <span className="pointer-events-none absolute left-[22px] top-1/2 z-20 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-neutral-300 opacity-0 transition-opacity group-hover:border-neutral-400 group-hover:text-white group-hover:opacity-100">
                        <Plus className="size-2.5" strokeWidth={3} />
                      </span>
                    </div>
                  ),
                  <ContextMenu key={stop.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        onContextMenu={(e) => setActiveStopId(stop.id)}
                        onPointerDown={(e) => {
                          // 行内抓手区域：按下即选中本行；若随后拖动超容差则进入拖拽调位。
                          // 仅当点中真正的可交互内容（数字/单位/正在编辑的文本、圆点/色块按钮）时才不处理；
                          // 点空白（行 padding、按钮间 gap、hex 列、百分比列的 padding 等）一律走选中/拖拽。
                          if (e.button !== 0) return;
                          const hit = (e.target as HTMLElement).closest(
                            "[data-stop-handle], button",
                          );
                          if (hit) return;
                          setActiveStopId(stop.id);
                          setDragOverId(null);
                          // 冻结拖拽起始顺序，记录被拖行索引与起始槽位
                          const snapshot = sortedStops.map((s) => s.id);
                          dragSnapshotRef.current = snapshot;
                          const pressedIndex = Math.max(0, snapshot.indexOf(stop.id));
                          dragDraggedIndexRef.current = pressedIndex;
                          rowHRef.current = 52;
                          setDropIndex(pressedIndex);
                          setDragCursor(pressedIndex);
                          // 捕获指针，保证移动/抬起事件持续派发到本行（即便指针离开行）
                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch {
                            /* 忽略 */
                          }
                          dragCandidateRef.current = {
                            stopId: stop.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            index: pressedIndex,
                          };
                        }}
                        onPointerMove={(e) => {
                          // 拖拽中：被拖行整行高倍数跟随鼠标（snap 到行槽 + 小数偏移），
                          // 其他行按光标投影到的"插入索引"整体上下平移一行高让位（有 transition 平滑）。
                          const computeDrag = (clientY: number) => {
                            const c = dragCandidateRef.current;
                            if (!c) return;
                            const snapshot = dragSnapshotRef.current ?? [];
                            const n = snapshot.length || 1;
                            const rowH = measureRowUnit();
                            rowHRef.current = rowH;
                            // 被拖行目标槽位（浮点）= 按下槽 + 整行高倍数位移，夹在首尾
                            const target = clamp(c.index + (clientY - c.startY) / rowH, 0, n - 1);
                            const drop = Math.round(target);
                            setDragCursor(target);
                            setDropIndex(drop);
                            // 自定义 pos：按光标在列表中的垂直比例映射到 0..100，再夹到"插入槽两侧色标"的 pos 之间。
                            // 这样一旦拖动让其他行让位（drop 变化），被拖行 pos 必落在两侧让位行的 pos 之间
                            // （上方行的下方、下方行的上方），与视觉排序一致；槽内仍随光标连续变化。
                            const rest = snapshot.filter((id) => id !== stop.id);
                            const list = listRef.current;
                            if (list) {
                              const rect = list.getBoundingClientRect();
                              const pad = rect.height / (n * 2);
                              const ratio = (clientY - (rect.top + pad)) / (rect.height - pad * 2);
                              const rawPos = clamp(Math.round(ratio * 100), 0, 100);
                              const posOf = (id: string | undefined) =>
                                id ? (stops.find((s) => s.id === id)?.pos ?? 0) : 0;
                              const lower = drop > 0 ? posOf(rest[drop - 1]) : -1;
                              const upper = drop < rest.length ? posOf(rest[drop]) : 101;
                              const pos = clamp(rawPos, lower, upper);
                              dropPosRef.current = pos;
                              onStopPos(stop.id, pos);
                            }
                          };
                          if (dragId === stop.id) {
                            computeDrag(e.clientY);
                            return;
                          }
                          // 未进入拖拽：若移动超容差则立即进入拖拽（按下即拖）
                          const c = dragCandidateRef.current;
                          if (!c || c.stopId !== stop.id) return;
                          if (
                            Math.abs(e.clientX - c.startX) > 6 ||
                            Math.abs(e.clientY - c.startY) > 6
                          ) {
                            setDragId(stop.id);
                            computeDrag(e.clientY);
                          }
                        }}
                        onPointerUp={(e) => {
                          // 松手：按视觉插入槽 dropIndex 把被拖行放进数组，并提交其自定义 pos
                          // （pos 已夹在两侧让位行的 pos 之间，故排名与视觉一致；边界平手由数组顺序兜底）。
                          const draggedId = dragId;
                          const snapshot = dragSnapshotRef.current;
                          const pos = dropPosRef.current;
                          const drop = dropIndex;
                          if (draggedId && snapshot && drop >= 0) {
                            const rest = snapshot.filter((id) => id !== draggedId);
                            const at = clamp(drop, 0, rest.length);
                            onDropStop(
                              draggedId,
                              [...rest.slice(0, at), draggedId, ...rest.slice(at)],
                              pos,
                            );
                          }
                          dragCandidateRef.current = null;
                          dragSnapshotRef.current = null;
                          dragDraggedIndexRef.current = -1;
                          dropPosRef.current = 0;
                          setDropIndex(-1);
                          setDragCursor(0);
                          try {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          } catch {
                            /* 忽略 */
                          }
                          if (draggedId) {
                            setDragId(null);
                            setDragOverId(null);
                          }
                        }}
                        onPointerCancel={(e) => {
                          dragCandidateRef.current = null;
                          dragSnapshotRef.current = null;
                          dragDraggedIndexRef.current = -1;
                          setDropIndex(-1);
                          setDragCursor(0);
                          try {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          } catch {
                            /* 忽略 */
                          }
                          if (dragId) {
                            setDragId(null);
                            setDragOverId(null);
                          }
                        }}
                        ref={(el) => {
                          rowRefs.current[stop.id] = el;
                        }}
                        style={(() => {
                          if (!dragId) return undefined;
                          const snapshot = dragSnapshotRef.current ?? [];
                          const pressedIndex =
                            dragDraggedIndexRef.current >= 0
                              ? dragDraggedIndexRef.current
                              : snapshot.indexOf(dragId);
                          const rowH = rowHRef.current;
                          if (dragId === stop.id) {
                            // 被拖行：按下槽 + 整行高倍数位移（无 transition，紧贴鼠标）
                            return {
                              transform: `translateY(${(dragCursor - pressedIndex) * rowH}px)`,
                              zIndex: 20,
                              transition: "none",
                            };
                          }
                          // 其他行：处于按下槽与目标槽之间者整体平移一行高让位（有 transition 平滑）
                          const from = pressedIndex;
                          const to = dropIndex >= 0 ? dropIndex : from;
                          const idx = snapshot.indexOf(stop.id);
                          const between =
                            from !== to && ((idx >= to && idx < from) || (idx > from && idx <= to));
                          const dir = to > from ? -1 : 1; // 被拖行下移→其他行上移(-1)，反之 +1
                          return {
                            transform: between ? `translateY(${dir * rowH}px)` : "translateY(0px)",
                            transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                          };
                        })()}
                        className={cn(
                          "relative mx-1 grid min-h-10 grid-cols-[20px_52px_26px_1fr_52px] items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                          dragId === stop.id
                            ? "cursor-grabbing shadow-xl ring-1 ring-neutral-700"
                            : "cursor-grab",
                          isActive ? "bg-neutral-900/80" : "hover:bg-neutral-900/50",
                          dragOverId === stop.id &&
                            dragId !== stop.id &&
                            "ring-1 ring-inset ring-neutral-400",
                        )}
                      >
                        {/* 选择圆点 + 连接相邻圆点的竖线 */}
                        <div className="relative mx-auto h-6 w-5">
                          <button
                            type="button"
                            onClick={() => setActiveStopId(stop.id)}
                            className={cn(
                              "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                              isActive
                                ? "size-3.5 border-white bg-white shadow-[0_0_0_2px_rgb(0_0_0/0.75)]"
                                : "size-3 border-neutral-400 bg-neutral-950 shadow-[0_0_0_1px_rgb(0_0_0/0.75)]",
                            )}
                            aria-label="选择色标"
                          />
                        </div>

                        {/* 位置 %：拖拽中直接显示随鼠标移动实时变化的当前值（只读），与平时数值样式一致；
                            否则原地全选编辑，% 始终显示。无任何动画，数值随鼠标移动即时更新。 */}
                        {dragId === stop.id ? (
                          <span
                            className="flex h-6 items-center justify-end gap-0.5 rounded px-1 font-mono text-xs font-semibold text-neutral-200"
                            aria-label="位置百分比"
                          >
                            <span className="tabular-nums">{Math.round(stop.pos)}</span>
                            <span className="text-[9px] text-neutral-500">%</span>
                          </span>
                        ) : (
                          renderEditablePercent(
                            stop.pos,
                            editingPos,
                            () => {
                              setActiveStopId(stop.id);
                              setEditingPosId(stop.id);
                            },
                            (v) => onStopPos(stop.id, v),
                            () => setEditingPosId(null),
                            "right",
                          )
                        )}

                        {/* 颜色方块（选中白框）：外框 rounded-[5px] + inset 3px + 内色块 rounded-[2px]
                            满足 外圆角 = inset + 内圆角 (5 = 3 + 2)，圆角同心，色块在白框内视觉居中 */}
                        <button
                          type="button"
                          onClick={() => setActiveStopId(stop.id)}
                          className={cn(
                            "relative size-6 shrink-0 rounded-[5px] border-2 bg-transparent",
                            isActive ? "border-white" : "border-transparent",
                          )}
                          aria-label="选择色标"
                        >
                          <span
                            className="absolute inset-[3px] rounded-[2px]"
                            style={{ backgroundColor: hexAlphaToCss(stop.hex, stop.alpha) }}
                          />
                        </button>

                        {/* hex 编码 */}
                        <span className="min-w-0 truncate font-mono text-[11px] text-neutral-400">
                          {stop.hex.toUpperCase()}
                        </span>

                        {/* 透明度 %：最右侧，原地全选编辑 */}
                        {renderEditablePercent(
                          stop.alpha,
                          editingAlpha,
                          () => {
                            setActiveStopId(stop.id);
                            setEditingAlphaId(stop.id);
                          },
                          (v) => onStopAlpha(stop.id, v),
                          () => setEditingAlphaId(null),
                          "right",
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => onDuplicateStop(stop.id)}>
                        复制
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => onCopyHex(stop.id)}>
                        复制 hex 值
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={sortedStops.length <= 2}
                        onSelect={() => onDeleteStop(stop.id)}
                      >
                        删除
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>,
                ];
              })}
            </div>
          </>
        ) : (
          onSetSolid && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-2">
              <span
                className="size-8 rounded-md border border-neutral-700"
                style={{ backgroundColor: paint.solid }}
              />
              <input
                value={paint.solid.toUpperCase()}
                onChange={(event) => {
                  const normalized = normalizeHex(event.target.value);
                  if (normalized) onSetSolid(normalized);
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-neutral-800 bg-black/30 px-2 font-mono text-xs text-neutral-100 outline-none focus:border-neutral-500"
                aria-label="HEX 颜色值"
              />
            </div>
          )
        )}
      </div>

      {extra}
    </div>
  );
}
