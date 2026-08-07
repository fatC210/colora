import { useState } from "react";
import {
  Download,
  Heart,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Shuffle,
  Trash2,
  Pencil,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportDialog } from "./ExportDialog";

function SavedPalettes() {
  const { saved, removePalette, renamePalette, setPalette, user } = useColora();
  const [editingPaletteId, setEditingPaletteId] = useState<string | null>(null);

  if (!user) return null;

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">已收藏的配色</h3>
        <span className="text-xs text-muted-foreground">点击卡片即可恢复并继续调整</span>
      </div>
      {saved.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无收藏配色，点击「收藏当前配色」保存。</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {saved.map((s) => (
            <div key={s.id} className="w-44 space-y-1.5">
              <Tip label={`应用方案：${s.name}`}>
                <button
                  type="button"
                  onClick={() => setPalette(s.colors)}
                  aria-label={`应用方案：${s.name}`}
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
                  ariaLabel="重命名方案"
                />
                <span className="flex">
                  <Tip label="重命名方案">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="重命名方案"
                      onClick={() => setEditingPaletteId(s.id)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </Tip>
                  <Tip label="删除方案">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="删除方案"
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
    savePalette(`配色 ${saved.length + 1}`, palette);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="auto">
        <TabsList>
          <TabsTrigger value="auto">自动生成</TabsTrigger>
          <TabsTrigger value="free">自由选配</TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="mt-4 space-y-4">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-start">
              <span className="text-sm font-medium">基础颜色</span>
              <div className="flex items-center gap-3">
                <Popover>
                  <Tip label="选择基础颜色">
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="size-10 rounded-lg border border-border"
                        style={{ backgroundColor: simulateCB(base, cbMode) }}
                        aria-label="选择基础颜色"
                      />
                    </PopoverTrigger>
                  </Tip>
                  <PopoverContent className="w-64">
                    <ColorPicker value={base} onChange={updateBase} />
                  </PopoverContent>
                </Popover>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-input px-3">
                  <input
                    value={base}
                    onChange={(e) => {
                      const n = normalizeHex(e.target.value);
                      if (n) updateBase(n);
                      else setBase(e.target.value.toUpperCase());
                    }}
                    className="w-24 bg-transparent font-mono text-sm outline-none"
                    aria-label="基础色 HEX"
                  />
                  <Pencil className="size-3.5 text-muted-foreground" />
                </div>
              </div>

              {/* 移动端：下拉框，避免 6 个规则按钮换行成两行 */}
              <Select value={rule} onValueChange={(v) => updateRule(v as HarmonyKey)}>
                <SelectTrigger className="w-full sm:hidden" aria-label="配色规则">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HARMONIES.map((h) => (
                    <SelectItem key={h.key} value={h.key}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 桌面端：按钮组 */}
              <div className="hidden flex-wrap gap-1 sm:flex sm:ml-auto">
                {HARMONIES.map((h) => (
                  <button
                    key={h.key}
                    type="button"
                    onClick={() => updateRule(h.key)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                      rule === h.key
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {palette.map((c, i) => (
                <div key={i} className="space-y-2">
                  <div className="relative h-56 w-full rounded-xl border border-border/60">
                    <button
                      type="button"
                      onClick={() => setColor(c)}
                      className="block size-full rounded-xl transition-transform hover:scale-[1.01]"
                      style={{ backgroundColor: simulateCB(c, cbMode) }}
                      aria-label={`选择颜色 ${c}`}
                    />
                    <Tip label={locked[i] ? "已锁定，点击解锁" : "未锁定，点击锁定"}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocked(locked.map((l, li) => (li === i ? !l : l)));
                        }}
                        aria-pressed={locked[i]}
                        aria-label={locked[i] ? "已锁定，点击解锁" : "未锁定，点击锁定"}
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
                      <Tip label="收藏这个颜色">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveColor(c, c);
                          }}
                          aria-label={`收藏颜色 ${c}`}
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

            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
              {user && (
                <Button className="w-full gap-2 sm:w-auto" onClick={favoriteCurrentPalette}>
                  <Heart className="size-4" /> 收藏当前配色
                </Button>
              )}
              <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={regenerate}>
                <RefreshCw className="size-4" /> 重新生成
              </Button>
              <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={fineTune}>
                <Shuffle className="size-4" /> 随机微调
              </Button>
              <ExportDialog
                module="palette"
                trigger={
                  <Button variant="outline" className="w-full gap-2 sm:w-auto">
                    <Download className="size-4" /> 导出当前配色
                  </Button>
                }
              />
            </div>
          </section>

          <SavedPalettes />
        </TabsContent>

        <TabsContent value="free" className="mt-4 space-y-4">
          <FreePicker />
          <SavedPalettes />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FreePicker() {
  const { palette, setPalette, setColor, cbMode, saveColor, user } = useColora();
  const score = harmonyScore(palette);

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium">自由选配（3-10 个颜色）</h3>

        {/* 和谐度评分：等级药丸 + 渐变条，桌面端与移动端统一样式 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">和谐度评分</span>
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
                {score >= 80 ? "优秀" : score >= 60 ? "良好" : score >= 40 ? "一般" : "待优化"}
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
                <Tip label="收藏颜色">
                  <button
                    type="button"
                    onClick={() => saveColor(c, c)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`收藏颜色 ${c}`}
                  >
                    <Heart className="size-3.5" />
                  </button>
                </Tip>
              )}
              <Tip label="删除颜色">
                <button
                  type="button"
                  disabled={palette.length <= 3}
                  onClick={() => setPalette(palette.filter((_, pi) => pi !== i))}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="删除颜色"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </Tip>
            </div>
          </div>
        ))}

        {palette.length < 10 && (
          <Tip label="添加颜色">
            <button
              type="button"
              onClick={() => setPalette([...palette, randomHex()])}
              className="grid h-32 w-full place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground sm:w-32"
              aria-label="添加颜色"
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
