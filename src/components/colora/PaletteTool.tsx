import { useEffect, useState } from "react";
import { Lock, LockOpen, Plus, RefreshCw, Shuffle, Trash2, Pencil } from "lucide-react";
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
import { ColorPicker, CopyButton, Swatch, Tip } from "./primitives";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function SavedPalettes({ colors }: { colors: string[] }) {
  const { saved, savePalette, removePalette, renamePalette, setPalette, user } = useColora();
  const [name, setName] = useState("");

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">已保存的方案</h3>
        {!user && <span className="text-xs text-muted-foreground">登录后可保存方案</span>}
      </div>
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
              <span className="truncate text-xs">{s.name}</span>
              <span className="flex">
                <Tip label="重命名方案">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="重命名方案"
                    onClick={() => {
                      const n = prompt("重命名方案", s.name);
                      if (n) renamePalette(s.id, n);
                    }}
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

        <Popover>
          <Tip label={user ? "保存当前方案" : "请先登录"}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!user}
                aria-label={user ? "保存当前方案" : "请先登录"}
                className="grid h-9 w-14 place-items-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </PopoverTrigger>
          </Tip>
          <PopoverContent className="w-64 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="方案名称"
            />
            <Button
              className="w-full"
              disabled={!name.trim()}
              onClick={() => {
                savePalette(name.trim(), colors);
                setName("");
              }}
            >
              保存
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

export function PaletteTool() {
  const { color, setColor, palette, setPalette, cbMode } = useColora();
  const [rule, setRule] = useState<HarmonyKey>("complementary");
  const [locked, setLocked] = useState<boolean[]>([true, false, false, false, false]);
  const [base, setBase] = useState(color);

  useEffect(() => {
    setPalette(generateHarmony(base, rule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, rule]);

  const regenerate = () => {
    const next = generateHarmony(randomHex(), rule);
    setPalette(palette.map((c, i) => (locked[i] ? c : next[i] ?? randomHex())));
  };

  const fineTune = () =>
    setPalette(palette.map((c, i) => (locked[i] ? c : jitter(c))));

  return (
    <div className="space-y-4">
      <Tabs defaultValue="auto">
        <TabsList>
          <TabsTrigger value="auto">自动生成</TabsTrigger>
          <TabsTrigger value="free">自由选配</TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="mt-4 space-y-4">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">基础颜色</span>
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
                    <ColorPicker value={base} onChange={setBase} />
                  </PopoverContent>
                </Popover>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-input px-3">
                  <input
                    value={base}
                    onChange={(e) => {
                      const n = normalizeHex(e.target.value);
                      if (n) setBase(n);
                      else setBase(e.target.value.toUpperCase());
                    }}
                    className="w-24 bg-transparent font-mono text-sm outline-none"
                    aria-label="基础色 HEX"
                  />
                  <Pencil className="size-3.5 text-muted-foreground" />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {HARMONIES.map((h) => (
                  <button
                    key={h.key}
                    type="button"
                    onClick={() => setRule(h.key)}
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
                  <button
                    type="button"
                    onClick={() => setColor(c)}
                    className="relative block h-56 w-full rounded-xl border border-border/60 transition-transform hover:scale-[1.01]"
                    style={{ backgroundColor: simulateCB(c, cbMode) }}
                  >
                    <Tip label={locked[i] ? "解锁该色" : "锁定该色"}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocked(locked.map((l, li) => (li === i ? !l : l)));
                        }}
                        aria-label={locked[i] ? "解锁该色" : "锁定该色"}
                        className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-background/90 text-foreground"
                      >
                        {locked[i] ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                      </span>
                    </Tip>
                  </button>
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-mono text-sm">{c}</span>
                    <CopyButton value={c} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="gap-2" onClick={regenerate}>
                <RefreshCw className="size-4" /> 重新生成
              </Button>
              <Button variant="outline" className="gap-2" onClick={fineTune}>
                <Shuffle className="size-4" /> 随机微调
              </Button>
            </div>
          </section>

          <SavedPalettes colors={palette} />
        </TabsContent>

        <TabsContent value="free" className="mt-4 space-y-4">
          <FreePicker />
          <SavedPalettes colors={palette} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FreePicker() {
  const { palette, setPalette, setColor, cbMode } = useColora();
  const score = harmonyScore(palette);

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">自由选配（3-10 个颜色）</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">和谐度评分</span>
          <span className="font-mono text-lg font-semibold">{score}</span>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {palette.map((c, i) => (
          <div key={i} className="w-32 space-y-2">
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
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">{c}</span>
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
              className="grid h-32 w-32 place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground"
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
