import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Gauge, HelpCircle, List, Palette, Sparkles } from "lucide-react";
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

export function ContrastTool() {
  const { cbMode, setContrastExport } = useColora();
  const [fg, setFg] = useState("#0F172A");
  const [bg, setBg] = useState("#F1F1F1");
  /** 中间卡片的两副面孔：当前配色预览 / 成对配色库。 */
  const [tab, setTab] = useState<"preview" | "duos">("preview");
  /** 配色库默认只看达标的 —— 整份清单里一半以上连 3:1 都不到，全铺出来没意义。 */
  const [duoLevel, setDuoLevel] = useState<"all" | "AA" | "AAA">("AA");
  const t = useT();

  const ratio = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  const suggestions = useMemo(() => suggest(fg, bg, 4.5), [fg, bg]);

  // 等级现算而不是写死在数据里：改评分口径时不会和数据对不上。
  const duos = useMemo(
    () => COLOR_DUOS.map(([bgHex, fgHex]) => ({ bg: bgHex, fg: fgHex, ratio: contrastRatio(fgHex, bgHex) })),
    [],
  );
  const visibleDuos = useMemo(
    () => duos.filter((d) => duoLevel === "all" || (duoLevel === "AAA" ? d.ratio >= 7 : d.ratio >= 4.5)),
    [duos, duoLevel],
  );

  useEffect(() => {
    setContrastExport({ fg, bg, ratio, suggestions });
  }, [bg, fg, ratio, setContrastExport, suggestions]);

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
    <ToolLayout
      title={t("对比度检查")}
      rail={[
        {
          id: "colors",
          icon: Palette,
          title: t("颜色设置"),
          content: (
            <div className="space-y-4">
              {swapButton}
              <Field label={t("前景色")} value={fg} onChange={setFg} cbMode={cbMode} />
              <Field label={t("背景色")} value={bg} onChange={setBg} cbMode={cbMode} />
              <ExportDialog
                module="contrast"
                trigger={
                  <Button variant="outline" className="w-full gap-2">
                    <List className="size-4" /> {t("导出当前检查")}
                  </Button>
                }
              />
            </div>
          ),
        },
        {
          id: "result",
          icon: Gauge,
          title: t("对比结果"),
          content: (
            <div className="flex flex-wrap items-center justify-between gap-6 sm:gap-8">
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
                <p className="mt-1 font-mono text-5xl font-bold tracking-tight sm:text-6xl">
                  {ratio.toFixed(1)} : 1
                </p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto sm:flex-col">
                {[
                  { label: "AAA", pass: aaa },
                  { label: "AA", pass: aa },
                ].map((r) => (
                  <div
                    key={r.label}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium sm:w-40 sm:flex-none sm:justify-start sm:px-4",
                      r.pass ? "bg-accent text-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.pass ? <Check className="size-4" /> : <span className="text-xs">✕</span>}
                    {r.label} {r.pass ? t("通过") : t("不通过")}
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          id: "suggest",
          icon: Sparkles,
          title: t("智能推荐替代色"),
          content: aa ? (
            <p className="text-sm text-muted-foreground">{t("当前组合已满足 AA 标准，无需替换。")}</p>
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
          ),
        },
        {
          id: "details",
          icon: List,
          title: t("对比度详情"),
          content: (
            <div className="space-y-2 text-sm">
              {[
                { label: t("正文（小字 < 18px）AA ≥ 4.5:1"), pass: ratio >= 4.5 },
                { label: t("正文（小字 < 18px）AAA ≥ 7:1"), pass: ratio >= 7 },
                { label: t("大字（≥ 18px 粗体 / 24px）AA ≥ 3:1"), pass: ratio >= 3 },
                { label: t("大字 AAA ≥ 4.5:1"), pass: ratio >= 4.5 },
                { label: t("非文本元素（图标 / 边框）≥ 3:1"), pass: ratio >= 3 },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium">{r.pass ? t("通过") : t("不通过")}</span>
                </div>
              ))}
            </div>
          ),
        },
      ]}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <section
            className="rounded-xl border border-border p-6 sm:p-10"
            style={{ backgroundColor: simulateCB(bg, cbMode), color: simulateCB(fg, cbMode) }}
          >
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("设计让信息清晰可见")}</h2>
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
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDuos.map((d) => {
              const active = d.fg === fg && d.bg === bg;
              return (
                <button
                  key={`${d.bg}-${d.fg}`}
                  type="button"
                  onClick={() => {
                    setFg(d.fg);
                    setBg(d.bg);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                    active ? "border-foreground ring-1 ring-foreground" : "border-border",
                  )}
                >
                  <span
                    className="flex flex-col gap-1 p-4"
                    style={{ backgroundColor: d.bg, color: d.fg }}
                  >
                    <span className="text-base font-semibold leading-tight">{t("标题示例")}</span>
                    <span className="text-xs leading-relaxed opacity-90">{t("正文示例")}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      <span
                        className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
                        style={{ backgroundColor: d.bg }}
                      />
                      <span className="truncate">{d.bg}</span>
                      <span
                        className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
                        style={{ backgroundColor: d.fg }}
                      />
                      <span className="truncate">{d.fg}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        d.ratio >= 7
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : d.ratio >= 4.5
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : d.ratio >= 3
                              ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                              : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {d.ratio >= 7 ? "AAA" : d.ratio >= 4.5 ? "AA" : t("大字")} {d.ratio.toFixed(1)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
