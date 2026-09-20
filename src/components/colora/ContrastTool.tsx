import { useEffect, useMemo, useState } from "react";
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
    <div className="flex w-full items-center gap-3">
      <span className="text-sm font-medium">{label}</span>
      <Popover>
        <Tip label={t("选择{label}", { label })}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="size-10 ml-auto shrink-0 rounded-lg border border-border"
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
    </div>
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
 * 色号 + 一键复制。刻意不复用 CopyButton：那个只有图标、不显示色号，
 * 而这里色号本身就是要看的内容，点它即可复制最顺手。
 */
function HexCopy({ value }: { value: string }) {
  const t = useT();
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

/** 达标徽章配色：AAA / AA / 大字 / 不达标各一档。 */
function ratioBadge(ratio: number) {
  if (ratio >= 7) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (ratio >= 4.5) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (ratio >= 3) return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
}

export function ContrastTool() {
  const { cbMode, setContrastExport, saved, savePalette } = useColora();
  const [fg, setFg] = useState("#0F172A");
  const [bg, setBg] = useState("#F1F1F1");
  /** 主卡片的两副面孔：当前配色的预览 / 成对配色库。 */
  const [tab, setTab] = useState<"preview" | "duos">("preview");
  /**
   * 配色库的达标筛选。默认「全部」，与 duo.alexpate.com 一致（那个站也是默认不筛，
   * 点它的 AA 开关才只留达标的）—— 默认筛掉会让人以为库里只有那几十组。
   */
  const [duoLevel, setDuoLevel] = useState<"all" | "AA" | "AAA">("all");
  const t = useT();

  const ratio = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  const suggestions = useMemo(() => suggest(fg, bg, 4.5), [fg, bg]);

  // 等级现算而不是写死在数据里：改评分口径时不会和数据对不上。
  const duos = useMemo(
    () =>
      COLOR_DUOS.map(([bgHex, fgHex]) => ({
        bg: bgHex,
        fg: fgHex,
        ratio: contrastRatio(fgHex, bgHex),
      })),
    [],
  );
  const visibleDuos = useMemo(
    () =>
      duos.filter((d) => duoLevel === "all" || (duoLevel === "AAA" ? d.ratio >= 7 : d.ratio >= 4.5)),
    [duos, duoLevel],
  );

  useEffect(() => {
    setContrastExport({ fg, bg, ratio, suggestions });
  }, [bg, fg, ratio, setContrastExport, suggestions]);

  /** 收藏一组两色配色。未登录时 store 会自己弹登录提示。 */
  const favorite = (colors: string[]) =>
    savePalette(t("配色 {n}", { n: saved.length + 1 }), colors);

  const swapButton = (
    <Tip label={t("交换前景色与背景色")}>
      <button
        type="button"
        onClick={() => {
          setFg(bg);
          setBg(fg);
        }}
        className="grid size-10 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
        aria-label={t("交换前景色与背景色")}
      >
        <ArrowLeftRight className="size-4" />
      </button>
    </Tip>
  );

  return (
    <ToolLayout title={t("对比度检查")}>
      <div className="flex flex-col">
        {/* gap 由吸顶那一行的下内边距提供：gap 是透明的，滚动时卡片会从缝里透出来 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface pb-4 shadow-[0_-2rem_0_0_var(--color-surface)] lg:sticky lg:top-0 lg:z-10">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "preview" | "duos")}>
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

        {tab === "preview" ? (
          /* 预览占满宽度在上，参数面板两列铺在下 —— 单列竖排会把右半边留空。 */
          <div className="flex flex-col gap-6">
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
                <h3 className="text-xs font-medium text-muted-foreground">{t("颜色设置")}</h3>
                {swapButton}
                <Field label={t("前景色")} value={fg} onChange={setFg} cbMode={cbMode} />
                <Field label={t("背景色")} value={bg} onChange={setBg} cbMode={cbMode} />
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => favorite([bg, fg])}
                >
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
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t("智能推荐替代色")}
                </h3>
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
                      <span className="shrink-0 font-medium">
                        {r.pass ? t("通过") : t("不通过")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDuos.map((d) => {
              const active = d.fg === fg && d.bg === bg;
              return (
                /*
                 * 外层是 div 不是 button：卡片里还有「复制色号」「收藏」两个按钮，
                 * 按钮不能嵌套按钮。应用配色由上半块色卡自己承担。
                 */
                <div
                  key={`${d.bg}-${d.fg}`}
                  className={cn(
                    "overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md",
                    active ? "border-foreground ring-1 ring-foreground" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setFg(d.fg);
                      setBg(d.bg);
                    }}
                    aria-pressed={active}
                    aria-label={t("应用配色组合：{bg} / {fg}", { bg: d.bg, fg: d.fg })}
                    className="group flex w-full flex-col gap-1 p-4 text-left"
                    style={{ backgroundColor: d.bg, color: d.fg }}
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
                        style={{ backgroundColor: d.bg }}
                      />
                      <HexCopy value={d.bg} />
                      <span
                        className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
                        style={{ backgroundColor: d.fg }}
                      />
                      <HexCopy value={d.fg} />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          ratioBadge(d.ratio),
                        )}
                      >
                        {d.ratio >= 7 ? "AAA" : d.ratio >= 4.5 ? "AA" : t("大字")}{" "}
                        {d.ratio.toFixed(1)}
                      </span>
                      <Tip label={t("收藏这组配色")}>
                        <button
                          type="button"
                          onClick={() => favorite([d.bg, d.fg])}
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
            })}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}