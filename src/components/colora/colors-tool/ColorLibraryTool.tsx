import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { bestTextOn, simulateCB } from "@/lib/color";
import { familiesOfColors, type ColorFamily } from "@/lib/color-families";
import { LIBRARY_COLORS } from "@/lib/color-library";
import { useColora } from "@/lib/colora-store";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { useWindowedGrid } from "@/hooks/use-windowed-grid";
import { ToolLayout } from "../ToolLayout";
import { cn } from "@/lib/utils";

/** 参考站的 9 个色系分组。`color-families.ts` 分得更细（13 类），这里做一次归并。 */
type ColorGroup =
  "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "neutral";

const GROUPS: readonly { id: ColorGroup; label: TKey; families: ColorFamily[] }[] = [
  { id: "red", label: "红", families: ["red"] },
  { id: "orange", label: "橙", families: ["orange"] },
  { id: "yellow", label: "黄", families: ["yellow"] },
  { id: "green", label: "绿", families: ["green"] },
  { id: "teal", label: "青", families: ["teal"] },
  { id: "blue", label: "蓝", families: ["blue"] },
  { id: "purple", label: "紫", families: ["purple"] },
  { id: "pink", label: "粉", families: ["pink"] },
  { id: "neutral", label: "中性", families: ["brown", "beige", "gray", "black", "white"] },
];

/**
 * 每个颜色属于哪个分组。**模块级预计算** —— 484 个色各跑一次 Lab 换算，
 * 放进 filter 里每次按键重算会明显卡手（`PaletteWall` 的 `FAMILY_INDEX` 同款做法）。
 */
const GROUP_OF = new Map<string, ColorGroup>(
  LIBRARY_COLORS.map((hex) => {
    const families = familiesOfColors([hex]);
    const group = GROUPS.find((g) => g.families.some((f) => families.has(f)));
    return [hex, group?.id ?? "neutral"];
  }),
);

const NO_GROUPS: ReadonlySet<ColorGroup> = new Set<ColorGroup>();

/** 复制成功的 ✓ 停留时长（照首页卡片的写法）。 */
const COPIED_MS = 1400;

/**
 * 颜色库：484 个单色，**点色块即复制色号**。
 *
 * 交互刻意和首页配色墙的色块对齐 —— 那边点色块也是复制，两处不该有两套手感。
 *
 * 网格用 `useWindowedGrid` 虚拟滚动，契约和配色墙一样：卡片必须**等高**
 * （色块定高 + 色号一行 `truncate`），否则占位条总高算错、滚到底会露白。
 */
export function ColorLibraryTool() {
  const { cbMode } = useColora();
  const t = useT();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [groups, setGroups] = useState<ReadonlySet<ColorGroup>>(NO_GROUPS);
  /** 刚复制成功的色号。只有它那一格会因此重渲染。 */
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // 虚拟滚动会把滚出视口的卡片卸载掉，挂着的 timeout 必须清干净。
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      /* 剪贴板被拒（非安全上下文等）：仍然给出反馈，不静默失败 */
    }
    setCopied(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  }, []);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return LIBRARY_COLORS.filter((hex) => {
      if (groups.size > 0 && !groups.has(GROUP_OF.get(hex) ?? "neutral")) return false;
      return !q || hex.toLowerCase().includes(q);
    });
  }, [deferredQuery, groups]);

  const toggleGroup = useCallback((id: ColorGroup) => {
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const resetKey = useMemo(
    () => `${deferredQuery.trim().toLowerCase()}|${[...groups].sort().join(",")}`,
    [deferredQuery, groups],
  );

  const { gridRef, start, end, topPad, bottomPad } = useWindowedGrid(rootRef, filtered.length, {
    resetKey,
    cardSelector: "[data-color-card]",
    watch: [toolbarRef],
  });

  const visible = filtered.slice(start, end);

  return (
    <ToolLayout title={t("颜色库")}>
      <div ref={rootRef} className="flex flex-col">
        <div ref={toolbarRef} className="z-10 bg-surface pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-52">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("搜索色号")}
                aria-label={t("搜索色号")}
                className="h-9 w-full rounded-lg border border-input bg-background pr-8 pl-8 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("清空搜索")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <span className="shrink-0 text-xs text-muted-foreground">
              {t("共 {n} 个颜色", { n: filtered.length })}
            </span>
          </div>

          {/*
            色系筛选。**强制单行**（`flex-nowrap` + 横向滚动）—— 换行会让工具栏变高，
            网格整体下移，虚拟滚动量到的 `geom.top` 就失效了（首页配色墙同款约束）。
          */}
          <div
            role="group"
            aria-label={t("色系")}
            className="scrollbar-area-hover mt-2 flex gap-1.5 overflow-x-auto pb-0.5"
          >
            {GROUPS.map((group) => {
              const on = groups.has(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t(group.label)}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-medium">{t("没有找到匹配的颜色")}</p>
          </div>
        ) : (
          <div
            ref={gridRef}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          >
            {topPad > 0 && <div aria-hidden className="col-span-full" style={{ height: topPad }} />}

            {visible.map((hex) => (
              <button
                key={hex}
                data-color-card=""
                type="button"
                onClick={() => copy(hex)}
                aria-label={t("复制 {value}", { value: hex })}
                className="group flex cursor-pointer flex-col gap-1.5 text-left focus-visible:outline-none"
              >
                {/* 色块：hover 微微放大；复制成功时色号浮到中间（和配色墙同一套反馈） */}
                <span
                  aria-hidden
                  className="relative flex h-20 items-center justify-center rounded-lg transition-transform group-hover:scale-[1.02] group-focus-visible:ring-2 group-focus-visible:ring-ring"
                  style={{ backgroundColor: simulateCB(hex, cbMode) }}
                >
                  {copied === hex && (
                    <Check
                      className="size-5 animate-pop"
                      style={{ color: bestTextOn(simulateCB(hex, cbMode)) }}
                      strokeWidth={3}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "truncate font-mono text-[11px]",
                    copied === hex ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {hex}
                </span>
              </button>
            ))}

            {bottomPad > 0 && (
              <div aria-hidden className="col-span-full" style={{ height: bottomPad }} />
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
