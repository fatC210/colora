import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAll, type CBMode } from "@/lib/color";
import { simulateCB } from "@/lib/color";
import type { CuratedPalette } from "@/lib/colora-palettes";
import { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";

/**
 * 一组配色的色值详情。
 *
 * 每行一个色：色块 + 色号 + RGB / HSL / Lab + 最近的 CSS 色名，点行复制色号。
 * 数据全部来自 `formatAll(hex)`（`src/lib/color.ts`），不另算一份。
 */
export function PaletteInfoDialog({
  palette,
  name,
  cbMode,
  open,
  onOpenChange,
}: {
  palette: CuratedPalette;
  name: string;
  cbMode: CBMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      /* 剪贴板被拒：仍然给出反馈，不静默失败 */
    }
    setCopied(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{name}</DialogTitle>
        </DialogHeader>

        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          {palette.colors.map((hex) => {
            const info = formatAll(hex);
            const shown = simulateCB(hex, cbMode);
            return (
              <button
                key={hex}
                type="button"
                onClick={() => copy(hex)}
                aria-label={t("复制 {value}", { value: hex })}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-md border border-border"
                  style={{ backgroundColor: shown }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs">{hex}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {info.rgb}
                    <span className="mx-1 opacity-50">·</span>
                    {info.hsl}
                    <span className="mx-1 opacity-50">·</span>
                    {info.name}
                  </span>
                </span>
                <span className={cn("shrink-0", copied === hex && "text-foreground")}>
                  {copied === hex ? (
                    <Check className="size-3.5 animate-pop" strokeWidth={3} />
                  ) : (
                    <Copy className="size-3.5 text-muted-foreground" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
