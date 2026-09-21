import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, Copy, Heart, HelpCircle, List } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { contrastRatio, hexToRgb, rgbToHex, rgbToHsl, hslToRgb, simulateCB } from "@/lib/color";
import { COLOR_DUOS } from "@/lib/color-duos";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/lib/i18n/use-t";
import { CopyText, ColorPicker, Tip } from "./primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";
import { ToolLayout } from "./ToolLayout";
import { Button } from "@/components/ui/button";
import {
  findScroller,
  useIsomorphicLayoutEffect,
  useWindowedGrid,
} from "@/hooks/use-windowed-grid";

/**
 * 一行颜色字段。**返回的是三个网格项**（标签 / 色块 / 色号），本身不包容器 ——
 * 对齐交给父级那一个网格：两行共用同一套列宽，色块列天然对齐，
 * 中间的交换按钮也就能正好落在色块那一列里，不用绝对定位去凑坐标。
 */
function Field({
  label,
  value,
  onChange,
  cbMode,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  cbMode: Parameters<typeof simulateCB>[1];
}) {
  const t = useT();

  return (
    <>
      <span className="text-sm font-medium">{label}</span>
      <Popover>
        <Tip label={t("选择{label}", { label })}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="size-10 shrink-0 rounded-lg border border-border"
              style={{ backgroundColor: simulateCB(value, cbMode) }}
              aria-label={t("选择{label}", { label })}
            />
          </PopoverTrigger>
        </Tip>
        <PopoverContent className="w-64">
          <ColorPicker value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <CopyText
        value={value}
        className="h-10 gap-2 rounded-lg border border-input px-3 font-mono text-sm sm:gap-1"
      />
    </>
  );
}

function suggest(fg: string, bg: string, target: number) {
  const hsl = rgbToHsl(hexToRgb(fg));
  const out: string[] = [];
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= 100; step++) {
      const l = hsl.l + dir * step;
      if (l < 0 || l > 100) break;
      const hex = rgbToHex(hslToRgb({ ...hsl, l }));
      if (contrastRatio(hex, bg) >= target) {
        out.push(hex);
        break;
      }
    }
  }
  return out;
}

/**
 * 翻译函数。**必须当 prop 往下传，不能在卡片内部 `useT()`。**
 *
 * `useT()` 走 `useColora()`，也就是 React context —— context 一变，所有读过它的
 * 组件都会重渲染，`memo` 拦不住（memo 只比较 props，不管 context 订阅）。
 * 而这个 store 的 value 是单个 useMemo，fg/bg 每变一次它就整体重建，
 * 于是 108 张卡全部重渲染，点下去要几百毫秒才看到高亮。
 * `t` 本身只在切语言时才换引用，当 prop 传进去正好是稳定的。
 */
type T = ReturnType<typeof useT>;

/**
 * 色号 + 一键复制。刻意不复用 CopyButton：那个只有图标、不显示色号，
 * 而这里色号本身就是要看的内容，点它即可复制最顺手。
 */
function HexCopy({ value, t }: { value: string; t: T }) {
  const [done, setDone] = useState(false);
  return (
    <Tip label={t("复制 {value}", { value })}>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            /* clipboard blocked */
          }
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        }}
        aria-label={t("复制 {value}", { value })}
        className="inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="truncate">{value}</span>
        {done ? (
          <Check className="size-3 shrink-0 text-green-500" />
        ) : (
          <Copy className="size-3 shrink-0" />
        )}
      </button>
    </Tip>
  );
}

/** AA 达标线。库里只收这条线以上的组合，所以徽章只有 AA / AAA 两档。 */
const MIN_RATIO = 4.5;
/** AAA 达标线。 */
const AAA_RATIO = 7;

type Duo = { bg: string; fg: string; ratio: number };
type TabId = "preview" | "duos";
type DuoLevel = "all" | "AA" | "AAA";

