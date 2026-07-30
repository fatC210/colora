import { useId, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Contrast as ContrastIcon,
  PieChart,
  Upload,
} from "lucide-react";
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
  const contentId = useId();

  return (
    <div className="colora-info-section">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="group flex w-full items-center justify-between px-3 py-3 text-left text-sm outline-none transition-colors hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
      >
        <span className="flex items-center gap-2 font-medium">
          <Icon
            className="size-4 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
            strokeWidth={1.6}
          />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-300 ease-out group-hover:text-foreground group-focus-visible:text-foreground",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={contentId}
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "border-t border-border px-3 py-3 text-sm transition-[opacity,transform] duration-200 ease-out",
              open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="-mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/60">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-xs">{value}</span>
        <CopyButton value={value} />
      </span>
    </div>
  );
}

export function InfoPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { color, cbMode } = useColora();
  const f = formatAll(color);
  const shown = simulateCB(color, cbMode);

  return (
    <aside
      data-collapsed={collapsed}
      aria-label="信息面板"
      className="colora-info-panel hidden lg:flex"
    >
      <Tip label={collapsed ? "展开信息面板" : "折叠信息面板"} side={collapsed ? "left" : "right"}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "展开信息面板" : "折叠信息面板"}
          aria-expanded={!collapsed}
          className="colora-info-panel-toggle"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </Tip>

      <div
        className="colora-info-panel-content"
        aria-hidden={collapsed}
        inert={collapsed ? true : undefined}
      >
        <div
          className="h-40 w-full rounded-xl border border-border/60 shadow-[var(--shadow-panel)] transition-[background-color,transform,box-shadow] duration-300 ease-out hover:scale-[1.015] hover:shadow-lg"
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
          <div className="flex items-center justify-between rounded-lg py-1 transition-colors hover:bg-accent/50">
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
                    {c.ratio.toFixed(2)}:1 ·{" "}
                    {c.ratio >= 7 ? "AAA" : c.ratio >= 4.5 ? "AA" : "不通过"}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={PieChart} title="色轮位置">
            <div className="flex flex-col items-center gap-2">
              <div
                className="relative size-32 rounded-full"
                style={{
                  background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
                }}
              >
                <div className="absolute inset-6 rounded-full bg-surface" />
                <span
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)] transition-[left,top,background-color] duration-300 ease-out"
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
              <Button className="w-full gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0">
                <Upload className="size-4" />
                导出
              </Button>
            }
          />
        </div>
      </div>
    </aside>
  );
}
