import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Settings2, Code2, Trash2, ChevronDown, Heart, Pencil } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useColora, type GradientConfig, type GradientStop } from "@/lib/colora-store";
import { interpolate, randomHex, simulateCB, type CBMode, type InterpSpace } from "@/lib/color";
import { ColorPicker, CopyButton, InlineRename, Tip } from "./primitives";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportDialog } from "./ExportDialog";

type GradType = "linear" | "radial" | "conic" | "mesh";
type MeshPoint = { x: number; y: number };

const MESH_POINTS: MeshPoint[] = [
  { x: 18, y: 35 },
  { x: 62, y: 18 },
  { x: 88, y: 55 },
  { x: 40, y: 88 },
  { x: 72, y: 72 },
];

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const meshPointFor = (stop: GradientStop, index: number) =>
  stop.mesh ?? MESH_POINTS[index % MESH_POINTS.length];

const getNextStopPosition = (stops: GradientStop[]) => {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return stops[0].pos < 50 ? 100 : 0;

  const positions = stops.map((stop) => clampPercent(stop.pos)).sort((left, right) => left - right);

  let gapStart = 0;
  let gapEnd = positions[0];
  let largestGap = gapEnd - gapStart;

  for (let positionIndex = 0; positionIndex < positions.length - 1; positionIndex++) {
    const currentGap = positions[positionIndex + 1] - positions[positionIndex];
    if (currentGap > largestGap) {
      largestGap = currentGap;
      gapStart = positions[positionIndex];
      gapEnd = positions[positionIndex + 1];
    }
  }

  const trailingGap = 100 - positions[positions.length - 1];
  if (trailingGap > largestGap) {
    gapStart = positions[positions.length - 1];
    gapEnd = 100;
  }

  return Math.round((gapStart + gapEnd) / 2);
};

