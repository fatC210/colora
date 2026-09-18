import { useEffect, useMemo, useRef, useState } from "react";
import {
  Blend,
  Check,
  ChevronDown,
  Code2,
  Eye,
  EyeOff,
  Heart,
  Pencil,
  Plus,
  Settings2,
  Shapes,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useColora, type GradientConfig, type GradientStop } from "@/lib/colora-store";
import { interpolate, randomHex, simulateCB, type CBMode, type InterpSpace } from "@/lib/color";
import {
  DEFAULT_EASING,
  EASING_GROUPS,
  EASING_LABELS,
  ease,
  easingCurvePath,
  isGradientEasing,
  type GradientEasing,
} from "@/lib/easing";
import { useT } from "@/lib/i18n/use-t";
import { ColorPicker, CopyButton, InlineRename, Tip } from "../primitives";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportDialog } from "../ExportDialog";
import { ToolLayout } from "../ToolLayout";
import { GRADIENT_LINE_RADIUS, GRAD_TYPE_LABELS, MESH_POINTS, TYPES } from "./constants";
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

/** 相邻色标之间的采样段数。够密才看不出色带，同时别把 CSS 撑得太长。 */
const SAMPLES_PER_SEGMENT = 16;

/**
 * 把相邻锚点之间插值展开成中间锚点。`easing` 为 linear 时就是均匀采样 ——
 * 非 rgb 空间（lab/lch）本来也要靠它，因为浏览器只会按 sRGB 线性插值。
 */
function expandStops(
  stops: GradientStop[],
  easing: GradientEasing,
  space: InterpSpace,
): GradientStop[] {
  const out: GradientStop[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    for (let k = 0; k < SAMPLES_PER_SEGMENT; k++) {
      const t = k / SAMPLES_PER_SEGMENT;
      out.push({
        // 派生 id：它不在 gradientStops 里，所以 setStop 对它天然是空操作 ——
        // 生成出来的锚点本来就是只读的。
        id: `${a.id}-e${k}`,
        hex: interpolate(a.hex, b.hex, ease(easing, t), space),
        pos: a.pos + (b.pos - a.pos) * t,
      });
    }
  }
  out.push(stops[stops.length - 1]);
  return out;
}

