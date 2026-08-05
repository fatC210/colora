import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Contrast as ContrastIcon,
  PieChart,
  Heart,
  Pencil,
  Trash2,
  Upload,
  Info,
} from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { formatAll, simulateCB } from "@/lib/color";
import { CopyText, InlineRename, Tip } from "./primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const scrollSectionIntoView = () => {
      sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    const animationFrame = requestAnimationFrame(scrollSectionIntoView);
    const timeout = window.setTimeout(scrollSectionIntoView, 320);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [open]);

  return (
    <div ref={sectionRef} className="colora-info-section shrink-0">
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
      <CopyText value={value} className="font-mono text-xs" />
    </div>
  );
}

export function InfoPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <>
      <aside
        data-collapsed={collapsed}
        aria-label="信息面板"
        className="colora-info-panel hidden lg:flex"
      >
        <Tip
          label={collapsed ? "展开信息面板" : "折叠信息面板"}
          side={collapsed ? "left" : "right"}
        >
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
          <InfoPanelBody />
        </div>
      </aside>

      <MobileInfoPanel />
    </>
  );
}

function InfoPanelBody() {
  const { color, cbMode, favoriteColors, saveColor, removeColor, renameColor, setColor } =
    useColora();
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [editingFavoriteColorId, setEditingFavoriteColorId] = useState<string | null>(null);
  const f = formatAll(color);
  const shown = simulateCB(color, cbMode);
  const nearestShown = simulateCB(f.nameHex, cbMode);
  const currentFavorite = favoriteColors.find(
    (savedColor) => savedColor.hex.toUpperCase() === f.hex.toUpperCase(),
  );
  const isCurrentFavorite = Boolean(currentFavorite);
  const favoriteLabel = isCurrentFavorite ? "取消收藏当前颜色" : "收藏当前颜色";

  const favoriteCurrentColor = () => {
    if (currentFavorite) {
      removeColor(currentFavorite.id);
      return;
    }

    saveColor(f.name === "未知" ? color : f.name, color);
  };

  return (
    <>
      <div
        className={cn(
          "relative h-40 w-full min-w-0 shrink-0 overflow-hidden rounded-xl border border-border/60 shadow-[var(--shadow-panel)] transition-[background-color,transform,box-shadow] duration-300 ease-out hover:shadow-lg",
          !compareOpen && "hover:scale-[1.015]",
        )}
        style={{ backgroundColor: compareOpen ? nearestShown : shown }}
      >
        {compareOpen && (
          <>
            <div className="absolute inset-0" style={{ backgroundColor: nearestShown }} />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: shown,
                clipPath: `inset(0 ${100 - comparePosition}% 0 0)`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.18)]"
              style={{ left: `${comparePosition}%` }}
            >
              <span className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-background/90 shadow-md" />
            </div>
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-between gap-2 text-[11px] font-medium text-foreground/80">
              <span className="rounded-full bg-background/80 px-2 py-0.5 backdrop-blur">
                当前色
              </span>
              <span className="rounded-full bg-background/80 px-2 py-0.5 backdrop-blur">
                {f.name}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={comparePosition}
              onChange={(event) => setComparePosition(Number(event.target.value))}
              aria-label={`拖动对比当前色和最接近的 ${f.name}`}
              className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
            />
          </>
        )}
      </div>

      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CopyText
            value={f.hex}
            className="min-w-0 flex-1 justify-between px-0 font-mono text-2xl font-semibold tracking-tight"
          />
          <Tip label={favoriteLabel}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                "shrink-0 rounded-xl bg-transparent text-foreground shadow-none transition-[color,transform] hover:-translate-y-0.5 hover:bg-transparent hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-foreground/30 active:translate-y-0 dark:hover:bg-transparent dark:hover:text-rose-300",
                isCurrentFavorite && "text-foreground hover:text-foreground dark:text-foreground",
              )}
              aria-label={favoriteLabel}
              aria-pressed={isCurrentFavorite}
              onClick={favoriteCurrentColor}
            >
              <Heart
                className={cn("size-4 transition-transform", isCurrentFavorite && "fill-current")}
              />
            </Button>
          </Tip>
        </div>
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">最接近的 CSS 命名色</p>
            <Button
              type="button"
              variant={compareOpen ? "secondary" : "outline"}
              size="sm"
              className="h-7 w-[4.5rem] shrink-0 px-2"
              onClick={() => setCompareOpen((open) => !open)}
            >
              {compareOpen ? "关闭对比" : "对比"}
            </Button>
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <span
              className="size-5 shrink-0 rounded-md border border-border/70 shadow-sm"
              style={{ backgroundColor: nearestShown }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 break-all text-sm font-medium text-foreground">
              {f.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{f.nameHex}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border pt-3">
        <div className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-accent/50">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">RGB</p>
            <CopyText value={f.rgb} className="w-full justify-between px-0 font-mono text-sm">
              {f.rgbShort}
            </CopyText>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2">
        <Section icon={Heart} title="收藏颜色">
          {favoriteColors.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              暂无收藏颜色。点击上方图标后可从这里一键应用继续调整。
            </p>
          ) : (
            <div className="space-y-2">
              {favoriteColors.slice(0, 12).map((savedColor) => (
                <div
                  key={savedColor.id}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 p-1.5"
                >
                  <button
                    type="button"
                    onClick={() => setColor(savedColor.hex)}
                    className="size-7 shrink-0 rounded-md border border-border/70"
                    style={{ backgroundColor: simulateCB(savedColor.hex, cbMode) }}
                    aria-label={`应用颜色：${savedColor.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <InlineRename
                      value={savedColor.name}
                      editing={editingFavoriteColorId === savedColor.id}
                      onEditingChange={(editing) =>
                        setEditingFavoriteColorId(editing ? savedColor.id : null)
                      }
                      onSave={(nextName) => renameColor(savedColor.id, nextName)}
                      className="w-full"
                      textClassName="text-xs font-medium"
                      inputClassName="w-full"
                      ariaLabel="重命名颜色"
                    />
                    <button
                      type="button"
                      onClick={() => setColor(savedColor.hex)}
                      className="block font-mono text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label={`应用颜色：${savedColor.name}`}
                    >
                      {savedColor.hex}
                    </button>
                  </div>
                  <Tip label="重命名颜色">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="重命名颜色"
                      onClick={() => setEditingFavoriteColorId(savedColor.id)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </Tip>
                  <Tip label="删除颜色">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="删除颜色"
                      onClick={() => removeColor(savedColor.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tip>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Hash} title="更多色值">
          <Row label="HEX" value={f.hex} />
          <Row label="RGB" value={f.rgb} />
          <Row label="HSL" value={f.hsl} />
          <Row label="HSV" value={f.hsv} />
          <Row label="CMYK" value={f.cmyk} />
          <Row label="LAB" value={f.lab} />
          <Row label="LCH" value={f.lch} />
          <Row label="CSS 命名色" value={f.name} />
          <Row label="命名色色值" value={f.nameHex} />
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

      <div className="mt-auto shrink-0 pt-2">
        <ExportDialog
          trigger={
            <Button className="w-full gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0">
              <Upload className="size-4" />
              导出
            </Button>
          }
        />
      </div>
    </>
  );
}

function MobileInfoPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="打开信息面板"
          className="fixed right-4 bottom-[5.5rem] z-40 grid size-12 place-items-center rounded-full border border-border bg-surface text-foreground shadow-[var(--shadow-panel)] transition-transform hover:scale-105 active:scale-95 lg:hidden"
        >
          <Info className="size-5" strokeWidth={1.8} />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[92%] flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 pr-10">
          <SheetTitle className="text-base">信息面板</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <InfoPanelBody />
        </div>
      </SheetContent>
    </Sheet>
  );
}
