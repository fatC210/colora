import { useState } from "react";
import { ChevronDown, ChevronRight, Hash, Contrast as ContrastIcon, PieChart, Upload } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { formatAll, simulateCB } from "@/lib/color";
import { CopyButton, Tip } from "./primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Hash;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-3 text-sm"
      >
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" strokeWidth={1.6} />
          {title}
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border px-3 py-3 text-sm">{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <span className="font-mono text-xs">{value}</span>
        <CopyButton value={value} />
      </span>
    </div>
  );
}

export function InfoPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { color, cbMode } = useColora();
  const f = formatAll(color);
  const shown = simulateCB(color, cbMode);

  if (collapsed) {
    return (
      <Tip label="展开信息面板" side="right">
        <button
          type="button"
          onClick={onToggle}
          aria-label="展开信息面板"
          className="hidden w-8 shrink-0 items-center justify-center border-l border-border bg-surface text-muted-foreground hover:text-foreground lg:flex"
        >
          <ChevronRight className="size-4 rotate-180" />
        </button>
      </Tip>
    );
  }

  return (
    <div className="relative hidden w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4 lg:flex">
      <Tip label="折叠信息面板" side="right">
        <button
          type="button"
          onClick={onToggle}
          aria-label="折叠信息面板"
          className="absolute left-0 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </Tip>

      <div
        className="h-40 w-full rounded-xl border border-border/60"
        style={{ backgroundColor: shown }}
      />

      <div>
        <div className="flex items-center gap-1">
          <h2 className="font-mono text-2xl font-semibold tracking-tight">{f.hex}</h2>
          <CopyButton value={f.hex} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">最接近：{f.name}</p>
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">RGB</p>
            <p className="font-mono text-sm">{f.rgbShort}</p>
          </div>
          <CopyButton value={f.rgb} />
        </div>
      </div>

      <div className="space-y-2">
        <Section icon={Hash} title="更多色值">
          <Row label="HEX" value={f.hex} />
          <Row label="RGB" value={f.rgb} />
          <Row label="HSL" value={f.hsl} />
          <Row label="HSV" value={f.hsv} />
          <Row label="CMYK" value={f.cmyk} />
          <Row label="LAB" value={f.lab} />
          <Row label="LCH" value={f.lch} />
          <Row label="CSS 命名色" value={f.name} />
        </Section>

        <Section icon={ContrastIcon} title="对比度">
          <div className="space-y-2">
            {[
              { label: "白色文字", bg: color, fg: "#FFFFFF", ratio: f.onWhite },
              { label: "黑色文字", bg: color, fg: "#000000", ratio: f.onBlack },
            ].map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-2">
                <span
                  className="rounded px-2 py-1 text-xs"
                  style={{ backgroundColor: c.bg, color: c.fg }}
                >
                  {c.label}
                </span>
                <span className="font-mono text-xs">
                  {c.ratio.toFixed(2)}:1 · {c.ratio >= 7 ? "AAA" : c.ratio >= 4.5 ? "AA" : "不通过"}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={PieChart} title="色轮位置">
          <div className="flex flex-col items-center gap-2">
            <div className="relative size-32 rounded-full"
              style={{
                background:
                  "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
              }}
            >
              <div className="absolute inset-6 rounded-full bg-surface" />
              <span
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                style={{
                  backgroundColor: color,
                  left: `${50 + Math.cos(((f.hue - 90) * Math.PI) / 180) * (f.sat / 100) * 40}%`,
                  top: `${50 + Math.sin(((f.hue - 90) * Math.PI) / 180) * (f.sat / 100) * 40}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              色相 {Math.round(f.hue)}° · 饱和度 {Math.round(f.sat)}%
            </p>
          </div>
        </Section>
      </div>

      <div className="mt-auto pt-2">
        <ExportDialog
          trigger={
            <Button className="w-full gap-2">
              <Upload className="size-4" />
              导出
            </Button>
          }
        />
      </div>
    </div>
  );
}