/** 缓动曲线图标：路径直接由缓动函数生成，加新曲线不用再手画图标。 */
function EasingCurveIcon({ kind }: { kind: GradientEasing }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={easingCurvePath(kind)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
    user,
  } = useColora();
  const [type, setType] = useState<GradType>(gradientConfig.type);
  const [angle, setAngle] = useState(gradientConfig.angle);
  const [space, setSpace] = useState<InterpSpace>(gradientConfig.space);
  const [easing, setEasing] = useState<GradientEasing>(gradientConfig.easing);
  /*
   * 缓动开关只是「linear ↔ 上次选的那条曲线」的快捷方式，所以得记住上次选的非 linear 值。
   * 用 ref 而不是 state：它只影响开关打开时落到哪条曲线，不需要触发重渲染。
   */
  const lastEasingRef = useRef<GradientEasing>(
    gradientConfig.easing === "linear" ? DEFAULT_EASING : gradientConfig.easing,
  );
  const easingOn = easing !== "linear";
  const toggleEasing = (on: boolean) => {
    if (on) {
      setEasing(lastEasingRef.current);
    } else {
      lastEasingRef.current = easing;
      setEasing("linear");
    }
  };
  const chooseEasing = (next: GradientEasing) => {
    if (next !== "linear") lastEasingRef.current = next;
    setEasing(next);
  };
  const [gradientCenter, setGradientCenter] = useState<MeshPoint>(gradientConfig.center);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [showStops, setShowStops] = useState(true);
  const [editingGradientId, setEditingGradientId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const stops = [...gradientStops].sort((a, b) => a.pos - b.pos);

  useEffect(() => {
    setGradientConfig({ type, angle, space, easing, center: gradientCenter });
  }, [angle, easing, gradientCenter, setGradientConfig, space, type]);

  /*
   * 展示用的锚点。开启缓动时**直接替换**成曲线生成的中间锚点，关掉就回到用户摆的那几个 ——
   * 所以 gradientStops（用户数据）始终是唯一真值源，这里只是派生出来的视图。
   * Mesh 不参与：它靠每个节点自己的团块坐标成形，插值/缓动对它没有意义。
   */
  const locked = easingOn && type !== "mesh";
  const displayStops = useMemo(
    () => (locked ? expandStops(stops, easing, space) : stops),
    [locked, stops, easing, space],
  );

  const stopList = useMemo(() => {
    // 不缓动 + rgb：直接透传原始锚点。逐点采样在数学上等价，但 CSS 短得多，
    // 而且能保证「没开缓动时输出与引入缓动之前逐字符相同」。
    if (easing === "linear" && space === "rgb")
      return stops.map((s) => `${simulateCB(s.hex, cbMode)} ${Math.round(s.pos)}%`).join(", ");
    // 其余情况：缓动开了用 displayStops，没开也要为 lab/lch 采样一次。
    const source = locked ? displayStops : expandStops(stops, "linear", space);
    return source.map((s) => `${simulateCB(s.hex, cbMode)} ${Math.round(s.pos)}%`).join(", ");
  }, [stops, displayStops, space, easing, locked, cbMode]);

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

  const currentConfig: GradientConfig = { type, angle, space, easing, center: gradientCenter };

  // 渐变方向线的数学角（CSS 角 0°=正上、顺时针 → 数学角 = CSS角 - 90°）
  const angleMathRad = ((angle - 90) * Math.PI) / 180;

  const favoriteCurrentGradient = () => {
    saveGradient(t("渐变 {n}", { n: favoriteGradients.length + 1 }), stops, currentConfig);
  };

  const applyGradient = (stopsToApply: GradientStop[], configToApply: GradientConfig) => {
    const nextConfig = cloneConfig(configToApply);
    setType(nextConfig.type);
    setAngle(nextConfig.angle);
    setSpace(nextConfig.space);
    // 旧收藏里没有 easing 字段 —— 回退到 linear（= 引入缓动之前的行为），别把 undefined 喂给 ease()。
    const nextEasing = isGradientEasing(nextConfig.easing) ? nextConfig.easing : "linear";
    setEasing(nextEasing);
    lastEasingRef.current = nextEasing === "linear" ? DEFAULT_EASING : nextEasing;
    setGradientCenter(nextConfig.center);
    setGradientStops(cloneStops(stopsToApply));
    setGradientConfig(nextConfig);
  };

  return (
    <ToolLayout
      title={t("渐变编辑")}
      rail={[
        {
          id: "type",
          icon: Shapes,
          title: t("渐变类型"),
          content: (
            <div className="flex gap-1">
              {TYPES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setType(item.key)}
                  className={cn(
                    "flex-1 rounded-full px-2 py-1.5 text-xs",
                    type === item.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
          ),
        },
        {
          id: "geometry",
          icon: Settings2,
          title: t("方向与中心"),
          content: (
            <div className="space-y-5">
              <div>
                <label className="text-xs text-muted-foreground">
                  {type === "mesh"
                    ? t("角度（Mesh 不适用）")
                    : type === "radial"
                      ? t("角度（径向不适用）")
                      : t("角度 {angle}°", { angle })}
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
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {t("中心 X")} {Math.round(gradientCenter.x)}%
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
                      {t("中心 Y")} {Math.round(gradientCenter.y)}%
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
            </div>
          ),
        },
        {
          id: "transition",
          icon: Blend,
          title: t("颜色过渡"),
          content: (
            <div className="space-y-5">
              <div>
                <label className="text-xs text-muted-foreground">{t("色彩空间插值")}</label>
                <div className="mt-2 flex gap-1">
                  {(["rgb", "lab", "lch"] as InterpSpace[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpace(s)}
                      className={cn(
                        "flex-1 rounded-full px-3 py-1.5 text-xs uppercase",
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

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">{t("渐变缓动")}</label>
                  <Switch
                    checked={easingOn}
                    onCheckedChange={toggleEasing}
                    aria-label={t("渐变缓动")}
                  />
                </div>
                {/*
                  用 Popover 而不是 Select：Radix Select 选完一项必然收起，而挑缓动曲线
                  是个「来回试」的动作，每选一次就得重新展开太别扭。Popover 里放手写的列表，
                  点选项只换曲线、菜单留着。
                */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={!easingOn}
                      className="mt-2 flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <EasingCurveIcon kind={easing} />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {EASING_LABELS[easing]}
                      </span>
                      <ChevronDown className="size-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="max-h-[320px] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
                  >
                    {EASING_GROUPS.map((group) => (
                      <div key={group.label}>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          {t(group.label)}
                        </div>
                        {group.items.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => chooseEasing(kind)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                              kind === easing && "bg-accent/60",
                            )}
                          >
                            <EasingCurveIcon kind={kind} />
                            <span className="flex-1 text-left">{EASING_LABELS[kind]}</span>
                            {kind === easing && <Check className="size-4 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ),
        },
        {
          id: "actions",
          icon: Wand2,
          title: t("渐变操作"),
          content: (
            <div className="flex flex-col gap-2">
              {user && (
                <Button className="w-full gap-2" onClick={favoriteCurrentGradient}>
                  <Heart className="size-4" /> {t("收藏当前渐变")}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full gap-2"
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
                <Plus className="size-4" /> {t("添加节点")}
              </Button>
              <ExportDialog
                module="gradient"
                trigger={
                  <Button variant="outline" className="w-full gap-2">
                    <Code2 className="size-4" /> {t("导出当前渐变")}
                  </Button>
                }
              />
            </div>
          ),
        },
        {
          id: "css",
          icon: Code2,
          title: t("CSS 代码"),
          content: (
            <div className="flex items-start gap-3">
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
          ),
        },
      ]}
    >
      {/*
        类型切换挪进右栏后，主内容只剩预览 + 收藏区。包一层撑满高度的 flex 列，
        让预览吃掉剩余空间（矮屏下限 380px），别在卡片底部空出一大片。
      */}
      <div className="flex h-full min-h-0 flex-col gap-5">
        <section className="panel flex flex-1 flex-col p-5">
          <div
            ref={previewRef}
            className="relative min-h-[380px] w-full flex-1 touch-none overflow-hidden rounded-xl border border-border/60"
            style={type === "mesh" ? meshStyle : { backgroundImage: css }}
          >
            <button
              type="button"
              onClick={() => setShowStops((s) => !s)}
              aria-label={showStops ? t("隐藏圆点") : t("显示圆点")}
              aria-pressed={!showStops}
              className="absolute right-3 top-3 z-40 grid size-8 place-items-center rounded-full bg-background/85 text-muted-foreground shadow-sm ring-1 ring-inset ring-foreground/25 backdrop-blur transition-colors hover:bg-background hover:text-foreground"
            >
              {showStops ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>

            {showStops &&
              type === "mesh" &&
              displayStops.map((stop, stopIndex) => {
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
                        locked || (draggingStopId && draggingStopId !== stop.id) ? "none" : undefined,
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
                    aria-label={t("调整团块 {n} 位置", { n: stopIndex + 1 })}
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
                aria-label={t("调整渐变中心位置")}
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
                  aria-label={t("拖动调整渐变角度，当前 {angle}°", { angle })}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/30" />
                  <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                    {angle}°
                  </span>
                </div>
                {displayStops.map((stop, stopIndex) => {
                  // 停止点沿渐变方向线分布：pos 0→-R，pos 100→+R
                  const along = (stop.pos - 50) / 50;
                  const dx = along * GRADIENT_LINE_RADIUS * Math.cos(angleMathRad);
                  const dy = along * GRADIENT_LINE_RADIUS * Math.sin(angleMathRad);
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
                          locked || (draggingStopId && draggingStopId !== stop.id) ? "none" : undefined,
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
                      aria-label={t("调整节点 {n} 位置", { n: stopIndex + 1 })}
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
                {displayStops.map((stop, stopIndex) => {
                  // 停止点沿径向线分布：pos 0→center，pos 100→R
                  const along = stop.pos / 100;
                  const dx = along * GRADIENT_LINE_RADIUS * Math.cos(-Math.PI / 4);
                  const dy = along * GRADIENT_LINE_RADIUS * Math.sin(-Math.PI / 4);
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
                          locked || (draggingStopId && draggingStopId !== stop.id) ? "none" : undefined,
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
                      aria-label={t("调整节点 {n} 位置", { n: stopIndex + 1 })}
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
                  aria-label={t("拖动调整起始角度，当前 {angle}°", { angle })}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/30" />
                  <span className="pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                    {angle}°
                  </span>
                </div>
                {displayStops.map((stop, stopIndex) => {
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
                          locked || (draggingStopId && draggingStopId !== stop.id) ? "none" : undefined,
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
                      aria-label={t("调整节点 {n} 位置", { n: stopIndex + 1 })}
                    />
                  );
                })}
              </>
            )}
          </div>

          {locked && (
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              {t("缓动已开启：锚点由曲线自动生成，关掉缓动即可回到你原来的锚点。")}
            </p>
          )}

          <div
            className={cn(
              "mt-6 flex flex-wrap items-center gap-4",
              locked && "pointer-events-none opacity-60",
            )}
          >
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {displayStops.map((stop, stopIndex) => {
                const meshPoint = meshPointFor(stop, stopIndex);
                return (
                  <div key={stop.id} className="flex items-center gap-1">
                    <Popover>
                      <Tip label={t("节点 {n}", { n: stopIndex + 1 })}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="size-7 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border)]"
                            style={{ backgroundColor: simulateCB(stop.hex, cbMode) }}
                            onDoubleClick={() => setColor(stop.hex)}
                            aria-label={t("节点 {n}", { n: stopIndex + 1 })}
                          />
                        </PopoverTrigger>
                      </Tip>
                      <PopoverContent className="w-64 space-y-3">
                        <ColorPicker value={stop.hex} onChange={(hex) => setStop(stop.id, { hex })} />
                        <div>
                          <label className="text-xs text-muted-foreground">
                            {type === "mesh" ? t("线性位置") : t("位置")} {Math.round(stop.pos)}%
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
                                {t("团块 X")} {Math.round(meshPoint.x)}%
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
                                {t("团块 Y")} {Math.round(meshPoint.y)}%
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
                        {displayStops.length > 2 && (
                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() =>
                              setGradientStops((currentStops) =>
                                currentStops.filter((currentStop) => currentStop.id !== stop.id),
                              )
                            }
                          >
                            <Trash2 className="size-4" /> {t("删除节点")}
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                    {stopIndex < displayStops.length - 1 && <span className="h-px w-8 bg-border" />}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {user && (
          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{t("已收藏的渐变")}</h3>
              <span className="text-xs text-muted-foreground">{t("点击卡片即可恢复并继续调整")}</span>
            </div>
            {favoriteGradients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("暂无收藏渐变，点击「收藏当前渐变」保存。")}
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
                      aria-label={t("应用渐变：{name}", { name: savedGradient.name })}
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
                          ariaLabel={t("重命名渐变")}
                        />
                        <span className="block text-[11px] text-muted-foreground">
                          {t(GRAD_TYPE_LABELS[savedGradient.config.type])} ·{" "}
                          {t("{n} 节点", { n: savedGradient.stops.length })}
                        </span>
                      </div>
                      <Tip label={t("重命名渐变")}>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={t("重命名渐变")}
                          onClick={() => setEditingGradientId(savedGradient.id)}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </Tip>
                      <Tip label={t("删除渐变")}>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={t("删除渐变")}
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
      </div>
    </ToolLayout>
  );
}
