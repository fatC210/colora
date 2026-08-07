import { useEffect, useRef, useState } from "react";
import { Plus, Sliders, Trash2, ChevronDown, Blend } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColora } from "@/lib/colora-store";
import { bestTextOn, formatAll, mixColors, randomHex, simulateCB, type MixMode } from "@/lib/color";
import { ColorPicker, CopyText, Tip } from "./primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";

const MODES: { key: MixMode; label: string }[] = [
  { key: "subtractive", label: "减色混合" },
  { key: "additive", label: "加色混合" },
  { key: "average", label: "平均混合" },
];

type MixItem = { hex: string; weight: number };

export function MixerTool() {
  const { setColor, cbMode, setMixerExport } = useColora();
  const [items, setItems] = useState<MixItem[]>([
    { hex: "#6366F1", weight: 50 },
    { hex: "#F97316", weight: 30 },
    { hex: "#14B8A6", weight: 20 },
  ]);
  const [mode, setMode] = useState<MixMode>("subtractive");
  const [result, setResult] = useState<string | null>(null);
  const [mixing, setMixing] = useState(false);
  const [mixKey, setMixKey] = useState(0);
  const [showModes, setShowModes] = useState(false);
  const mixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preview = mixColors(items, mode);

  useEffect(() => {
    setMixerExport({ items, mode, result: result ?? preview });
  }, [items, mode, preview, result, setMixerExport]);

  useEffect(() => {
    return () => {
      if (mixTimer.current) clearTimeout(mixTimer.current);
    };
  }, []);

  const resetMix = () => {
    if (mixTimer.current) {
      clearTimeout(mixTimer.current);
      mixTimer.current = null;
    }

    setMixing(false);
    setResult(null);
  };

  const updateItems = (nextItems: MixItem[]) => {
    setItems(nextItems);
    resetMix();
  };

  const runMix = () => {
    if (mixing) return;

    const mixedColor = preview;
    if (mixTimer.current) clearTimeout(mixTimer.current);

    setMixKey((key) => key + 1);
    setMixing(true);
    setResult(null);
    mixTimer.current = setTimeout(() => {
      mixTimer.current = null;
      setMixing(false);
      setResult(mixedColor);
      setColor(mixedColor);
    }, 1900);
  };

  const f = result ? formatAll(result) : null;

  return (
    <div className="space-y-4">
      <section className="panel grid grid-cols-1 items-center gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="flex min-w-0 items-center gap-3">
            <Popover>
              <Tip label={`颜色 ${i + 1}`}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="size-11 rounded-lg border border-border"
                    style={{ backgroundColor: simulateCB(it.hex, cbMode) }}
                    aria-label={`颜色 ${i + 1}`}
                  />
                </PopoverTrigger>
              </Tip>
              <PopoverContent className="w-64">
                <ColorPicker
                  value={it.hex}
                  onChange={(hex) =>
                    updateItems(items.map((x, xi) => (xi === i ? { ...x, hex } : x)))
                  }
                />
              </PopoverContent>
            </Popover>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <CopyText value={it.hex} className="font-mono text-xs" />
                <span className="text-xs text-muted-foreground">{it.weight}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={it.weight}
                onChange={(e) =>
                  updateItems(
                    items.map((x, xi) => (xi === i ? { ...x, weight: Number(e.target.value) } : x)),
                  )
                }
                className="w-full accent-foreground"
              />
            </div>
            {items.length > 2 && (
              <Tip label="删除颜色">
                <button
                  type="button"
                  onClick={() => updateItems(items.filter((_, xi) => xi !== i))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="删除颜色"
                >
                  <Trash2 className="size-4" />
                </button>
              </Tip>
            )}
            {i < items.length - 1 && (
              <span
                aria-hidden="true"
                className="pointer-events-none hidden w-7 select-none items-center justify-center md:inline-flex"
              >
                <span className="font-mono text-2xl font-semibold leading-none text-foreground">
                  +
                </span>
              </span>
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          className="h-10 w-fit justify-self-end gap-2 rounded-md border border-border/80 bg-muted/5 px-4 hover:border-foreground/40 hover:bg-muted/15 md:justify-self-start"
          onClick={() => updateItems([...items, { hex: randomHex(), weight: 20 }])}
        >
          <Plus className="size-4" /> 添加颜色
        </Button>
      </section>

      <section
        className="relative flex h-[420px] flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20 transition-[background-color] duration-700 ease-in-out"
        style={{ backgroundColor: result && !mixing ? simulateCB(result, cbMode) : undefined }}
      >
        <ExportDialog
          module="mixer"
          trigger={
            <Button
              variant="outline"
              className="absolute right-4 top-4 z-20 gap-2 bg-background/80 backdrop-blur-sm"
            >
              <Blend className="size-4" /> 导出当前混合
            </Button>
          }
        />
        {!result && !mixing && (
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.16),transparent_36%)]" />
        )}

        {mixing && (
          <>
            <span
              className="pointer-events-none absolute inset-8 rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, ${simulateCB(preview, cbMode)} 0%, transparent 68%)`,
                animation: "colora-mix-vortex 1.9s ease-in-out both",
              }}
            />
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundColor: simulateCB(preview, cbMode),
                animation: "colora-mix-reveal 1.9s ease-in-out both",
              }}
            />
            {items.map((it, i) => {
              const left = items.length === 1 ? 50 : 16 + (i * 68) / (items.length - 1);

              return (
                <span
                  key={`${mixKey}-${i}`}
                  className="pointer-events-none absolute top-[-6rem] h-[26rem] w-20 -translate-x-1/2 md:top-[-8rem] md:h-[34rem] md:w-28"
                  style={{
                    left: `${left}%`,
                    animation: `colora-pour-path 1.65s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.09}s both`,
                  }}
                >
                  <span
                    className="absolute left-1/2 top-0 h-36 w-6 -translate-x-1/2 rounded-full blur-[1px] md:h-48 md:w-8"
                    style={{
                      backgroundColor: simulateCB(it.hex, cbMode),
                      animation: `colora-paint-stream 1.35s ease-in ${i * 0.09}s both`,
                    }}
                  />
                  <span
                    className="absolute bottom-20 left-1/2 size-12 -translate-x-1/2 rounded-full shadow-2xl md:bottom-24 md:size-16"
                    style={{
                      backgroundColor: simulateCB(it.hex, cbMode),
                      animation: `colora-paint-drop 1.35s ease-out ${i * 0.09}s both`,
                    }}
                  />
                  <span
                    className="absolute bottom-12 left-1/2 size-40 -translate-x-1/2 rounded-full blur-2xl mix-blend-multiply md:bottom-16 md:size-56"
                    style={{
                      backgroundColor: simulateCB(it.hex, cbMode),
                      animation: `colora-paint-puddle 1.65s ease-in-out ${i * 0.09}s both`,
                    }}
                  />
                </span>
              );
            })}
          </>
        )}

        {mixing ? (
          <div className="z-10 flex items-center gap-2 rounded-full border border-background/30 bg-background/20 px-5 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur-md">
            <Blend className="size-4 animate-spin" />
            混合中…
          </div>
        ) : result ? (
          <div
            className="animate-pop flex flex-col items-center gap-2"
            style={{ color: bestTextOn(result) }}
          >
            <CopyText
              value={result}
              className="font-mono text-5xl font-bold tracking-tight text-current hover:bg-background/20"
            />
            <p className="text-sm opacity-80">{f?.name}</p>
            <p className="font-mono text-xs opacity-70">{f?.rgb}</p>
          </div>
        ) : (
          <Button
            variant="outline"
            size="lg"
            onClick={runMix}
            disabled={mixing}
            className="z-10 gap-2 rounded-full border-2 bg-background/30 px-8 backdrop-blur-sm"
          >
            <Blend className="size-4" />
            混合
          </Button>
        )}
      </section>

      <section className="panel">
        <button
          type="button"
          onClick={() => setShowModes((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <Sliders className="size-4 text-muted-foreground" strokeWidth={1.6} />
            混合模式（减色 / 加色 / 平均）
          </span>
          <span className="flex items-center gap-3 text-muted-foreground">
            当前：{MODES.find((m) => m.key === mode)?.label}
            <ChevronDown className={cn("size-4 transition-transform", showModes && "rotate-180")} />
          </span>
        </button>
        {showModes && (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMode(m.key);
                  resetMix();
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm",
                  mode === m.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
