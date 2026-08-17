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
import { INTERP_SPACES } from "./constants";
import { clamp } from "./utils";
import { ColorSlider } from "./ColorSlider";
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
  onAddStop,
  onReorderStops,
  onSetSpace,
  onSetMode,
  onSetSolid,
  onReverse,
  hideModeToggle,
  extra,
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
  onAddStop: () => void;
  onReorderStops: (fromId: string, toId: string) => void;
  onSetSpace: (space: InterpSpace) => void;
  onSetMode?: (mode: PaintMode) => void;
  onSetSolid?: (hex: string) => void;
  onReverse?: () => void;
  hideModeToggle?: boolean;
  extra?: React.ReactNode;
}) {
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editingAlphaId, setEditingAlphaId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<{ timer: ReturnType<typeof setTimeout>; startX: number; startY: number; stopId: string } | null>(null);

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
  const activeStop = sortedStops.find((stop) => stop.id === activeStopId) ?? sortedStops[0];
  const activeHex = paint.mode === "solid" ? paint.solid : activeStop?.hex ?? paint.solid;
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
            <button
              type="button"
              onClick={onReverse}
              title="翻转颜色顺序"
              aria-label="翻转颜色顺序"
              className="inline-flex size-7 items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100"
            >
              <ArrowUpDown className="size-3.5" />
            </button>
          )}
        </div>

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
            style={{ left: `${clamp(activeHsl.s, 0, 100)}%`, top: `${100 - clamp(activeHsl.l, 0, 100)}%`, backgroundColor: activeHex }}
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

            <div ref={listRef} className="relative mt-3 rounded-lg border border-neutral-800 bg-neutral-950/70 py-2 touch-none">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-7 top-7 z-10 w-px rounded-full bg-neutral-500"
                style={{ left: "18px" }}
              />
              {sortedStops.map((stop, i) => {
                const isActive = activeStop?.id === stop.id;
                const editingPos = editingPosId === stop.id;
                const editingAlpha = editingAlphaId === stop.id;
                return (
                  <ContextMenu key={stop.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        onContextMenu={(e) => setActiveStopId(stop.id)}
                        onPointerDown={(e) => {
                          // 长按行任意空白区域 400ms 后进入拖拽调位模式。
                          // 仅当点中真正的可交互内容（数字/单位/正在编辑的文本、圆点/色块按钮）时才不拖；
                          // 点空白（行 padding、按钮间 gap、hex 列、百分比列的 padding 等）一律可拖。
                          if (e.button !== 0) return;
                          const hit = (e.target as HTMLElement).closest("[data-stop-handle], button");
                          if (hit) return;
                          setActiveStopId(stop.id);
                          // 捕获指针，保证移动/抬起事件持续派发到本行（即便指针离开行）
                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch {
                            /* 忽略 */
                          }
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const timer = setTimeout(() => {
                            longPressTimerRef.current = null;
                            setDragId(stop.id);
                          }, 400);
                          longPressTimerRef.current = { timer, startX, startY, stopId: stop.id };
                        }}
                        onPointerMove={(e) => {
                          const lp = longPressTimerRef.current;
                          // 拖拽中：把被拖色标的 pos 实时设为指针在列表中的垂直百分比。
                          // pos 即位置，顺序由 pos 自动决定 —— 垂直拖同时调整顺序与具体位置。
                          if (dragId === stop.id) {
                            const list = listRef.current;
                            if (!list) return;
                            const rect = list.getBoundingClientRect();
                            // 列表上下各留半行高作为缓冲，使首尾能到 0%/100%
                            const pad = rect.height / (sortedStops.length * 2);
                            const ratio = (e.clientY - (rect.top + pad)) / (rect.height - pad * 2);
                            const pos = clamp(Math.round(ratio * 100), 0, 100);
                            onStopPos(stop.id, pos);
                            // 同时根据指针 Y 计算悬停行，给重排视觉反馈
                            const rows = Object.entries(rowRefs.current)
                              .map(([id, el]) => (el ? { id, mid: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 } : null))
                              .filter(Boolean) as { id: string; mid: number }[];
                            let targetId: string | null = null;
                            for (let k = 0; k < rows.length - 1; k++) {
                              if (e.clientY >= rows[k].mid && e.clientY < rows[k + 1].mid) {
                                targetId = rows[k + 1].id;
                                break;
                              }
                            }
                            if (!targetId && rows.length) {
                              if (e.clientY < rows[0].mid) targetId = rows[0].id;
                              else targetId = rows[rows.length - 1].id;
                            }
                            setDragOverId(targetId);
                            return;
                          }
                          // 未进入拖拽：若移动超容差则取消长按
                          if (!lp) return;
                          if (Math.abs(e.clientX - lp.startX) > 6 || Math.abs(e.clientY - lp.startY) > 6) {
                            clearTimeout(lp.timer);
                            longPressTimerRef.current = null;
                          }
                        }}
                        onPointerUp={(e) => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current.timer);
                            longPressTimerRef.current = null;
                          }
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
                        onPointerCancel={(e) => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current.timer);
                            longPressTimerRef.current = null;
                          }
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
                        className={cn(
                          "relative grid min-h-10 grid-cols-[20px_52px_26px_1fr_52px] items-center gap-1.5 px-2 py-1.5 text-xs transition-colors",
                          dragId === stop.id ? "cursor-grabbing opacity-40" : dragId ? "cursor-grab" : "cursor-default",
                          isActive ? "bg-neutral-900/80" : "hover:bg-neutral-900/50",
                          dragOverId === stop.id && dragId !== stop.id && "ring-1 ring-inset ring-neutral-400",
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

                        {/* 位置 %：原地全选编辑，% 始终显示 */}
                        {renderEditablePercent(
                          stop.pos,
                          editingPos,
                          () => {
                            setActiveStopId(stop.id);
                            setEditingPosId(stop.id);
                          },
                          (v) => onStopPos(stop.id, v),
                          () => setEditingPosId(null),
                          "right",
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
                  </ContextMenu>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onAddStop}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-800 py-1.5 text-[11px] text-neutral-500 hover:border-neutral-600 hover:text-neutral-200"
            >
              <Plus className="size-3" /> 添加
            </button>
          </>
        ) : (
          onSetSolid && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-2">
              <span className="size-8 rounded-md border border-neutral-700" style={{ backgroundColor: paint.solid }} />
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
