import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Search, X } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import {
  CURATED_PALETTES,
  PALETTE_TAGS,
  paletteKey,
  type CuratedPalette,
  type PaletteTag,
} from "@/lib/colora-palettes";
import { useT } from "@/lib/i18n/use-t";
import { findScroller, useWindowedGrid } from "@/hooks/use-windowed-grid";
import { cn } from "@/lib/utils";
import { PaletteCard } from "./PaletteCard";

/** tag id → 词典 key。模块级常量，卡片每次渲染不必重建。 */
const TAG_LABEL: Record<PaletteTag, (typeof PALETTE_TAGS)[number]["label"]> = Object.fromEntries(
  PALETTE_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<PaletteTag, (typeof PALETTE_TAGS)[number]["label"]>;

const NO_TAGS: ReadonlySet<PaletteTag> = new Set<PaletteTag>();

/** 随机跳转会短暂高亮的时长。 */
const HIGHLIGHT_MS = 1600;

/**
 * 首页的配色方案墙。
 *
 * 结构：吸顶工具栏（搜索 + 标签筛选 + 计数）→ 虚拟滚动的等高卡片网格。
 *
 * 性能上有两条硬约束（细节见 `PaletteCard` 的注释）：
 * - 卡片必须 memo 且不订阅 context，所以 `t` / 收藏态 / 回调都从这一层以 prop 传下去；
 * - 收藏态在这一层压成「每卡一个 boolean」—— 直接把 `saved` 数组传下去会让 120 张卡全废。
 */
export function PaletteWall() {
  const { saved, savePalette, removePalette, cbMode } = useColora();
  const t = useT();

  const [query, setQuery] = useState("");
  /**
   * 搜索走 `useDeferredValue`：每个按键都同步重算 120 组过滤 + 重开窗会卡手，
   * 延后一帧让输入框先响应。
   */
  const deferredQuery = useDeferredValue(query);
  const [activeTags, setActiveTags] = useState<ReadonlySet<PaletteTag>>(NO_TAGS);
  /** 随机跳转后短暂高亮的方案 id。只有被点中的那一张会因此重渲染。 */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return CURATED_PALETTES.filter((p) => {
      if (activeTags.size > 0 && !p.tags.some((tag) => activeTags.has(tag))) return false;
      if (!q) return true;
      // 中英都要能搜到：英文名走词典，中文名是原文，两个都比一遍。
      return p.name.includes(q) || t(p.name).toLowerCase().includes(q);
    });
  }, [deferredQuery, activeTags, t]);

  /** 收藏索引：颜色序列 → 已收藏条目的 id。`savePalette` 本身不去重，靠它做 toggle。 */
  const favIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of saved) map.set(paletteKey(entry.colors), entry.id);
    return map;
  }, [saved]);

  /**
   * 回调的中转站。store 的 value 是单个 useMemo，`saved` 一变就整体重建、
   * `savePalette` 跟着换新引用；回调若直接依赖它，卡片上的 memo 就全废了。
   * 所以回调本身恒定，实现从 ref 里取最新的（`ContrastTool.tsx` 同款写法）。
   */
  const latest = useRef({ favIndex, savePalette, removePalette, t });
  latest.current = { favIndex, savePalette, removePalette, t };

  const toggleFavorite = useCallback((palette: CuratedPalette) => {
    const { favIndex: index, savePalette: save, removePalette: remove, t: tr } = latest.current;
    const existing = index.get(paletteKey(palette.colors));
    if (existing) remove(existing);
    else save(tr(palette.name), [...palette.colors]);
  }, []);

  const toggleTag = useCallback((tag: PaletteTag) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** 吸顶工具栏。它一旦换行（窄屏上计数与随机按钮被挤到第二行），网格整体下移，几何要重测。 */
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const filtering = activeTags.size > 0 || query.trim() !== "";
  // 筛选条件一变就把滚动位置归零：否则滚到第 60 行再筛出 3 组，会停在「底部一大片空白」。
  const resetKey = useMemo(
    () => `${deferredQuery.trim().toLowerCase()}|${[...activeTags].sort().join(",")}`,
    [deferredQuery, activeTags],
  );

  const { gridRef, start, end, topPad, bottomPad, geom } = useWindowedGrid(
    rootRef,
    filtered.length,
    { resetKey, cardSelector: "[data-palette-card]", watch: [toolbarRef] },
  );

  const clearFilters = useCallback(() => {
    setQuery("");
    setActiveTags(NO_TAGS);
  }, []);

  /**
   * 随机跳到一组配色。
   *
   * 不能用 `scrollIntoView` —— 目标卡在虚拟滚动下多半根本没渲染出来。
   * 用几何算：网格在滚动内容里的偏移 + 行号 × 行距。
   * `Math.random()` 只能在事件处理器里调，绝不能在渲染期（SSR 与客户端会不一致）。
   */
  const randomJump = useCallback(() => {
    if (filtered.length === 0) {
      // 当前筛选下没有可跳的目标：先清掉筛选，下一次点击就能跳了。
      setQuery("");
      setActiveTags(NO_TAGS);
      return;
    }
    const index = Math.floor(Math.random() * filtered.length);
    const target = geom.top + Math.floor(index / Math.max(1, geom.cols)) * geom.stride;
    const scroller = findScroller(rootRef.current);
    if (scroller) scroller.scrollTop = target;
    else window.scrollTo(0, target);

    setHighlightId(filtered[index].id);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }, [filtered, geom]);

  useEffect(
    () => () => {
      window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const visible = filtered.slice(start, end);

  return (
    <div ref={rootRef} className="flex flex-col">
      {/*
        吸顶的只有工具栏这一行。
        不要用负外边距把它撑满卡片宽度：父级是 flex 列，负 margin-top 会缩短这一项的
        外边距盒，后面的网格跟着上移，第一行就被吸顶条压掉一截。
      */}
      <div ref={toolbarRef} className="z-10 bg-surface pb-4 lg:sticky lg:top-0">
        {/*
          卡片顶部那条内边距（1.75rem）要单独补：sticky 元素最多只能贴到**内容区**顶部，
          自身盒子够不到 padding 那一带，滚动时卡片会从吸顶条上方那条缝里露出来。
          挂一条绝对定位的补丁把缝糊上：吸顶时它正好落进缝里，未吸顶时跑到卡片外被
          overflow 裁掉，看不见。只做 lg —— 窄屏卡片不裁剪，补丁会糊到卡片外面。
        */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-full hidden h-7 bg-surface lg:block"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-52">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("搜索配色方案")}
              aria-label={t("搜索配色方案")}
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
            {t("共 {n} 组配色", { n: filtered.length })}
          </span>

          <button
            type="button"
            onClick={randomJump}
            aria-label={t("随机看一组")}
            className="shrink-0 cursor-pointer rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Dices className="size-3.5" />
          </button>
        </div>

        {/*
          标签 chips **强制单行**（`flex-nowrap` + 横向滚动）。
          这不是审美选择：换行会让工具栏高度变化 → 网格整体下移 → 虚拟滚动量到的
          `geom.top` 失效 → 开窗位置整体偏移。恒定高度是这个布局的硬约束。
        */}
        <div
          role="group"
          aria-label={t("筛选标签")}
          className="scrollbar-area-hover mt-2 flex gap-1.5 overflow-x-auto pb-0.5"
        >
          {PALETTE_TAGS.map((tag) => {
            const on = activeTags.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={on}
                className={cn(
                  "shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t(tag.label)}
              </button>
            );
          })}

          {filtering && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-xs whitespace-nowrap text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("清空筛选")}
            </button>
          )}
        </div>

        {/* 「点色块复制色号」是这一页唯一的隐藏交互，给一条常驻的发现路径。 */}
        <p className="mt-2 text-[11px] text-muted-foreground">{t("点色块即可复制色号")}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="panel px-4 py-16 text-center">
          <p className="text-sm font-medium">{t("没有找到匹配的配色方案")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("试试换个关键词，或清空筛选条件。")}
          </p>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {/* 占位条自己也是网格项、各占一整行，高度由 hook 算好（已扣掉一格 gap） */}
          {topPad > 0 && <div aria-hidden className="col-span-full" style={{ height: topPad }} />}

          {visible.map((palette) => (
            <PaletteCard
              key={palette.id}
              palette={palette}
              name={t(palette.name)}
              tagLabels={palette.tags.map((tag) => t(TAG_LABEL[tag])).join(" · ")}
              favorited={favIndex.has(paletteKey(palette.colors))}
              highlighted={highlightId === palette.id}
              cbMode={cbMode}
              t={t}
              onToggleFavorite={toggleFavorite}
            />
          ))}

          {bottomPad > 0 && (
            <div aria-hidden className="col-span-full" style={{ height: bottomPad }} />
          )}
        </div>
      )}
    </div>
  );
}
