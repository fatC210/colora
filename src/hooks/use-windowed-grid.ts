import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

/** SSR 下 React 会对 useLayoutEffect 告警，退化成 useEffect。 */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 找最近的纵向滚动容器。
 *
 * 桌面端滚动发生在 ToolLayout 的 `.colora-surface-card` 里（卡片自己 overflow-y:auto），
 * 窄屏则是整页（window）。返回 null 表示「滚的是窗口」。
 */
export function findScroller(from: HTMLElement | null) {
  for (let node = from?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * 滚动相关的三个读法，桌面端（滚卡片内部）和窄屏（滚窗口）分开处理。
 *
 * `origin(el)` 给的是 el 在**滚动内容坐标系**里的位置 —— 窗口滚动要补上 scrollY，
 * 卡片内部滚动则要减掉卡片自己的 rect.top 再加回它已滚过的距离。
 */
function scrollMetrics(root: HTMLElement | null) {
  const scroller = findScroller(root);
  if (scroller) {
    return {
      top: () => scroller.scrollTop,
      viewport: () => scroller.clientHeight,
      origin: (el: HTMLElement) =>
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop,
    };
  }
  return {
    top: () => window.scrollY,
    viewport: () => window.innerHeight,
    origin: (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY,
  };
}

/** 开窗时上下各多渲染几行，滚动时不至于看到空白。 */
const OVERSCAN_ROWS = 2;

export type UseWindowedGridOptions = {
  /** 变化时把滚动位置归零（例如筛选条件换了）。省略时不重置滚动位置。 */
  resetKey?: string | number | null;
  /**
   * 量卡片高度用的选择器锚点。所有卡片必须等高、且都能被它选中。
   * 默认 "[data-duo-card]"。
   */
  cardSelector?: string;
  /** false 时不量测、不监听滚动（例如网格所在的 tab 没显示时）。默认 true。 */
  enabled?: boolean;
  /**
   * 网格**上方**那些会改变高度的元素 —— **吸顶工具栏这类会在网格上方换行的元素必须传进来**。
   *
   * 这是本 hook 最容易漏掉的一条：`geom.top` 是「网格在滚动内容坐标系里的偏移」，
   * 网格上方的内容一旦变高（工具栏换行、多出一行提示），网格整体被往下推，
   * 但**网格自身的尺寸没变** —— 只观察 grid 的 ResizeObserver 收不到通知，
   * `geom.top` 就停在旧值上，开窗位置会整体偏移（顶部露白 / 跳行）。
   *
   * 传进来的元素会被同一个 ResizeObserver 一并观察，任一尺寸变化都重测几何。
   * 传 `useRef` 包的稳定引用；数组本身每次渲染都是新对象，内部按 ref 取值，不会反复重订阅。
   *
   * 注意挂载时机：这些元素要在量测 effect 首次运行时就已经挂上（同一次提交里渲染即可）。
   * 条件渲染、后挂载的元素不会被观察到 —— 那种情况请让它带 `enabled` 一起重新挂载，
   * 或者别把它放进 `watch`。
   *
   * 省略 `watch` 时行为与不传完全一致。
   */
  watch?: RefObject<HTMLElement | null>[];
};

/**
 * 等高卡片网格的按行开窗（虚拟滚动）。
 *
 * 用法：`rootRef` 挂在**滚动容器内部**的某个祖先元素上（hook 用它 `findScroller`
 * 定位真正的滚动容器），`gridRef` 由调用方挂在网格容器 div 上，`total` 是卡片总数。
 *
 * 网格总高用上下两条撑高的占位条补回去，返回值里的 `topPad` / `bottomPad` 就是
 * 这两条的高度（0 表示不放），`start` / `end` 是本次要渲染的卡片切片区间
 * （`items.slice(start, end)`），`first` / `last` 是对应的行号。
 *
 * ## 隐性契约（踩过的坑，改前先读）
 *
 * 1. 量卡高**必须用 `getBoundingClientRect().height`，不能用 `offsetHeight`** ——
 *    后者取整（135.5 → 136），58 行累积下来网格总高多 25px，滚到底会露出一条空白。
 * 2. 占位条自己也是网格项、各占一整行，所以 `topPad = first*stride - gap`、
 *    `bottomPad = (rows-last)*stride - gap` —— 要把它们和卡片之间的 gap 算进去，
 *    少算一格总高就会差一个 gap，滚动条会抖。
 * 3. 网格的直接子元素只能是「卡片」和两条占位条；所有卡片必须等高
 *    （`cardSelector` 是量卡高的锚点）。
 * 4. 开窗范围要夹住：筛掉一批后列表变短、滚动位置还没被浏览器夹回来时，
 *    至少留一行可渲染。
 * 5. 几何（列数 / 行距 / 偏移）只监听尺寸变化（ResizeObserver）、不监听滚动来重算
 *    —— 占位条把网格总高补平了，滚动不改变几何。
 * 6. **网格上方的高度变化只观察 grid 是抓不到的**（网格只是被往下推，自身尺寸没变），
 *    `geom.top` 会失效、开窗整体偏移。吸顶工具栏这类元素必须通过 `watch` 传进来。
 * 7. SSR：一律走 `useIsomorphicLayoutEffect`。
 */
export function useWindowedGrid(
  rootRef: RefObject<HTMLElement | null>,
  total: number,
  options: UseWindowedGridOptions = {},
) {
  const { resetKey, cardSelector = "[data-duo-card]", enabled = true, watch } = options;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [geom, setGeom] = useState({ cols: 1, stride: 148, gap: 12, top: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(900);
  // `watch` 是数组字面量，每次渲染都是新引用；按 ref 取值，量测 effect 就不会反复重订阅。
  const watchRef = useRef(watch);
  watchRef.current = watch;

  // 量列数 / 行距 / 网格在滚动内容里的偏移。列数随断点变、行距随字号变，用 ResizeObserver 跟着更新。
  useIsomorphicLayoutEffect(() => {
    if (!enabled) return;
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      // display:none 时列数是 "none"、高度是 0，量了会把几何算坏 —— 等切回来再量
      if (grid.getClientRects().length === 0) return;
      const styles = getComputedStyle(grid);
      const cols = styles.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      // 必须用 getBoundingClientRect 的小数高度：offsetHeight 会取整（135.5 → 136），
      // 58 行累积下来总高要多出 25px，滚到底就会露出一条空白。
      const card = grid.querySelector<HTMLElement>(cardSelector);
      const cardH = card?.getBoundingClientRect().height ?? 0;
      const gap = parseFloat(styles.rowGap) || 0;
      const stride = cardH + gap;
      const top = scrollMetrics(rootRef.current).origin(grid);
      setGeom((g) =>
        g.cols === cols && g.stride === stride && g.gap === gap && g.top === top
          ? g
          : { cols, stride, gap, top },
      );
    };
    measure();
    // 只关心尺寸变化；滚动不会改变网格总高（占位条把它补平了），所以这里不会被滚动触发。
    // `watch` 里的元素（吸顶工具栏）要在同一个 observer 上 —— 它们变高会把网格整体推下去，
    // 而网格自身尺寸不变，只观察 grid 收不到通知（见 `watch` 的注释）。
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    for (const ref of watchRef.current ?? []) {
      if (ref.current) ro.observe(ref.current);
    }
    return () => ro.disconnect();
  }, [enabled, cardSelector, rootRef]);

  // 跟着滚动位置走。位移小于 8px 不更新 state —— 否则每帧都重渲染。
  useIsomorphicLayoutEffect(() => {
    if (!enabled) return;
    const metrics = scrollMetrics(rootRef.current);
    let raf = 0;
    const read = () => {
      const top = metrics.top();
      const h = metrics.viewport();
      setScrollTop((prev) => (Math.abs(prev - top) < 8 ? prev : top));
      setViewportH((prev) => (Math.abs(prev - h) < 8 ? prev : h));
    };
    read();
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        read();
      });
    };
    // 滚动事件不冒泡，所以要挂在真正的滚动元素上：桌面端是卡片，窄屏是窗口。
    const target: HTMLElement | Window = findScroller(rootRef.current) ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [enabled, rootRef]);

  // resetKey 变化（例如筛选项换了）把滚动位置归零，顺带同步开窗状态，
  // 免得第一帧还按旧位置渲染一批马上要被换掉的卡。
  useIsomorphicLayoutEffect(() => {
    if (resetKey === undefined) return;
    const scroller = findScroller(rootRef.current);
    if (scroller) scroller.scrollTop = 0;
    else window.scrollTo(0, 0);
    setScrollTop(0);
  }, [resetKey, rootRef]);

  /**
   * 外部把滚动位置直接同步进开窗计算（绕过 8px 阈值）—— 例如 tab 切换后
   * 恢复各自记住的位置时用，免得首帧按旧位置渲染一批马上又被换掉的卡。
   */
  const syncScroll = useCallback((top: number) => setScrollTop(top), []);

  /**
   * 开窗区间。撑高用的占位条自己也是网格项、各占一整行，所以补高度时要把它们与卡片
   * 之间的 gap 一起算进去 —— 少算一格总高就会差一个 gap，滚动条会抖。
   *
   *   topPad    = first * stride - gap   （first=0 时不放占位条）
   *   bottomPad = (rows - last) * stride - gap
   */
  const win = useMemo(() => {
    const cols = Math.max(1, geom.cols);
    const rows = Math.max(1, Math.ceil(total / cols));
    const stride = geom.stride || 148;
    const rel = Math.max(0, scrollTop - geom.top);
    // 夹住：筛掉一批后列表变短、滚动位置还没被浏览器夹回来时，至少留一行可渲染
    const first = Math.min(
      Math.max(0, Math.floor(rel / stride) - OVERSCAN_ROWS),
      Math.max(0, rows - 1),
    );
    const last = Math.min(
      rows,
      Math.max(first + 1, Math.ceil((rel + viewportH) / stride) + OVERSCAN_ROWS),
    );
    return {
      first,
      last,
      start: first * cols,
      end: Math.min(total, last * cols),
      topPad: first > 0 ? first * stride - geom.gap : 0,
      bottomPad: last < rows ? (rows - last) * stride - geom.gap : 0,
    };
  }, [total, geom, scrollTop, viewportH]);

  return {
    gridRef,
    first: win.first,
    last: win.last,
    start: win.start,
    end: win.end,
    topPad: win.topPad,
    bottomPad: win.bottomPad,
    syncScroll,
    /**
     * 量到的几何：列数 / 行距 / 网格在滚动内容里的偏移。
     * 调用方拿它做「跳到第 n 张卡」这类定位 —— 虚拟滚动下目标卡多半没渲染，
     * `scrollIntoView` 是无效的，必须自己按 `top + floor(n/cols) * stride` 算滚动位置。
     */
    geom,
  };
}