/**
 * 单张配色卡。用 memo 包住，且**内部不碰 store**（见 `T` 的说明）：这个工具每点一次
 * 卡片都会写一次 store，而 store 的 value 是单个 useMemo —— 任何字段变化都会让整棵
 * 应用重渲染。不 memo、或者在卡片里 useT()，108 张卡（每张还挂着 3 个 tooltip）
 * 都要全部重算，点下去要一两秒才看到高亮。
 */
const DuoCard = memo(function DuoCard({
  duo,
  active,
  t,
  onApply,
  onFavorite,
}: {
  duo: Duo;
  active: boolean;
  t: T;
  onApply: (bg: string, fg: string) => void;
  onFavorite: (colors: string[]) => void;
}) {
  return (
    /*
     * 外层是 div 不是 button：卡片里还有「复制色号」「收藏」两个按钮，
     * 按钮不能嵌套按钮。应用配色由上半块色卡自己承担。
     */
    <div
      data-duo-card=""
      className={cn(
        "overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-foreground ring-1 ring-foreground" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => onApply(duo.bg, duo.fg)}
        aria-pressed={active}
        aria-label={t("应用配色组合：{bg} / {fg}", { bg: duo.bg, fg: duo.fg })}
        className="group flex w-full flex-col gap-1 p-4 text-left"
        style={{ backgroundColor: duo.bg, color: duo.fg }}
      >
        <span className="text-base font-semibold leading-tight">{t("标题示例")}</span>
        <span className="text-xs leading-relaxed opacity-90">{t("正文示例")}</span>
        {/* 提示只在 hover / 键盘聚焦时出现，平时不占视觉 */}
        <span className="mt-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75">
          {active ? t("已应用到预览") : t("点击应用到预览")}
        </span>
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-border py-1.5 pr-1.5 pl-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
            style={{ backgroundColor: duo.bg }}
          />
          <HexCopy value={duo.bg} t={t} />
          <span
            className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
            style={{ backgroundColor: duo.fg }}
          />
          <HexCopy value={duo.fg} t={t} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              duo.ratio >= AAA_RATIO
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {duo.ratio >= AAA_RATIO ? "AAA" : "AA"} {duo.ratio.toFixed(1)}
          </span>
          <Tip label={t("收藏这组配色")}>
            <button
              type="button"
              onClick={() => onFavorite([duo.bg, duo.fg])}
              aria-label={t("收藏这组配色")}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Heart className="size-3.5" />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  );
});

export function ContrastTool() {
  const { cbMode, setContrastExport, saved, savePalette } = useColora();
  const [fg, setFg] = useState("#0F172A");
  const [bg, setBg] = useState("#F1F1F1");
  /** 主卡片的两副面孔：当前配色的预览 / 成对配色库。 */
  const [tab, setTab] = useState<TabId>("preview");
  /**
   * 配色库的档位筛选。库里已经只剩 AA 及以上的组合（见下），所以这里是**档位**细分
   * 而不是「是否达标」：AA 档是 4.5–7，AAA 档是 ≥7，全部即两者之和。
   */
  const [duoLevel, setDuoLevel] = useState<DuoLevel>("all");
  const t = useT();

  const ratio = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  const suggestions = useMemo(() => suggest(fg, bg, 4.5), [fg, bg]);

  /**
   * 成对配色库。**只收 AA 及以上**（≥4.5:1）的组合 —— 这个库是拿来直接抄的，
   * 混进不达标的组合只会误导（之前 1.4:1 被标成「大字 1.4」，连大字标准都不到）。
   * 原始数据保持原样，口径改在这里，不达标的不进列表。
   */
  const duos = useMemo(
    () =>
      COLOR_DUOS.map(([bgHex, fgHex]) => ({
        bg: bgHex,
        fg: fgHex,
        ratio: contrastRatio(fgHex, bgHex),
      })).filter((d) => d.ratio >= MIN_RATIO),
    [],
  );
  const visibleDuos = useMemo(
    () =>
      duos.filter((d) =>
        duoLevel === "all" ? true : duoLevel === "AAA" ? d.ratio >= AAA_RATIO : d.ratio < AAA_RATIO,
      ),
    [duos, duoLevel],
  );

  useEffect(() => {
    setContrastExport({ fg, bg, ratio, suggestions });
  }, [bg, fg, ratio, setContrastExport, suggestions]);

  /**
   * 卡片回调的「最新实现」中转站。
   *
   * store 的 value 是单个 useMemo，`saved` 一变就整体重建，`savePalette` 跟着换新引用。
   * 回调若直接依赖它，引用每帧都变，DuoCard 的 memo 就全废了 —— 高亮又会退回
   * 「点完一两秒才亮」。所以回调本身恒定，实现从 ref 里取最新的。
   */
  const latest = useRef({ saved, savePalette, t });
  latest.current = { saved, savePalette, t };

  const applyDuo = useCallback((nextBg: string, nextFg: string) => {
    setBg(nextBg);
    setFg(nextFg);
  }, []);

  /** 收藏一组两色配色。未登录时 store 会自己弹登录提示。 */
  const favorite = useCallback((colors: string[]) => {
    const { saved: list, savePalette: save, t: tr } = latest.current;
    save(tr("配色 {n}", { n: list.length + 1 }), colors);
  }, []);

  /*
   * 两个 tab 各自记住自己的滚动位置 —— 共用同一个滚动容器时，在预览里滚下去再切到
   * 配色组合，会直接落在列表中间（第一行还被吸顶条盖住），看着像页面错位。
   */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollPos = useRef<Record<TabId, number>>({ preview: 0, duos: 0 });

  const readScroll = () => {
    const scroller = findScroller(rootRef.current);
    return scroller ? scroller.scrollTop : window.scrollY;
  };

  const changeTab = (next: TabId) => {
    if (next === tab) return;
    // 趁 DOM 还是旧 tab，先把旧 tab 的位置存下来。
    scrollPos.current[tab] = readScroll();
    setTab(next);
  };

  /*
   * 配色库的虚拟滚动。
   *
   * 173 张卡一次性挂载实测要 1.2 秒（其中 1135ms 花在 react-dom 建 4000+ 宿主节点和
   * 浏览器布局上，我自己的组件只占 110ms）—— 切个 tab 要等一秒，就是这个。
   * 卡片全部等高（实测 135.5px、行距 148px），所以按「行」开窗就够，不用上第三方库。
   * 开窗逻辑抽在 `useWindowedGrid` 里（占位条算法、量高用 rect 等契约见那个 hook 的注释）。
   */
  /** 配色库首次访问才挂载 —— 打开工具时不替一个可能永远不打开的 tab 付挂载成本。
   *  在渲染期 setState（React 的「渲染期调整 state」写法），本次渲染会被丢弃并立刻重渲染，
   *  所以不会先画出一帧空的配色库。 */
  const [duosMounted, setDuosMounted] = useState(false);
  if (tab === "duos" && !duosMounted) setDuosMounted(true);

  const { gridRef, start, end, topPad, bottomPad, syncScroll } = useWindowedGrid(
    rootRef,
    visibleDuos.length,
    // 配色库 tab 没显示时不量测、不监听滚动
    { enabled: tab === "duos" },
  );

  // 用 layout effect：等新 tab 的 DOM 落地、但还没绘制时就归位，否则会闪一帧顶部。
  useIsomorphicLayoutEffect(() => {
    const scroller = findScroller(rootRef.current);
    const top = scrollPos.current[tab];
    if (scroller) scroller.scrollTop = top;
    else window.scrollTo(0, top);
    // 顺带把窗口同步过去，免得首帧按旧位置渲染一批马上又被换掉的卡
    syncScroll(top);
  }, [tab, syncScroll]);

  return (
    <ToolLayout title={t("对比度检查")}>
      <div ref={rootRef} className="flex flex-col">
        {/*
         * 吸顶的只有这一行（tab + 档位筛选）。
         *
         * 不要用负外边距去把它撑满卡片宽度：父级是 flex 列，负 margin-top 会缩短这一项的
         * 外边距盒，后面的配色网格跟着上移，第一行就被吸顶条压掉一截。宽度保持内容宽即可 ——
         * 卡片只可能出现在内容宽度里，下面那条补丁按同样的宽度铺就够了。
         */}
        <div className="z-10 bg-surface pb-4 lg:sticky lg:top-0">
          {/*
           * 卡片顶部那条内边距（1.75rem）要单独补。
           *
           * 滚动容器里 sticky 元素最多只能贴到**内容区**顶部，自身盒子永远够不到
           * padding 那一带 —— 于是滚动时卡片会从吸顶条上方那条缝里露出来（截图里
           * 顶部那几块色卡）。挂一条绝对定位的补丁把这条缝糊上：吸顶时它正好落在
           * 缝里，未吸顶时它跑到卡片外，被卡片的 overflow 裁掉，看不见。
           * 只做 lg：窄屏卡片不裁剪，补丁会糊到卡片外面去。
           */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-full hidden h-7 bg-surface lg:block"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => changeTab(v as TabId)}>
              <TabsList>
                <TabsTrigger value="preview">{t("预览")}</TabsTrigger>
                <TabsTrigger value="duos">{t("配色组合")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === "duos" && (
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "AA", "AAA"] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setDuoLevel(lv)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs",
                      duoLevel === lv
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {lv === "all" ? t("全部") : lv}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground">
                  {t("{n} 组", { n: visibleDuos.length })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/*
         * 两个 tab 都常驻，切换只切显隐。
         *
         * 原来写成 `tab === "preview" ? A : B`，每切一次都要把整棵子树卸载重建 ——
         * 实测 ScriptDuration 0.3~0.4s（布局只占 0.02s），那「等一秒」就是这么来的。
         * 常驻之后切换是一次 className 变更，几乎不花时间。
         *
         * 配色库仍然**首次访问才建**（`duosMounted`）：否则打开工具时就要替一个可能
         * 永远不打开的 tab 付一次挂载成本。
         */}
        <div
          className={
            tab === "preview"
              ? "flex flex-col gap-6"
              : /* 不要写成 "flex ... hidden"：两个 display 类会打架，谁生效取决于生成顺序 */
                "hidden"
          }
        >
          <section
            className="rounded-xl border border-border p-6 sm:p-10"
            style={{ backgroundColor: simulateCB(bg, cbMode), color: simulateCB(fg, cbMode) }}
          >
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("设计让信息清晰可见")}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-90">
              {t("良好的对比度让内容更易阅读，帮助用户快速获取关键信息，提升体验与可访问性。")}
            </p>
            <button
              type="button"
              className="mt-6 rounded-lg px-6 py-3 text-sm font-medium sm:mt-8"
              style={{ backgroundColor: simulateCB(fg, cbMode), color: simulateCB(bg, cbMode) }}
            >
              {t("主要按钮")}
            </button>
            <p className="mt-6 text-xs opacity-80">
              {t("小号文字示例：12px 正文在此背景上的可读性表现。")}
            </p>
          </section>

          {/* 四块面板两列铺开：颜色设置/对比结果 一行，推荐/详情 一行 */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel space-y-4 p-4">
              {/* 标题行右侧放交换按钮：无边框的次要操作，不占额外纵向空间。
                  **右边距保持 0**，这样 hover 底色那圈边框的右缘正好落在内容右缘上，
                  跟下面的色号框、收藏/导出按钮对齐。图标在按钮内部靠自身内边距内缩
                  8px（6px padding + 2px 箭头墨迹留白），这是图标按钮的正常样子 ——
                  别再拿负右边距去把图标墨迹顶到边框上，那样 hover 底色会凸出去。
                  -my-1 只压纵向：不让按钮撑高标题行。 */}
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium text-muted-foreground">{t("颜色设置")}</h3>
                <Tip label={t("交换前景色与背景色")}>
                  <button
                    type="button"
                    onClick={() => {
                      setFg(bg);
                      setBg(fg);
                    }}
                    className="-my-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={t("交换前景色与背景色")}
                  >
                    <ArrowLeftRight className="size-4" />
                  </button>
                </Tip>
              </div>
              {/*
               * 标签列撑开、色块与色号各占一列；两行共用同一套列宽，色块自然对齐。
               * 用网格而不是两行各自 `ml-auto`：后者在两行色号宽度不同时色块会错位。
               */}
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-4">
                <Field label={t("前景色")} value={fg} onChange={setFg} cbMode={cbMode} />
                <Field label={t("背景色")} value={bg} onChange={setBg} cbMode={cbMode} />
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={() => favorite([bg, fg])}>
                <Heart className="size-4" /> {t("收藏当前组合")}
              </Button>
              <ExportDialog
                module="contrast"
                trigger={
                  <Button variant="outline" className="w-full gap-2">
                    <List className="size-4" /> {t("导出当前检查")}
                  </Button>
                }
              />
            </section>

            <section className="panel space-y-4 p-4">
              <h3 className="text-xs font-medium text-muted-foreground">{t("对比结果")}</h3>
              <div>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {t("对比度比率")}
                  <Tip
                    label={
                      <span className="block max-w-60 whitespace-normal leading-relaxed">
                        {t(
                          "对比度比率表示前景色与背景色的亮度差异，范围为 1:1 到 21:1。普通正文建议至少 4.5:1，大号文字至少 3:1。",
                        )}
                      </span>
                    }
                  >
                    <button
                      type="button"
                      className="inline-grid size-5 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("查看对比度比率说明")}
                    >
                      <HelpCircle className="size-3.5" />
                    </button>
                  </Tip>
                </p>
                <p className="mt-1 font-mono text-5xl font-bold tracking-tight">
                  {ratio.toFixed(1)} : 1
                </p>
              </div>
              <div className="flex gap-2">
                {[
                  { label: "AAA", pass: aaa },
                  { label: "AA", pass: aa },
                ].map((r) => (
                  <div
                    key={r.label}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                      r.pass ? "bg-accent text-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.pass ? <Check className="size-4" /> : <span className="text-xs">✕</span>}
                    {r.label} {r.pass ? t("通过") : t("不通过")}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel space-y-4 p-4">
              <h3 className="text-xs font-medium text-muted-foreground">{t("智能推荐替代色")}</h3>
              {aa ? (
                <p className="text-sm text-muted-foreground">
                  {t("当前组合已满足 AA 标准，无需替换。")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFg(s)}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <span
                        className="size-5 rounded border border-border/60"
                        style={{ backgroundColor: s }}
                      />
                      <span className="font-mono text-xs">{s}</span>
                      <span className="text-xs text-muted-foreground">
                        {contrastRatio(s, bg).toFixed(1)}:1
                      </span>
                    </button>
                  ))}
                  {suggestions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("未找到同色相的合格替代色，建议更换背景色。")}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="panel space-y-4 p-4">
              <h3 className="text-xs font-medium text-muted-foreground">{t("对比度详情")}</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: t("正文（小字 < 18px）AA ≥ 4.5:1"), pass: ratio >= 4.5 },
                  { label: t("正文（小字 < 18px）AAA ≥ 7:1"), pass: ratio >= 7 },
                  { label: t("大字（≥ 18px 粗体 / 24px）AA ≥ 3:1"), pass: ratio >= 3 },
                  { label: t("大字 AAA ≥ 4.5:1"), pass: ratio >= 4.5 },
                  { label: t("非文本元素（图标 / 边框）≥ 3:1"), pass: ratio >= 3 },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="shrink-0 font-medium">{r.pass ? t("通过") : t("不通过")}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        {duosMounted && (
          <div
            ref={gridRef}
            className={tab === "duos" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "hidden"}
          >
            {/* 占位条：col-span-full 让它独占一整行，把没渲染的那部分高度补回去 */}
            {topPad > 0 && <div aria-hidden className="col-span-full" style={{ height: topPad }} />}
            {visibleDuos.slice(start, end).map((d) => (
              <DuoCard
                key={`${d.bg}-${d.fg}`}
                duo={d}
                active={d.fg === fg && d.bg === bg}
                t={t}
                onApply={applyDuo}
                onFavorite={favorite}
              />
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
