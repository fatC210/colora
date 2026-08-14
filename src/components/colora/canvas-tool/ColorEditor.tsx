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
  onCopyHex,
  onAddStop,
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
  onCopyHex: (stopId: string) => void;
  onAddStop: () => void;
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

            <div className="relative mt-3 rounded-lg border border-neutral-800 bg-neutral-950/70 py-2">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-7 left-5 top-7 z-0 w-px rounded-full bg-neutral-500"
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
                        className={cn(
                          "relative grid min-h-14 grid-cols-[24px_minmax(54px,1fr)_28px_minmax(54px,1fr)] items-center gap-2 px-2 py-2 text-xs transition-colors cursor-default",
                          isActive ? "bg-neutral-900/80" : "hover:bg-neutral-900/50",
                        )}
                      >
                        {/* 选择圆点 + 连接相邻圆点的竖线 */}
                        <div className="relative mx-auto h-7 w-6">
                          <button
                            type="button"
                            onClick={() => setActiveStopId(stop.id)}
                            className={cn(
                              "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                              isActive
                                ? "size-4 border-white bg-white shadow-[0_0_0_2px_rgb(0_0_0/0.75)]"
                                : "size-3.5 border-neutral-400 bg-neutral-950 shadow-[0_0_0_1px_rgb(0_0_0/0.75)]",
                            )}
                            aria-label="选择色标"
                          />
                        </div>

                        {/* 位置 % */}
                        {editingPos ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            autoFocus
                            defaultValue={Math.round(stop.pos)}
                            ref={(el) => {
                              el?.focus();
                              el?.select();
                            }}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) onStopPos(stop.id, v);
                              setEditingPosId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = Number(e.currentTarget.value);
                                if (Number.isFinite(v)) onStopPos(stop.id, v);
                                setEditingPosId(null);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingPosId(null);
                              }
                            }}
                            className="h-7 w-full appearance-none rounded-md border border-neutral-700 bg-black/30 px-1 text-right font-mono text-sm font-semibold text-neutral-100 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="色标位置百分比"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveStopId(stop.id);
                              setEditingPosId(stop.id);
                            }}
                            className="flex items-baseline justify-end gap-0.5 rounded px-0.5 py-0.5 text-right font-mono text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
                            aria-label="编辑位置"
                          >
                            <span>{Math.round(stop.pos)}</span>
                            <span className="text-[9px] text-neutral-500">%</span>
                          </button>
                        )}

                        {/* 颜色方块（选中白框） */}
                        <button
                          type="button"
                          onClick={() => setActiveStopId(stop.id)}
                          className={cn(
                            "grid size-7 place-items-center rounded-[5px] border-2 bg-transparent p-[3px]",
                            isActive ? "border-white" : "border-transparent",
                          )}
                          aria-label="选择色标"
                        >
                          <span
                            className="size-full rounded-[2px]"
                            style={{ backgroundColor: hexAlphaToCss(stop.hex, stop.alpha) }}
                          />
                        </button>

                        {/* 透明度 % */}
                        {editingAlpha ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            autoFocus
                            defaultValue={Math.round(stop.alpha)}
                            ref={(el) => {
                              el?.focus();
                              el?.select();
                            }}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) onStopAlpha(stop.id, v);
                              setEditingAlphaId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = Number(e.currentTarget.value);
                                if (Number.isFinite(v)) onStopAlpha(stop.id, v);
                                setEditingAlphaId(null);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingAlphaId(null);
                              }
                            }}
                            className="h-7 w-full appearance-none rounded-md border border-neutral-700 bg-black/30 px-1 text-right font-mono text-sm font-semibold text-neutral-100 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="色标透明度百分比"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveStopId(stop.id);
                              setEditingAlphaId(stop.id);
                            }}
                            className="flex items-baseline justify-end gap-0.5 rounded px-0.5 py-0.5 text-right font-mono text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
                            aria-label="编辑透明度"
                          >
                            <span>{Math.round(stop.alpha)}</span>
                            <span className="text-[9px] text-neutral-500">%</span>
                          </button>
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