const createStopId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `gradient-stop-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const TYPES: { key: GradType; label: string }[] = [
  { key: "linear", label: "线性" },
  { key: "radial", label: "径向" },
  { key: "conic", label: "锥形" },
  { key: "mesh", label: "Mesh" },
];

const cloneStops = (stops: GradientStop[]) =>
  stops.map((stop) => ({ ...stop, mesh: stop.mesh ? { ...stop.mesh } : undefined }));

const cloneConfig = (config: GradientConfig): GradientConfig => ({
  ...config,
  center: { ...config.center },
});

function gradientPreviewStyle(config: GradientConfig, stops: GradientStop[], cbMode: CBMode) {
  const sortedStops = [...stops].sort((a, b) => a.pos - b.pos);
  const list = sortedStops
    .map((stop) => `${simulateCB(stop.hex, cbMode)} ${Math.round(stop.pos)}%`)
    .join(", ");

  if (config.type === "mesh") {
    return {
      backgroundColor: sortedStops[0]?.hex,
      backgroundImage: sortedStops
        .map((stop, stopIndex) => {
          const meshPoint = meshPointFor(stop, stopIndex);
          return `radial-gradient(at ${meshPoint.x}% ${meshPoint.y}%, ${simulateCB(stop.hex, cbMode)} 0px, transparent 55%)`;
        })
        .join(", "),
    };
  }

  return {
    backgroundImage:
      config.type === "linear"
        ? `linear-gradient(${config.angle}deg, ${list})`
        : config.type === "radial"
          ? `radial-gradient(circle at ${config.center.x}% ${config.center.y}%, ${list})`
          : `conic-gradient(from ${config.angle}deg at ${config.center.x}% ${config.center.y}%, ${list})`,
  };
}

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
  } = useColora();
  const [type, setType] = useState<GradType>(gradientConfig.type);
  const [angle, setAngle] = useState(gradientConfig.angle);
  const [space, setSpace] = useState<InterpSpace>(gradientConfig.space);
  const [gradientCenter, setGradientCenter] = useState<MeshPoint>(gradientConfig.center);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [showCtrl, setShowCtrl] = useState(false);
  const [showCode, setShowCode] = useState(false);
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

  const updateStopPositionFromPointer = (id: string, pointerX: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    setStop(id, {
      pos: Math.round(clampPercent(((pointerX - rect.left) / rect.width) * 100)),
    });
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

  const currentConfig: GradientConfig = { type, angle, space, center: gradientCenter };

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
          className="relative h-[380px] w-full overflow-hidden rounded-xl border border-border/60"
          style={type === "mesh" ? meshStyle : { backgroundImage: css }}
        >
          {type === "mesh" &&
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
                    updateMeshPointFromPointer(stop.id, stopIndex, event.clientX, event.clientY);
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons !== 1) return;
                    updateMeshPointFromPointer(stop.id, stopIndex, event.clientX, event.clientY);
                  }}
                  onPointerUp={() => setDraggingStopId(null)}
                  onPointerCancel={() => setDraggingStopId(null)}
                  onLostPointerCapture={() => setDraggingStopId(null)}
                  aria-label={`调整团块 ${stopIndex + 1} 位置`}
                />
              );
            })}
          {(type === "radial" || type === "conic") && (
            <button
              type="button"
              className="absolute size-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-background bg-foreground/80 shadow-[0_0_0_1px_var(--color-border),0_10px_28px_rgb(0_0_0/0.24)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${gradientCenter.x}%`, top: `${gradientCenter.y}%` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                updateGradientCenterFromPointer(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                updateGradientCenterFromPointer(event.clientX, event.clientY);
              }}
              aria-label="调整渐变中心位置"
            />
          )}
          {type !== "mesh" && (
            <>
              <div className="pointer-events-none absolute inset-x-6 bottom-6 h-px bg-foreground/20" />
              {stops.map((stop, stopIndex) => (
                <button
                  key={stop.id}
                  type="button"
                  className="absolute bottom-5 size-5 -translate-x-1/2 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border),0_8px_24px_rgb(0_0_0/0.18)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    left: `${stop.pos}%`,
                    backgroundColor: simulateCB(stop.hex, cbMode),
                    pointerEvents:
                      draggingStopId && draggingStopId !== stop.id ? "none" : undefined,
                    zIndex: draggingStopId === stop.id ? 30 : 10,
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingStopId(stop.id);
                    updateStopPositionFromPointer(stop.id, event.clientX);
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons !== 1) return;
                    updateStopPositionFromPointer(stop.id, event.clientX);
                  }}
                  onPointerUp={() => setDraggingStopId(null)}
                  onPointerCancel={() => setDraggingStopId(null)}
                  onLostPointerCapture={() => setDraggingStopId(null)}
                  aria-label={`调整节点 ${stopIndex + 1} 位置`}
                />
              ))}
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
                          value={stop.pos}
                          onChange={(event) =>
                            setStop(stop.id, { pos: Number(event.target.value) })
                          }
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
                              value={meshPoint.x}
                              onChange={(event) =>
                                setMeshPoint(stop.id, stopIndex, { x: Number(event.target.value) })
                              }
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
                              value={meshPoint.y}
                              onChange={(event) =>
                                setMeshPoint(stop.id, stopIndex, { y: Number(event.target.value) })
                              }
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

          <Button className="gap-2" onClick={favoriteCurrentGradient}>
            <Heart className="size-4" /> 收藏当前渐变
          </Button>
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

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">已收藏的渐变</h3>
          <span className="text-xs text-muted-foreground">点击卡片即可恢复并继续调整</span>
        </div>
        {favoriteGradients.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无收藏渐变，点击「收藏当前渐变」保存。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteGradients.map((savedGradient) => (
              <div key={savedGradient.id} className="space-y-2 rounded-xl border border-border p-2">
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
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value))}
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
                    value={gradientCenter.x}
                    onChange={(event) =>
                      setGradientCenter((current) => ({
                        ...current,
                        x: Number(event.target.value),
                      }))
                    }
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
                    value={gradientCenter.y}
                    onChange={(event) =>
                      setGradientCenter((current) => ({
                        ...current,
                        y: Number(event.target.value),
                      }))
                    }
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
