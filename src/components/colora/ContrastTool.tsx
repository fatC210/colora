import { useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, HelpCircle, List, Sparkles, Check } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import {
  contrastRatio,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  simulateCB,
} from "@/lib/color";
import { ColorPicker } from "./primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="size-10 rounded-lg border border-border"
            style={{ backgroundColor: simulateCB(value, cbMode) }}
            aria-label={`选择${label}`}
          />
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <ColorPicker value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <div className="flex h-10 items-center rounded-lg border border-input px-3 font-mono text-sm">
        {value}
      </div>
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
  const { setColor, cbMode } = useColora();
  const [fg, setFg] = useState("#0F172A");
  const [bg, setBg] = useState("#F1F1F1");
  const [openSuggest, setOpenSuggest] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);

  const ratio = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  const suggestions = useMemo(() => suggest(fg, bg, 4.5), [fg, bg]);

  return (
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-center gap-6 p-4">
        <Field label="前景色" value={fg} onChange={setFg} cbMode={cbMode} />
        <button
          type="button"
          onClick={() => {
            setFg(bg);
            setBg(fg);
          }}
          className="grid size-10 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
          aria-label="交换前景色与背景色"
        >
          <ArrowLeftRight className="size-4" />
        </button>
        <Field label="背景色" value={bg} onChange={setBg} cbMode={cbMode} />
      </section>

      <section
        className="rounded-xl border border-border p-10"
        style={{ backgroundColor: simulateCB(bg, cbMode), color: simulateCB(fg, cbMode) }}
      >
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">设计让信息清晰可见</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-90">
          良好的对比度让内容更易阅读，帮助用户快速获取关键信息，提升体验与可访问性。
        </p>
        <button
          type="button"
          className="mt-8 rounded-lg px-6 py-3 text-sm font-medium"
          style={{ backgroundColor: simulateCB(fg, cbMode), color: simulateCB(bg, cbMode) }}
        >
          主要按钮
        </button>
        <p className="mt-6 text-xs opacity-80">小号文字示例：12px 正文在此背景上的可读性表现。</p>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-8 p-6">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            对比度比率 <HelpCircle className="size-3.5" />
          </p>
          <p className="mt-1 font-mono text-6xl font-bold tracking-tight">
            {ratio.toFixed(1)} : 1
          </p>
        </div>
        <div className="space-y-2">
          {[
            { label: "AAA", pass: aaa },
            { label: "AA", pass: aa },
          ].map((r) => (
            <div
              key={r.label}
              className={cn(
                "flex w-40 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
                r.pass ? "bg-accent text-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {r.pass ? <Check className="size-4" /> : <span className="text-xs">✕</span>}
              {r.label} {r.pass ? "通过" : "不通过"}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <button
          type="button"
          onClick={() => setOpenSuggest((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.6} /> 智能推荐替代色
          </span>
          <ChevronDown className={cn("size-4 transition-transform", openSuggest && "rotate-180")} />
        </button>
        {openSuggest && (
          <div className="border-t border-border px-5 py-4">
            {aa ? (
              <p className="text-sm text-muted-foreground">当前组合已满足 AA 标准，无需替换。</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFg(s)}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <span className="size-5 rounded border border-border/60" style={{ backgroundColor: s }} />
                    <span className="font-mono text-xs">{s}</span>
                    <span className="text-xs text-muted-foreground">
                      {contrastRatio(s, bg).toFixed(1)}:1
                    </span>
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <p className="text-sm text-muted-foreground">未找到同色相的合格替代色，建议更换背景色。</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <button
          type="button"
          onClick={() => setOpenDetail((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex items-center gap-2">
            <List className="size-4 text-muted-foreground" strokeWidth={1.6} /> 对比度详情
          </span>
          <ChevronDown className={cn("size-4 transition-transform", openDetail && "rotate-180")} />
        </button>
        {openDetail && (
          <div className="space-y-2 border-t border-border px-5 py-4 text-sm">
            {[
              { label: "正文（小字 < 18px）AA ≥ 4.5:1", pass: ratio >= 4.5 },
              { label: "正文（小字 < 18px）AAA ≥ 7:1", pass: ratio >= 7 },
              { label: "大字（≥ 18px 粗体 / 24px）AA ≥ 3:1", pass: ratio >= 3 },
              { label: "大字 AAA ≥ 4.5:1", pass: ratio >= 4.5 },
              { label: "非文本元素（图标 / 边框）≥ 3:1", pass: ratio >= 3 },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium">{r.pass ? "通过" : "不通过"}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setColor(fg)}
              className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
            >
              将前景色发送到信息面板
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
