import { useMemo, useState } from "react";
import { Plus, Settings2, Code2, Trash2, ChevronDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useColora } from "@/lib/colora-store";
import { interpolate, randomHex, simulateCB, type InterpSpace } from "@/lib/color";
import { ColorPicker, CopyButton, Tip } from "./primitives";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type GradType = "linear" | "radial" | "conic" | "mesh";

const TYPES: { key: GradType; label: string }[] = [
  { key: "linear", label: "线性" },
  { key: "radial", label: "径向" },
  { key: "conic", label: "锥形" },
  { key: "mesh", label: "Mesh" },
];

export function GradientTool() {
  const { gradientStops, setGradientStops, setColor, cbMode } = useColora();
  const [type, setType] = useState<GradType>("linear");
  const [angle, setAngle] = useState(135);
  const [space, setSpace] = useState<InterpSpace>("rgb");
  const [showCtrl, setShowCtrl] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const stops = [...gradientStops].sort((a, b) => a.pos - b.pos);

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
        ? `radial-gradient(circle at 50% 50%, ${stopList})`
        : type === "conic"
          ? `conic-gradient(from ${angle}deg at 50% 50%, ${stopList})`
          : undefined;

  const meshStyle = {
    backgroundColor: stops[0]?.hex,
    backgroundImage: stops
      .map(
        (s, i) =>
          `radial-gradient(at ${[18, 62, 88, 40, 72][i % 5]}% ${[35, 18, 55, 88, 72][i % 5]}%, ${simulateCB(s.hex, cbMode)} 0px, transparent 55%)`,
      )
      .join(", "),
  };

  const setStop = (i: number, patch: Partial<{ hex: string; pos: number }>) =>
    setGradientStops(stops.map((s, si) => (si === i ? { ...s, ...patch } : s)));

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
          className="h-[380px] w-full rounded-xl border border-border/60"
          style={type === "mesh" ? meshStyle : { backgroundImage: css }}
        />

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {stops.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <Popover>
                  <Tip label={`节点 ${i + 1}`}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="size-7 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border)]"
                        style={{ backgroundColor: simulateCB(s.hex, cbMode) }}
                        onDoubleClick={() => setColor(s.hex)}
                        aria-label={`节点 ${i + 1}`}
                      />
                    </PopoverTrigger>
                  </Tip>
                  <PopoverContent className="w-64 space-y-3">
                    <ColorPicker value={s.hex} onChange={(hex) => setStop(i, { hex })} />
                    <div>
                      <label className="text-xs text-muted-foreground">位置 {Math.round(s.pos)}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={s.pos}
                        onChange={(e) => setStop(i, { pos: Number(e.target.value) })}
                        className="w-full accent-foreground"
                      />
                    </div>
                    {stops.length > 2 && (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setGradientStops(stops.filter((_, si) => si !== i))}
                      >
                        <Trash2 className="size-4" /> 删除节点
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
                {i < stops.length - 1 && <span className="h-px w-8 bg-border" />}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setGradientStops([...stops, { hex: randomHex(), pos: 50 }])}
          >
            <Plus className="size-4" /> 添加节点
          </Button>
        </div>
      </section>

      <section className="panel">
        <button
          type="button"
          onClick={() => setShowCtrl((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" strokeWidth={1.6} />
            渐变控制（角度 / 插值方式）
          </span>
          <ChevronDown className={cn("size-4 transition-transform", showCtrl && "rotate-180")} />
        </button>
        {showCtrl && (
          <div className="grid gap-5 border-t border-border px-5 py-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">角度 {angle}°</label>
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
