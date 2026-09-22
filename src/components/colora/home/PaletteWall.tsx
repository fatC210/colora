import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Search, X } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import {
  CURATED_PALETTES,
  PALETTE_TAGS,
  paletteKey,
  type CuratedPalette,
} from "@/lib/colora-palettes";
import { familiesOfColors, matchFamilies, type ColorFamily } from "@/lib/color-families";
import { useT } from "@/lib/i18n/use-t";
import { findScroller, useWindowedGrid } from "@/hooks/use-windowed-grid";
import { PaletteCard } from "./PaletteCard";

/**
 * 展示顺序：**来源三路交错，每路内部按标签轮询，桶内再洗牌**。
 *
 * 数据在源码里是按来源分段的（手工 120 / 参考站精选 63 / 程序生成 260），直接
 * 按那个顺序渲染的话，首屏就是一整屏「自然」标签的绿色，而生成的方案要滚到
 * 第 50 行才露头 —— 参考站那种「五颜六色」的观感主要来自混排。
 *
 * 三件事都要做，缺一不可：
 * 1. **组内按标签轮询** —— 否则同一标签的挤在一起（一个桶里全是绿的）；
 * 2. **三路按比例交错** —— 否则第 1 轮全是手工、第 2 轮全是精选，生成的要到
 *    第 3 轮才出现，等于按来源排了个序；
 * 3. **桶内洗牌** —— 每次切回首页看到的排列都不同（`ToolLayout` 的注释里写明
 *    每个工具各挂一个实例、切换时整个卸载重建，所以挂在挂载 effect 里就够）。
 *    洗的是**桶内**而不是整个数组 —— 整个数组一洗，前两条就废了，首屏又会是一屏绿。
 *
 * ⚠️ 洗牌只能在**客户端 effect** 里做：服务端没有 `Math.random` 的一致结果，
 * 首帧必须用确定性版本，否则 hydration 不匹配。
 *
 * 生成那批用 id 前缀认（`gen-`）而不是再加个字段：`featured` 已经有语义了，
 * 再拆一个 `source` 要改 300 多处数据，不划算。
 */
function buildDisplayOrder(randomize: boolean): readonly CuratedPalette[] {
  /** 组内按主标签轮询，保证任意连续 10 张覆盖全部 10 个标签。 */
  const interleaveByTag = (list: readonly CuratedPalette[]) => {
    const buckets = PALETTE_TAGS.map((tag) => list.filter((p) => p.tags[0] === tag.id));
    if (randomize) for (const bucket of buckets) shuffleInPlace(bucket);
    const depth = Math.max(0, ...buckets.map((b) => b.length));
    const out: CuratedPalette[] = [];
    for (let i = 0; i < depth; i++) {
      for (const bucket of buckets) if (bucket[i]) out.push(bucket[i]);
    }
    return out;
  };

  const sources = [
    interleaveByTag(CURATED_PALETTES.filter((p) => !p.featured)),
    interleaveByTag(CURATED_PALETTES.filter((p) => p.featured && !p.id.startsWith("gen-"))),
    interleaveByTag(CURATED_PALETTES.filter((p) => p.id.startsWith("gen-"))),
  ];

  const taken = sources.map(() => 0);
  const out: CuratedPalette[] = [];
  const total = sources.reduce((n, s) => n + s.length, 0);
  for (let i = 0; i < total; i++) {
    // 取「已用比例最小」的那一路，三路就均匀铺开了
    let best = -1;
    for (let g = 0; g < sources.length; g++) {
      if (taken[g] >= sources[g].length) continue;
      if (best < 0 || taken[g] / sources[g].length < taken[best] / sources[best].length) best = g;
    }
    out.push(sources[best][taken[best]++]);
  }
  return out;
}

/** 原地 Fisher-Yates。只在客户端调用。 */
function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** 确定性版本：SSR 与首次客户端渲染必须一致，否则 hydration 不匹配。 */
const DISPLAY_PALETTES = buildDisplayOrder(false);

/** 随机跳转会短暂高亮的时长。 */
const HIGHLIGHT_MS = 1600;

/**
 * 每组的色系集合。**模块级预计算** —— 180+ 组 × 3–10 色是上千次 Lab 换算，
 * 放进 filter 里每次按键重算会明显卡手。
 */
const FAMILY_INDEX = new Map<string, ReadonlySet<ColorFamily>>(
  CURATED_PALETTES.map((p) => [p.id, familiesOfColors(p.colors)]),
);

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
  /** 随机跳转后短暂高亮的方案 id。只有被点中的那一张会因此重渲染。 */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  /**
   * 展示顺序。首帧用**确定性**版本（SSR 与 hydration 必须一致），挂载后再换成
   * 打乱过的 —— `ToolLayout` 每个工具各挂一个实例、切工具时整个卸载重建，
   * 所以这一段每次进首页都会重跑，等于「每次切回来排列都不同」。
   */
  const [order, setOrder] = useState<readonly CuratedPalette[]>(DISPLAY_PALETTES);
  useEffect(() => {
    setOrder(buildDisplayOrder(true));
  }, []);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return order;
    // 名字和颜色**并行**匹配：搜「绿」既该出「绿野渐层」，也该出所有含绿的方案。
    const families = matchFamilies(q);
    return order.filter((p) => {
      if (p.name.includes(q) || t(p.name).toLowerCase().includes(q)) return true;
      if (families.length === 0) return false;
      const own = FAMILY_INDEX.get(p.id);
      return own ? families.some((f) => own.has(f)) : false;
    });
  }, [order, deferredQuery, t]);

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

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** 吸顶工具栏。它一旦换行（窄屏上计数与随机按钮被挤到第二行），网格整体下移，几何要重测。 */
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // 筛选条件一变就把滚动位置归零：否则滚到第 60 行再筛出 3 组，会停在「底部一大片空白」。
  const resetKey = useMemo(() => deferredQuery.trim().toLowerCase(), [deferredQuery]);

  const { gridRef, start, end, topPad, bottomPad, geom } = useWindowedGrid(
    rootRef,
    filtered.length,
    { resetKey, cardSelector: "[data-palette-card]", watch: [toolbarRef] },
  );

  /**
   * 随机跳到一组配色。
   *
   * 不能用 `scrollIntoView` —— 目标卡在虚拟滚动下多半根本没渲染出来。
   * 用几何算：网格在滚动内容里的偏移 + 行号 × 行距。
   * `Math.random()` 只能在事件处理器里调，绝不能在渲染期（SSR 与客户端会不一致）。
   */
  const randomJump = useCallback(() => {
    if (filtered.length === 0) {
      // 当前筛选下没有可跳的目标：先清掉搜索，下一次点击就能跳了。
      setQuery("");
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
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Dices className="size-3.5" />
            {t("随机")}
          </button>
        </div>
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
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {/* 占位条自己也是网格项、各占一整行，高度由 hook 算好（已扣掉一格 gap） */}
          {topPad > 0 && <div aria-hidden className="col-span-full" style={{ height: topPad }} />}

          {visible.map((palette) => (
            <PaletteCard
              key={palette.id}
              palette={palette}
              name={t(palette.name)}
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
