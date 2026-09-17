import { useState } from "react";
import {
  Download,
  Heart,
  Lock,
  LockOpen,
  Palette,
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trash2,
  Pencil,
  Wand2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useColora } from "@/lib/colora-store";
import {
  HARMONIES,
  generateHarmony,
  harmonyScore,
  jitter,
  normalizeHex,
  randomHex,
  simulateCB,
  type HarmonyKey,
} from "@/lib/color";
import { ColorPicker, CopyText, InlineRename, Swatch, Tip } from "./primitives";
import { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportDialog } from "./ExportDialog";
import { FavoriteColorsPanel } from "./FavoriteColorsPanel";
import { ToolLayout } from "./ToolLayout";

function SavedPalettes() {
  const { saved, removePalette, renamePalette, setPalette, user } = useColora();
  const [editingPaletteId, setEditingPaletteId] = useState<string | null>(null);
  const t = useT();

  if (!user) return null;

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("已收藏的配色")}</h3>
        <span className="text-xs text-muted-foreground">{t("点击卡片即可恢复并继续调整")}</span>
      </div>
      {saved.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("暂无收藏配色，点击「收藏当前配色」保存。")}
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {saved.map((s) => (
            <div key={s.id} className="w-44 space-y-1.5">
              <Tip label={t("应用方案：{name}", { name: s.name })}>
                <button
                  type="button"
                  onClick={() => setPalette(s.colors)}
                  aria-label={t("应用方案：{name}", { name: s.name })}
                  className="flex h-9 w-full overflow-hidden rounded-md border border-border"
                >
                  {s.colors.map((c, i) => (
                    <span key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </button>
              </Tip>
              <div className="flex items-center justify-between gap-1">
                <InlineRename
                  value={s.name}
                  editing={editingPaletteId === s.id}
                  onEditingChange={(editing) => setEditingPaletteId(editing ? s.id : null)}
                  onSave={(nextName) => renamePalette(s.id, nextName)}
                  className="flex-1"
                  textClassName="text-xs"
                  ariaLabel={t("重命名方案")}
                />
                <span className="flex">
                  <Tip label={t("重命名方案")}>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={t("重命名方案")}
                      onClick={() => setEditingPaletteId(s.id)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </Tip>
                  <Tip label={t("删除方案")}>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={t("删除方案")}
                      onClick={() => removePalette(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tip>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PaletteTool() {
  const { color, setColor, palette, setPalette, cbMode, savePalette, saved, saveColor, user } =
    useColora();
  const [rule, setRule] = useState<HarmonyKey>("complementary");
  const [locked, setLocked] = useState<boolean[]>([true, false, false, false, false]);
  const [base, setBase] = useState(palette[0] ?? color);
  const t = useT();

  const updateBase = (nextBase: string) => {
    setBase(nextBase);
    setPalette(generateHarmony(nextBase, rule));
  };

  const updateRule = (nextRule: HarmonyKey) => {
    setRule(nextRule);

    const normalizedBase = normalizeHex(base);
    if (normalizedBase) setPalette(generateHarmony(normalizedBase, nextRule));
  };

  const regenerate = () => {
    const next = generateHarmony(randomHex(), rule);
    setPalette(palette.map((c, i) => (locked[i] ? c : (next[i] ?? randomHex()))));
  };

  const fineTune = () => setPalette(palette.map((c, i) => (locked[i] ? c : jitter(c))));

  const favoriteCurrentPalette = () => {
    savePalette(t("配色 {n}", { n: saved.length + 1 }), palette);
  };

  return (
    <ToolLayout
      title={t("配色方案")}
      rail={[
        {
          id: "base",
          icon: Palette,
          title: t("基础颜色"),
          content: (
            <div className="flex items-center gap-3">
              <Popover>
                <Tip label={t("选择基础颜色")}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="size-10 shrink-0 rounded-lg border border-border"
                      style={{ backgroundColor: simulateCB(base, cbMode) }}
                      aria-label={t("选择基础颜色")}
                    />
                  </PopoverTrigger>
                </Tip>
                <PopoverContent className="w-64">
                  <ColorPicker value={base} onChange={updateBase} />
                </PopoverContent>
              </Popover>
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-3">
                <input
                  value={base}
                  onChange={(e) => {
                    const n = normalizeHex(e.target.value);
                    if (n) updateBase(n);
                    else setBase(e.target.value.toUpperCase());
                  }}
                  className="w-full min-w-0 bg-transparent font-mono text-sm outline-none"
                  aria-label={t("基础色 HEX")}
                />
                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
              </div>
            </div>
          ),
        },
        {
          id: "harmony",
          icon: Sparkles,
          title: t("配色规则"),
          content: (
            <div className="space-y-1">
              {HARMONIES.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => updateRule(h.key)}
                  className={cn(
                    "flex w-full items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    rule === h.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t(h.label)}
                </button>
              ))}
            </div>
          ),
        },
        {
          id: "actions",
          icon: Wand2,
          title: t("配色操作"),
          content: (
            <div className="flex flex-col gap-2">
              {user && (
                <Button className="w-full gap-2" onClick={favoriteCurrentPalette}>
                  <Heart className="size-4" /> {t("收藏当前配色")}
                </Button>
              )}
              <Button variant="outline" className="w-full gap-2" onClick={regenerate}>
                <RefreshCw className="size-4" /> {t("重新生成")}
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={fineTune}>
                <Shuffle className="size-4" /> {t("随机微调")}
              </Button>
              <ExportDialog
                module="palette"
                trigger={
                  <Button variant="outline" className="w-full gap-2">
                    <Download className="size-4" /> {t("导出当前配色")}
                  </Button>
                }
              />
            </div>
          ),
        },
        {
          // 收藏颜色的重命名/删除此前只有 InfoPanel 有入口，随它下线迁到这里。
          // 未登录时整项不出现（面板与图标栏都不出现），所以不用让组件自己返回 null。
          id: "favorites",
          icon: Heart,
          title: t("收藏颜色"),
          visible: !!user,
          content: <FavoriteColorsPanel />,
        },
      ]}
    >
      <Tabs defaultValue="auto">
        <TabsList>
          <TabsTrigger value="auto">{t("自动生成")}</TabsTrigger>
          <TabsTrigger value="free">{t("自由选配")}</TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="mt-4 space-y-4">
          <section className="panel p-5">
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {palette.map((c, i) => (
                <div key={i} className="space-y-2">
                  <div className="relative h-56 w-full rounded-xl border border-border/60">
                    <button
                      type="button"
                      onClick={() => setColor(c)}
                      className="block size-full rounded-xl transition-transform hover:scale-[1.01]"
                      style={{ backgroundColor: simulateCB(c, cbMode) }}
                      aria-label={t("选择颜色 {hex}", { hex: c })}
                    />
                    <Tip label={locked[i] ? t("已锁定，点击解锁") : t("未锁定，点击锁定")}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocked(locked.map((l, li) => (li === i ? !l : l)));
                        }}
                        aria-pressed={locked[i]}
                        aria-label={locked[i] ? t("已锁定，点击解锁") : t("未锁定，点击锁定")}
                        className={cn(
                          "absolute right-3 top-3 grid size-9 place-items-center rounded-full shadow-sm ring-1 ring-inset transition-colors",
                          locked[i]
                            ? "bg-foreground text-background ring-background/30"
                            : "bg-background/85 text-muted-foreground ring-foreground/25 hover:bg-background hover:text-foreground",
                        )}
                      >
                        {locked[i] ? (
                          <Lock className="size-4 stroke-[2.5]" />
                        ) : (
                          <LockOpen className="size-4" />
                        )}
                      </button>
                    </Tip>
                    {user && (
                      <Tip label={t("收藏这个颜色")}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveColor(c, c);
                          }}
                          aria-label={t("收藏颜色 {hex}", { hex: c })}
                          className="absolute left-3 top-3 grid size-9 place-items-center rounded-full bg-background/85 text-muted-foreground shadow-sm ring-1 ring-inset ring-foreground/25 transition-colors hover:bg-background hover:text-foreground"
                        >
                          <Heart className="size-4" />
                        </button>
                      </Tip>
                    )}
                  </div>
                  <div className="flex items-center justify-center">
                    <CopyText value={c} className="font-mono text-sm" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <SavedPalettes />
        </TabsContent>

        <TabsContent value="free" className="mt-4 space-y-4">
          <FreePicker />
          <SavedPalettes />
        </TabsContent>
      </Tabs>
    </ToolLayout>
  );
}

function FreePicker() {
  const { palette, setPalette, setColor, cbMode, saveColor, user } = useColora();
  const score = harmonyScore(palette);
  const t = useT();

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium">{t("自由选配（3-10 个颜色）")}</h3>

        {/* 和谐度评分：等级药丸 + 渐变条，桌面端与移动端统一样式 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("和谐度评分")}</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold leading-none">{score}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  score >= 80
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : score >= 60
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : score >= 40
                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                )}
              >
                {score >= 80
                  ? t("优秀")
                  : score >= 60
                    ? t("良好")
                    : score >= 40
                      ? t("一般")
                      : t("待优化")}
              </span>
            </div>
          </div>
          <div
            className="relative h-2.5 w-40 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 transition-[width] duration-300"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-3">
        {palette.map((c, i) => (
          <div key={i} className="w-full space-y-2 sm:w-32">
            <Popover>
              <Tip label={c}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-32 w-full rounded-xl border border-border/60"
                    style={{ backgroundColor: simulateCB(c, cbMode) }}
                    onDoubleClick={() => setColor(c)}
                    aria-label={c}
                  />
                </PopoverTrigger>
              </Tip>
              <PopoverContent className="w-64">
                <ColorPicker
                  value={c}
                  onChange={(hex) => setPalette(palette.map((p, pi) => (pi === i ? hex : p)))}
                />
              </PopoverContent>
            </Popover>
            <div className="flex items-center justify-between gap-1">
              <CopyText value={c} className="font-mono text-xs" />
              {user && (
                <Tip label={t("收藏颜色")}>
                  <button
                    type="button"
                    onClick={() => saveColor(c, c)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t("收藏颜色 {hex}", { hex: c })}
                  >
                    <Heart className="size-3.5" />
                  </button>
                </Tip>
              )}
              <Tip label={t("删除颜色")}>
                <button
                  type="button"
                  disabled={palette.length <= 3}
                  onClick={() => setPalette(palette.filter((_, pi) => pi !== i))}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={t("删除颜色")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </Tip>
            </div>
          </div>
        ))}

        {palette.length < 10 && (
          <Tip label={t("添加颜色")}>
            <button
              type="button"
              onClick={() => setPalette([...palette, randomHex()])}
              className="grid h-32 w-full place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground sm:w-32"
              aria-label={t("添加颜色")}
            >
              <Plus className="size-5" />
            </button>
          </Tip>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {palette.map((c, i) => (
          <Swatch key={i} hex={c} className="size-8" onClick={() => setColor(c)} />
        ))}
      </div>
    </section>
  );
}
