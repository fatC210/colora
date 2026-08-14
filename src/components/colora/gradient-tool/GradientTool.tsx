import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Settings2,
  Code2,
  Trash2,
  ChevronDown,
  Heart,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useColora, type GradientConfig, type GradientStop } from "@/lib/colora-store";
import { interpolate, randomHex, simulateCB, type CBMode, type InterpSpace } from "@/lib/color";
import { ColorPicker, CopyButton, InlineRename, Tip } from "../primitives";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportDialog } from "../ExportDialog";
import { GRADIENT_LINE_RADIUS, MESH_POINTS, TYPES } from "./constants";
import type { GradType, MeshPoint } from "./constants";
import {
  clampPercent,
  cloneConfig,
  cloneStops,
  createStopId,
  getNextStopPosition,
  gradientPreviewStyle,
  meshPointFor,
} from "./utils";

export function GradientTool() {
  const {
    gradientStops,
    setGradientStops,
    setColor,
    cbMode,
    gradientConfig,
    setGradientConfig,
    favoriteGradients,
    saveGradient,
    removeGradient,
    renameGradient,
    user,
  } = useColora();
  const [type, setType] = useState<GradType>(gradientConfig.type);
  const [angle, setAngle] = useState(gradientConfig.angle);
  const [space, setSpace] = useState<InterpSpace>(gradientConfig.space);
  const [gradientCenter, setGradientCenter] = useState<MeshPoint>(gradientConfig.center);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [showCtrl, setShowCtrl] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showStops, setShowStops] = useState(true);
  const [editingGradientId, setEditingGradientId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const stops = [...gradientStops].sort((a, b) => a.pos - b.pos);

  useEffect(() => {
    setGradientConfig({ type, angle, space, center: gradientCenter });
  }, [angle, gradientCenter, setGradientConfig, space, type]);

  const stopList = useMemo(() => {
    if (space === "rgb")
      return stops.map((s) => `${simulateCB(s.hex, cbMode)} ${Math.round(s.pos)}%`).join(", ");
    // sample interpolation in perceptual space
    const out: string[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      for (let t = 0; t <= 8; t++) {
        const p = stops[i].pos + ((stops[i + 1].pos - stops[i].pos) * t) / 8;
        out.push(
          `${simulateCB(interpolate(stops[i].hex, stops[i + 1].hex, t / 8, space), cbMode)} ${p.toFixed(1)}%`,
        );
      }
    }
    return out.join(", ");
  }, [stops, space, cbMode]);

  const css =
    type === "linear"
      ? `linear-gradient(${angle}deg, ${stopList})`
      : type === "radial"
        ? `radial-gradient(circle at ${gradientCenter.x}% ${gradientCenter.y}%, ${stopList})`
        : type === "conic"
          ? `conic-gradient(from ${angle}deg at ${gradientCenter.x}% ${gradientCenter.y}%, ${stopList})`
          : undefined;

  const meshStyle = {
    backgroundColor: stops[0]?.hex,
    backgroundImage: stops
      .map((stop, stopIndex) => {
        const meshPoint = meshPointFor(stop, stopIndex);
        return `radial-gradient(at ${meshPoint.x}% ${meshPoint.y}%, ${simulateCB(stop.hex, cbMode)} 0px, transparent 55%)`;
      })
      .join(", "),
  };

  const setStop = (id: string, patch: Partial<GradientStop>) =>
    setGradientStops((currentStops) =>
      currentStops.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)),
    );

  const setMeshPoint = (id: string, index: number, patch: Partial<MeshPoint>) => {
    const current = meshPointFor(stops[index], index);
    setStop(id, { mesh: { ...current, ...patch } });
  };

  const updateMeshPointFromPointer = (
    id: string,
    index: number,
    pointerX: number,
    pointerY: number,
  ) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMeshPoint(id, index, {
      x: Math.round(clampPercent(((pointerX - rect.left) / rect.width) * 100)),
      y: Math.round(clampPercent(((pointerY - rect.top) / rect.height) * 100)),
    });
  };

  const updateGradientCenterFromPointer = (pointerX: number, pointerY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    setGradientCenter({
      x: Math.round(clampPercent(((pointerX - rect.left) / rect.width) * 100)),
      y: Math.round(clampPercent(((pointerY - rect.top) / rect.height) * 100)),
    });
  };

  const updateAngleFromPointer = (pointerX: number, pointerY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 屏幕坐标系：atan2(dy, dx) 给出从正右顺时针的数学角；
    // CSS 渐变角 0° = 正上、顺时针增大，故 +90° 偏移。
    const mathAngle = Math.atan2(pointerY - cy, pointerX - cx);
    const cssAngle = ((mathAngle * 180) / Math.PI + 90 + 360) % 360;
    setAngle(Math.round(cssAngle));
  };

  // linear 模式：把指针投影到渐变方向线上，得到 pos%
  const updateStopPosAlongGradient = (pointerX: number, pointerY: number, id: string) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dirX = Math.cos(angleMathRad);
    const dirY = Math.sin(angleMathRad);
    const proj = (pointerX - cx) * dirX + (pointerY - cy) * dirY;
    const pos = ((proj / GRADIENT_LINE_RADIUS + 1) / 2) * 100;
    setStop(id, { pos: Math.round(clampPercent(pos)) });
  };

  // conic 角度绕渐变中心（与 linear 绕预览中心不同）
  const updateConicAngleFromPointer = (pointerX: number, pointerY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + (gradientCenter.x / 100) * rect.width;
    const cy = rect.top + (gradientCenter.y / 100) * rect.height;
    const mathAngle = Math.atan2(pointerY - cy, pointerX - cx);
    const cssAngle = ((mathAngle * 180) / Math.PI + 90 + 360) % 360;
    setAngle(Math.round(cssAngle));
  };

  // radial：停止点沿径向分布，按到中心的距离换算 pos%
  const updateRadialStopFromPointer = (pointerX: number, pointerY: number, id: string) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + (gradientCenter.x / 100) * rect.width;
    const cy = rect.top + (gradientCenter.y / 100) * rect.height;
    const dist = Math.hypot(pointerX - cx, pointerY - cy);
    const radius = Math.min(rect.width, rect.height) * 0.45;
    setStop(id, { pos: Math.round(clampPercent((dist / radius) * 100)) });
  };

  // conic：停止点沿圆周分布，按相对起始角的角度换算 pos%
  const updateConicStopFromPointer = (pointerX: number, pointerY: number, id: string) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + (gradientCenter.x / 100) * rect.width;
    const cy = rect.top + (gradientCenter.y / 100) * rect.height;
    const mathAngle = Math.atan2(pointerY - cy, pointerX - cx);
    const pointerCssAngle = ((mathAngle * 180) / Math.PI + 90 + 360) % 360;
    let delta = pointerCssAngle - angle;
    delta = ((delta % 360) + 360) % 360;
    setStop(id, { pos: Math.round(clampPercent((delta / 360) * 100)) });
  };

  // 拖动节流：pointermove 高频触发，用 rAF 合并到每帧一次 setState，
  // 避免频繁重渲染整棵组件导致掉帧/断触。
  const dragRafRef = useRef(0);
  const dragInfoRef = useRef<
    | { mode: "mesh"; id: string; index: number; x: number; y: number }
    | { mode: "posAlong"; id: string; x: number; y: number }
    | { mode: "radialPos"; id: string; x: number; y: number }
    | { mode: "conicPos"; id: string; x: number; y: number }
    | { mode: "center"; x: number; y: number }
    | { mode: "angle"; x: number; y: number }
    | { mode: "conicAngle"; x: number; y: number }
    | null
  >(null);

  const flushDrag = () => {
    dragRafRef.current = 0;
    const info = dragInfoRef.current;
    if (!info) return;
    if (info.mode === "mesh") updateMeshPointFromPointer(info.id, info.index, info.x, info.y);
    else if (info.mode === "posAlong") updateStopPosAlongGradient(info.x, info.y, info.id);
    else if (info.mode === "radialPos") updateRadialStopFromPointer(info.x, info.y, info.id);
    else if (info.mode === "conicPos") updateConicStopFromPointer(info.x, info.y, info.id);
    else if (info.mode === "center") updateGradientCenterFromPointer(info.x, info.y);
    else if (info.mode === "conicAngle") updateConicAngleFromPointer(info.x, info.y);
    else updateAngleFromPointer(info.x, info.y);
  };

  const scheduleDrag = () => {
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(flushDrag);
  };

  // 进度条（range）拖动节流：合并高频 onChange 到每帧一次 setState，
  // 减少移动端拖动时整棵组件重渲染导致的卡顿。
  const rangeRafRef = useRef(0);
  const rangePendingRef = useRef<(() => void) | null>(null);
  const scheduleRangeUpdate = (apply: () => void) => {
    rangePendingRef.current = apply;
    if (rangeRafRef.current) return;
    rangeRafRef.current = requestAnimationFrame(() => {
      rangeRafRef.current = 0;
      rangePendingRef.current?.();
      rangePendingRef.current = null;
    });
  };

  useEffect(
    () => () => {
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
      if (rangeRafRef.current) cancelAnimationFrame(rangeRafRef.current);
    },
    [],
  );

  const currentConfig: GradientConfig = { type, angle, space, center: gradientCenter };

  // 渐变方向线的数学角（CSS 角 0°=正上、顺时针 → 数学角 = CSS角 - 90°）
  const angleMathRad = ((angle - 90) * Math.PI) / 180;

  const favoriteCurrentGradient = () => {
    saveGradient(`渐变 ${favoriteGradients.length + 1}`, stops, currentConfig);
  };

  const applyGradient = (stopsToApply: GradientStop[], configToApply: GradientConfig) => {
    const nextConfig = cloneConfig(configToApply);
    setType(nextConfig.type);
    setAngle(nextConfig.angle);
    setSpace(nextConfig.space);
    setGradientCenter(nextConfig.center);
    setGradientStops(cloneStops(stopsToApply));
    setGradientConfig(nextConfig);
  };

  return (
    <div className="space-y-4">
      <Tabs value={type} onValueChange={(v) => setType(v as GradType)}>
        <TabsList>
          {TYPES.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="panel p-5">
        <div
          ref={previewRef}
          className="relative h-[380px] w-full touch-none overflow-hidden rounded-xl border border-border/60"
          style={type === "mesh" ? meshStyle : { backgroundImage: css }}
        >
          <button
            type="button"
            onClick={() => setShowStops((s) => !s)}
            aria-label={showStops ? "隐藏圆点" : "显示圆点"}
            aria-pressed={!showStops}
            className="absolute right-3 top-3 z-40 grid size-8 place-items-center rounded-full bg-background/85 text-muted-foreground shadow-sm ring-1 ring-inset ring-foreground/25 backdrop-blur transition-colors hover:bg-background hover:text-foreground"
          >
            {showStops ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>

          {showStops &&
            type === "mesh" &&
            stops.map((stop, stopIndex) => {
              const meshPoint = meshPointFor(stop, stopIndex);
              return (
                <button
                  key={stop.id}
                  type="button"
                  className="absolute size-6 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border),0_8px_24px_rgb(0_0_0/0.22)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    left: `${meshPoint.x}%`,
                    top: `${meshPoint.y}%`,
                    backgroundColor: simulateCB(stop.hex, cbMode),
                    pointerEvents:
                      draggingStopId && draggingStopId !== stop.id ? "none" : undefined,
                    zIndex: draggingStopId === stop.id ? 30 : 10,
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingStopId(stop.id);
                    dragInfoRef.current = {
                      mode: "mesh",
                      id: stop.id,
                      index: stopIndex,
                      x: event.clientX,
                      y: event.clientY,
                    };
                    flushDrag();
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons !== 1) return;
                    dragInfoRef.current = {
                      mode: "mesh",
                      id: stop.id,
                      index: stopIndex,
                      x: event.clientX,
                      y: event.clientY,
                    };
                    scheduleDrag();
                  }}
                  onPointerUp={() => {
                    setDraggingStopId(null);
                    dragInfoRef.current = null;
                  }}
                  onPointerCancel={() => {
                    setDraggingStopId(null);
                    dragInfoRef.current = null;
                  }}
                  onLostPointerCapture={() => {
                    setDraggingStopId(null);
                    dragInfoRef.current = null;
                  }}
                  aria-label={`调整团块 ${stopIndex + 1} 位置`}
                />
              );
            })}
          {showStops && (type === "radial" || type === "conic") && (
            <button
              type="button"
              className="absolute size-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-background bg-foreground/80 shadow-[0_0_0_1px_var(--color-border),0_10px_28px_rgb(0_0_0/0.24)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${gradientCenter.x}%`, top: `${gradientCenter.y}%` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragInfoRef.current = { mode: "center", x: event.clientX, y: event.clientY };
                flushDrag();
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                dragInfoRef.current = { mode: "center", x: event.clientX, y: event.clientY };
                scheduleDrag();
              }}
              onPointerUp={() => {
                dragInfoRef.current = null;
              }}
              onPointerCancel={() => {
                dragInfoRef.current = null;
              }}
              aria-label="调整渐变中心位置"
            />
          )}
          {showStops && type === "linear" && (
            <>
              {/* 渐变方向线：拖动线条本身旋转即可调整角度（手柄不承担角度） */}
              <div
                className="absolute left-1/2 top-1/2 cursor-grab touch-none rounded-full"
                style={{
                  width: GRADIENT_LINE_RADIUS * 2,
                  height: 16,
                  transform: `translate(-50%, -50%) rotate(${angleMathRad}rad)`,
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragInfoRef.current = { mode: "angle", x: event.clientX, y: event.clientY };
                  flushDrag();
                }}
                onPointerMove={(event) => {
                  if (event.buttons !== 1) return;
                  dragInfoRef.current = { mode: "angle", x: event.clientX, y: event.clientY };
                  scheduleDrag();
                }}
                onPointerUp={() => {
                  dragInfoRef.current = null;
                }}
                onPointerCancel={() => {
                  dragInfoRef.current = null;
                }}
                aria-label={`拖动调整渐变角度，当前 ${angle}°`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/30" />
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                  {angle}°
                </span>
              </div>
              {stops.map((stop, stopIndex) => {
                // 停止点沿渐变方向线分布：pos 0→-R，pos 100→+R
                const t = (stop.pos - 50) / 50;
                const dx = t * GRADIENT_LINE_RADIUS * Math.cos(angleMathRad);
                const dy = t * GRADIENT_LINE_RADIUS * Math.sin(angleMathRad);
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className="absolute size-5 touch-none rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border),0_8px_24px_rgb(0_0_0/0.18)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      left: `calc(50% + ${dx}px - 10px)`,
                      top: `calc(50% + ${dy}px - 10px)`,
                      backgroundColor: simulateCB(stop.hex, cbMode),
                      pointerEvents:
                        draggingStopId && draggingStopId !== stop.id ? "none" : undefined,
                      zIndex: draggingStopId === stop.id ? 30 : 10,
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingStopId(stop.id);
                      dragInfoRef.current = {
                        mode: "posAlong",
                        id: stop.id,
                        x: event.clientX,
                        y: event.clientY,
                      };
                      flushDrag();
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons !== 1) return;
                      dragInfoRef.current = {
                        mode: "posAlong",
                        id: stop.id,
                        x: event.clientX,
                        y: event.clientY,
                      };
                      scheduleDrag();
                    }}
                    onPointerUp={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    onPointerCancel={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    onLostPointerCapture={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    aria-label={`调整节点 ${stopIndex + 1} 位置`}
                  />
                );
              })}
            </>
          )}
          {showStops && type === "radial" && (
            <>
              {/* 径向方向线（固定方向，仅作径向距离参考） */}
              <div
                className="pointer-events-none absolute h-px origin-left bg-foreground/25"
                style={{
                  left: `${gradientCenter.x}%`,
                  top: `${gradientCenter.y}%`,
                  width: GRADIENT_LINE_RADIUS,
                  transform: `rotate(${-Math.PI / 4}rad)`,
                }}
                aria-hidden="true"
              />
              {stops.map((stop, stopIndex) => {
                // 停止点沿径向线分布：pos 0→center，pos 100→R
                const t = stop.pos / 100;
                const dx = t * GRADIENT_LINE_RADIUS * Math.cos(-Math.PI / 4);
                const dy = t * GRADIENT_LINE_RADIUS * Math.sin(-Math.PI / 4);
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className="absolute size-5 touch-none rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border),0_8px_24px_rgb(0_0_0/0.18)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      left: `calc(${gradientCenter.x}% + ${dx}px - 10px)`,
                      top: `calc(${gradientCenter.y}% + ${dy}px - 10px)`,
                      backgroundColor: simulateCB(stop.hex, cbMode),
                      pointerEvents:
                        draggingStopId && draggingStopId !== stop.id ? "none" : undefined,
                      zIndex: draggingStopId === stop.id ? 30 : 10,
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingStopId(stop.id);
                      dragInfoRef.current = {
                        mode: "radialPos",
                        id: stop.id,
                        x: event.clientX,
                        y: event.clientY,
                      };
                      flushDrag();
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons !== 1) return;
                      dragInfoRef.current = {
                        mode: "radialPos",
                        id: stop.id,
                        x: event.clientX,
                        y: event.clientY,
                      };
                      scheduleDrag();
                    }}
                    onPointerUp={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    onPointerCancel={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    onLostPointerCapture={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    aria-label={`调整节点 ${stopIndex + 1} 位置`}
                  />
                );
              })}
            </>
          )}
          {showStops && type === "conic" && (
            <>
              {/* 圆周参考线 */}
              <div
                className="pointer-events-none absolute rounded-full border border-foreground/20"
                style={{
                  left: `calc(${gradientCenter.x}% - ${GRADIENT_LINE_RADIUS}px)`,
                  top: `calc(${gradientCenter.y}% - ${GRADIENT_LINE_RADIUS}px)`,
                  width: GRADIENT_LINE_RADIUS * 2,
                  height: GRADIENT_LINE_RADIUS * 2,
                }}
                aria-hidden="true"
              />
              {/* 起始方向线：拖动旋转调起始角度 */}
              <div
                className="absolute cursor-grab touch-none"
                style={{
                  left: `${gradientCenter.x}%`,
                  top: `calc(${gradientCenter.y}% - 8px)`,
                  width: GRADIENT_LINE_RADIUS,
                  height: 16,
                  transformOrigin: "left center",
                  transform: `rotate(${angleMathRad}rad)`,
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragInfoRef.current = { mode: "conicAngle", x: event.clientX, y: event.clientY };
                  flushDrag();
                }}
                onPointerMove={(event) => {
                  if (event.buttons !== 1) return;
                  dragInfoRef.current = { mode: "conicAngle", x: event.clientX, y: event.clientY };
                  scheduleDrag();
                }}
                onPointerUp={() => {
                  dragInfoRef.current = null;
                }}
                onPointerCancel={() => {
                  dragInfoRef.current = null;
                }}
                aria-label={`拖动调整起始角度，当前 ${angle}°`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/30" />
                <span className="pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                  {angle}°
                </span>
              </div>
              {stops.map((stop, stopIndex) => {
                // 停止点沿圆周分布：角度 = 起始角 + pos% * 360°
                const stopMathRad = angleMathRad + (stop.pos / 100) * Math.PI * 2;
                const dx = GRADIENT_LINE_RADIUS * Math.cos(stopMathRad);
                const dy = GRADIENT_LINE_RADIUS * Math.sin(stopMathRad);
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className="absolute size-5 touch-none rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border),0_8px_24px_rgb(0_0_0/0.18)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      left: `calc(${gradientCenter.x}% + ${dx}px - 10px)`,
                      top: `calc(${gradientCenter.y}% + ${dy}px - 10px)`,
                      backgroundColor: simulateCB(stop.hex, cbMode),
                      pointerEvents:
                        draggingStopId && draggingStopId !== stop.id ? "none" : undefined,
                      zIndex: draggingStopId === stop.id ? 30 : 10,
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingStopId(stop.id);
                      dragInfoRef.current = {
                        mode: "conicPos",
                        id: stop.id,
                        x: event.clientX,
                        y: event.clientY,
                      };
                      flushDrag();
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons !== 1) return;
                      dragInfoRef.current = {
                        mode: "conicPos",
                        id: stop.id,
                        x: event.clientX,
                        y: event.clientY,
                      };
                      scheduleDrag();
                    }}
                    onPointerUp={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    onPointerCancel={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    onLostPointerCapture={() => {
                      setDraggingStopId(null);
                      dragInfoRef.current = null;
                    }}
                    aria-label={`调整节点 ${stopIndex + 1} 位置`}
                  />
                );
              })}
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {stops.map((stop, stopIndex) => {
              const meshPoint = meshPointFor(stop, stopIndex);
              return (
                <div key={stop.id} className="flex items-center gap-1">
                  <Popover>
                    <Tip label={`节点 ${stopIndex + 1}`}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="size-7 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border)]"
                          style={{ backgroundColor: simulateCB(stop.hex, cbMode) }}
                          onDoubleClick={() => setColor(stop.hex)}
                          aria-label={`节点 ${stopIndex + 1}`}
                        />
                      </PopoverTrigger>
                    </Tip>
                    <PopoverContent className="w-64 space-y-3">
                      <ColorPicker value={stop.hex} onChange={(hex) => setStop(stop.id, { hex })} />
                      <div>
                        <label className="text-xs text-muted-foreground">
                          {type === "mesh" ? "线性位置" : "位置"} {Math.round(stop.pos)}%
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={stop.pos}
                          onChange={(event) => {
                            const v = Number(event.target.value);
                            scheduleRangeUpdate(() => setStop(stop.id, { pos: v }));
                          }}
                          className="w-full accent-foreground"
                        />
                      </div>
                      {type === "mesh" && (
                        <div className="grid gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground">
                              团块 X {Math.round(meshPoint.x)}%
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={meshPoint.x}
                              onChange={(event) => {
                                const v = Number(event.target.value);
                                scheduleRangeUpdate(() =>
                                  setMeshPoint(stop.id, stopIndex, { x: v }),
                                );
                              }}
                              className="w-full accent-foreground"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">
                              团块 Y {Math.round(meshPoint.y)}%
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={meshPoint.y}
                              onChange={(event) => {
                                const v = Number(event.target.value);
                                scheduleRangeUpdate(() =>
                                  setMeshPoint(stop.id, stopIndex, { y: v }),
                                );
                              }}
                              className="w-full accent-foreground"
                            />
                          </div>
                        </div>
                      )}
                      {stops.length > 2 && (
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() =>
                            setGradientStops((currentStops) =>
                              currentStops.filter((currentStop) => currentStop.id !== stop.id),
                            )
                          }
                        >
                          <Trash2 className="size-4" /> 删除节点
                        </Button>
                      )}
                    </PopoverContent>
                  </Popover>
                  {stopIndex < stops.length - 1 && <span className="h-px w-8 bg-border" />}
                </div>
              );
            })}
          </div>

          {user && (
            <Button className="gap-2" onClick={favoriteCurrentGradient}>
              <Heart className="size-4" /> 收藏当前渐变
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              setGradientStops([
                ...stops,
                {
                  id: createStopId(),
                  hex: randomHex(),
                  pos: getNextStopPosition(stops),
                  mesh: MESH_POINTS[stops.length % MESH_POINTS.length],
                },
              ])
            }
          >
            <Plus className="size-4" /> 添加节点
          </Button>
          <ExportDialog
            module="gradient"
            trigger={
              <Button variant="outline" className="gap-2">
                <Code2 className="size-4" /> 导出当前渐变
              </Button>
            }
          />
        </div>
      </section>

      {user && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">已收藏的渐变</h3>
            <span className="text-xs text-muted-foreground">点击卡片即可恢复并继续调整</span>
          </div>
          {favoriteGradients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              暂无收藏渐变，点击「收藏当前渐变」保存。
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {favoriteGradients.map((savedGradient) => (
                <div
                  key={savedGradient.id}
                  className="space-y-2 rounded-xl border border-border p-2"
                >
                  <button
                    type="button"
                    onClick={() => applyGradient(savedGradient.stops, savedGradient.config)}
                    className="h-20 w-full rounded-lg border border-border/60 transition-transform hover:scale-[1.01]"
                    style={gradientPreviewStyle(savedGradient.config, savedGradient.stops, cbMode)}
                    aria-label={`应用渐变：${savedGradient.name}`}
                  />
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0 flex-1 text-left">
                      <InlineRename
                        value={savedGradient.name}
                        editing={editingGradientId === savedGradient.id}
                        onEditingChange={(editing) =>
                          setEditingGradientId(editing ? savedGradient.id : null)
                        }
                        onSave={(nextName) => renameGradient(savedGradient.id, nextName)}
                        className="w-full"
                        textClassName="text-xs font-medium"
                        ariaLabel="重命名渐变"
                      />
                      <span className="block text-[11px] text-muted-foreground">
                        {TYPES.find((item) => item.key === savedGradient.config.type)?.label} ·{" "}
                        {savedGradient.stops.length} 节点
                      </span>
                    </div>
                    <Tip label="重命名渐变">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="重命名渐变"
                        onClick={() => setEditingGradientId(savedGradient.id)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </Tip>
                    <Tip label="删除渐变">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="删除渐变"
                        onClick={() => removeGradient(savedGradient.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </Tip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <button
          type="button"
          onClick={() => setShowCtrl((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" strokeWidth={1.6} />
            渐变控制（角度 / 中心 / 插值方式）
          </span>
          <ChevronDown className={cn("size-4 transition-transform", showCtrl && "rotate-180")} />
        </button>
        {showCtrl && (
          <div className="grid gap-5 border-t border-border px-5 py-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">
                {type === "mesh"
                  ? "角度（Mesh 不适用）"
                  : type === "radial"
                    ? "角度（径向不适用）"
                    : `角度 ${angle}°`}
              </label>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={angle}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  scheduleRangeUpdate(() => setAngle(v));
                }}
                disabled={type === "radial" || type === "mesh"}
                className="w-full accent-foreground disabled:opacity-40"
              />
            </div>
            {(type === "radial" || type === "conic") && (
              <div className="grid gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    中心 X {Math.round(gradientCenter.x)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={gradientCenter.x}
                    onChange={(event) => {
                      const v = Number(event.target.value);
                      scheduleRangeUpdate(() =>
                        setGradientCenter((current) => ({ ...current, x: v })),
                      );
                    }}
                    className="w-full accent-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    中心 Y {Math.round(gradientCenter.y)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={gradientCenter.y}
                    onChange={(event) => {
                      const v = Number(event.target.value);
                      scheduleRangeUpdate(() =>
                        setGradientCenter((current) => ({ ...current, y: v })),
                      );
                    }}
                    className="w-full accent-foreground"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">色彩空间插值</label>
              <div className="mt-2 flex gap-1">
                {(["rgb", "lab", "lch"] as InterpSpace[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpace(s)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs uppercase",
                      space === s
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <button
          type="button"
          onClick={() => setShowCode((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <Code2 className="size-4 text-muted-foreground" strokeWidth={1.6} />
            CSS 代码
          </span>
          <ChevronDown className={cn("size-4 transition-transform", showCode && "rotate-180")} />
        </button>
        {showCode && (
          <div className="flex items-start gap-3 border-t border-border px-5 py-4">
            <code className="flex-1 break-all font-mono text-xs text-muted-foreground">
              {type === "mesh"
                ? `background-image: ${meshStyle.backgroundImage};`
                : `background: ${css};`}
            </code>
            <CopyButton
              value={
                type === "mesh"
                  ? `background-image: ${meshStyle.backgroundImage};`
                  : `background: ${css};`
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
