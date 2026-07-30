import { useState } from "react";
import { Plus, Sliders, Trash2, ChevronDown, Blend } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColora } from "@/lib/colora-store";
import { bestTextOn, formatAll, mixColors, randomHex, simulateCB, type MixMode } from "@/lib/color";
import { ColorPicker, CopyButton } from "./primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MODES: { key: MixMode; label: string }[] = [
  { key: "subtractive", label: "减色混合" },
  { key: "additive", label: "加色混合" },
  { key: "average", label: "平均混合" },
];

export function MixerTool() {
  const { setColor, cbMode } = useColora();
  const [items, setItems] = useState([
    { hex: "#1A1A1A", weight: 50 },
    { hex: "#9A9A9A", weight: 30 },
    { hex: "#E8E8E8", weight: 20 },
  ]);
  const [mode, setMode] = useState<MixMode>("subtractive");
  const [result, setResult] = useState<string | null>(null);
  const [mixing, setMixing] = useState(false);
  const [showModes, setShowModes] = useState(false);

  const preview = mixColors(items, mode);

  const runMix = () => {
    setMixing(true);
    setResult(null);
    setTimeout(() => {
      setMixing(false);
      setResult(preview);
      setColor(preview);
    }, 1500);
  };

  const f = result ? formatAll(result) : null;

  return (
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-center gap-4 p-4">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="size-11 rounded-lg border border-border"
                  style={{ backgroundColor: simulateCB(it.hex, cbMode) }}
                  aria-label={`颜色 ${i + 1}`}
                />
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <ColorPicker
                  value={it.hex}
                  onChange={(hex) => setItems(items.map((x, xi) => (xi === i ? { ...x, hex } : x)))}
                />
              </PopoverContent>
            </Popover>
            <div className="w-40">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{it.hex}</span>
                <span className="text-xs text-muted-foreground">{it.weight}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={it.weight}
                onChange={(e) =>
                  setItems(
                    items.map((x, xi) => (xi === i ? { ...x, weight: Number(e.target.value) } : x)),
                  )
                }
                className="w-full accent-foreground"
              />
            </div>
            {items.length > 2 && (
              <button
                type="button"
                onClick={() => setItems(items.filter((_, xi) => xi !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            {i < items.length - 1 && <span className="text-lg text-muted-foreground">+</span>}
          </div>
        ))}
        <Button
          variant="ghost"
          className="gap-2"
          onClick={() => setItems([...items, { hex: randomHex(), weight: 20 }])}
        >
          <Plus className="size-4" /> 添加颜色
        </Button>
      </section>

      <section
        className="relative flex h-[420px] flex-col items-center justify-center overflow-hidden rounded-xl border border-border transition-[background-color] duration-1000 ease-in-out"
        style={{ backgroundColor: simulateCB(result ?? preview, cbMode) }}
      >
        {mixing &&
          items.map((it, i) => (
            <span
              key={i}
              className="pointer-events-none absolute size-64 rounded-full blur-3xl"
              style={{
                backgroundColor: simulateCB(it.hex, cbMode),
                opacity: 0.85,
                left: `${15 + i * 22}%`,
                animation: `colora-blob 1.5s ease-in-out ${i * 0.08}s both`,
              }}
            />
          ))}

        {result && !mixing ? (
          <div
            className="animate-pop flex flex-col items-center gap-2"
            style={{ color: bestTextOn(result) }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-5xl font-bold tracking-tight">{result}</span>
              <CopyButton value={result} className="text-current" />
            </div>
            <p className="text-sm opacity-80">{f?.name}</p>
            <p className="font-mono text-xs opacity-70">{f?.rgb}</p>
          </div>
        ) : (
          <Button
            variant="outline"
            size="lg"
            onClick={runMix}
            disabled={mixing}
            className="z-10 gap-2 rounded-full border-2 bg-transparent px-8 backdrop-blur-sm"
            style={{ color: bestTextOn(preview), borderColor: bestTextOn(preview) }}
          >
            <Blend className="size-4" />
            {mixing ? "混合中…" : "混合"}
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
          <div className="flex gap-2 border-t border-border px-5 py-4">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMode(m.key);
                  setResult(null);
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
