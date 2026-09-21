import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, Heart } from "lucide-react";
import { bestTextOn, hexToRgb, rgbToLab, simulateCB, type CBMode } from "@/lib/color";
import type { CuratedPalette } from "@/lib/colora-palettes";
import type { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useT>;

/**
 * 色带的宽度权重。
 *
 * **刻意不做成 coolors 那样的五等分** —— 等分色块是最容易被一眼认出来的特征。
 * 这里按各色的 L* 给一个 0.85–1.35 的 flex-grow：浅色铺得宽、深色收得窄，
 * 一组配色看上去像被人挑过的色卡，而不是采样条。纯函数，只跟颜色有关。
 */
function swatchWeight(hex: string) {
  return 0.85 + (rgbToLab(hexToRgb(hex)).l / 100) * 0.5;
}

/**
 * 一张配色方案卡。
 *
 * ⚠️ 这个组件**不订阅任何 context**：`useColora()` 的 value 是单个 useMemo，
 * `saved` 一变整个应用重渲染；`useT()` 也订阅 store。卡片一旦自己调它们，
 * 120 张卡的 memo 就全废了（`ContrastTool.tsx` 的 DuoCard 注释里记过同一件事）。
 * 所以 `t` 走 prop、收藏状态走 prop，卡片内部只有「刚复制了哪个色」这种瞬时 state。
 *
 * ⚠️ 卡片高度**必须恒定**：色号揭示层是 `absolute` 覆盖，不参与布局；名字一律
 * `truncate`。虚拟滚动靠 `getBoundingClientRect().height` 量卡高，任何一张卡高度
 * 不一样，占位条的总高就错了，滚到底会露白。
 */
export const PaletteCard = memo(function PaletteCard({
  palette,
  name,
  tagLabels,
  favorited,
  highlighted,
  cbMode,
  t,
  onToggleFavorite,
}: {
  palette: CuratedPalette;
  /** 已翻译的方案名。 */
  name: string;
  /** 已翻译的标签名，逗号分隔。 */
  tagLabels: string;
  favorited: boolean;
  /** 被工具栏的「随机看一组」跳中时的短暂高亮。 */
  highlighted?: boolean;
  cbMode: CBMode;
  t: T;
  onToggleFavorite: (palette: CuratedPalette) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  /** 刚复制成功的色号；1.4s 后清空（照 `HexCopy` 的写法）。 */
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // 虚拟滚动会把滚出视口的卡片卸载掉，挂着的 timeout 必须清干净。
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const colors = palette.colors;
  const weights = useMemo(() => colors.map(swatchWeight), [colors]);
  const shown = useMemo(() => colors.map((hex) => simulateCB(hex, cbMode)), [colors, cbMode]);

  const copy = useCallback(async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      /* 剪贴板被拒（非安全上下文等）：仍然给出反馈，不静默失败 */
    }
    setCopied(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  }, []);

  return (
    <div
      data-palette-card=""
      className={cn(
        "panel group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md",
        highlighted && "border-foreground ring-1 ring-foreground",
      )}
    >
      <div className="relative flex h-20 shrink-0 sm:h-24">
        {colors.map((hex, i) => (
          <button
            key={hex + i}
            type="button"
            onClick={() => copy(hex)}
            // 原生 title 而不是 Tip：120 张卡 × 5 个色块 = 600 个 Radix Tooltip 实例，
            // 光是挂载就够呛（ContrastTool 的注释里已经点名过 tooltip 的负担）。
            title={hex}
            aria-label={t("复制 {value}", { value: hex })}
            style={
              {
                backgroundColor: shown[i],
                // flex 子项亚像素取整会在相邻色块间透出 1px 容器底色，形成不规则竖线缝隙；
                // 让每个色块相对前一个重叠 1px 可消除（旧首页色带同款处理）。
                marginLeft: i > 0 ? -1 : 0,
                // 宽度走自定义属性而不是直接写 flexGrow：直接写行内样式会盖掉
                // `hover:grow-[1.5]` 那个类（行内样式优先级高于任何 class）。
                "--w": String(weights[i]),
              } as CSSProperties
            }
            className="relative min-w-0 shrink basis-0 grow-[var(--w)] cursor-pointer transition-[flex-grow] duration-300 hover:grow-[1.5] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {copied === hex && (
              <Check
                className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 animate-pop"
                style={{ color: bestTextOn(shown[i]) }}
                strokeWidth={3}
              />
            )}
          </button>
        ))}

        {/*
          色号揭示层。`absolute inset-0` 覆盖在色带上，**不参与布局** —— 卡片高度恒定，
          虚拟滚动的等高契约不破。每格仍是一个可点的复制按钮。
        */}
        {revealed && (
          <div className="absolute inset-0 flex bg-background/92 backdrop-blur-[2px]">
            {colors.map((hex, i) => (
              <button
                key={hex + i}
                type="button"
                onClick={() => copy(hex)}
                aria-label={t("复制 {value}", { value: hex })}
                style={{ flexGrow: weights[i], marginLeft: i > 0 ? -1 : 0 }}
                className="min-w-0 flex-1 basis-0 cursor-pointer font-mono text-[11px] tracking-tight text-foreground transition-colors hover:bg-accent focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {copied === hex ? <Check className="mx-auto size-3.5 animate-pop" /> : hex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/*
        融合条：把同一组颜色融成一条连续渐变。色块是「切开的」，这条是「流动的」——
        两者叠在一起才是这组配色真正的样子，也是与「一排色块 + 一行文字」那种列表
        最主要的视觉差异。

        色标**等距**（不是按色块宽度分布）：色块那边是不等宽的，这条要是跟着走，
        就退化成「稍微模糊一点的色带」，看不出融合。等距才是「这组色混在一起」的样子。
      */}
      <div
        aria-hidden
        className="h-1.5 shrink-0"
        style={{
          backgroundImage: `linear-gradient(90deg, ${shown
            .map((hex, i) => `${hex} ${((i / Math.max(1, shown.length - 1)) * 100).toFixed(1)}%`)
            .join(", ")})`,
        }}
      />

      <div className="flex items-center gap-2 border-t border-border px-2.5 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{name}</span>
          {tagLabels && (
            <span className="block truncate text-[10px] text-muted-foreground">{tagLabels}</span>
          )}
        </span>

        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
          aria-label={revealed ? t("隐藏色号") : t("查看色号")}
          className={cn(
            "shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            revealed ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {revealed ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(palette)}
          aria-pressed={favorited}
          aria-label={favorited ? t("取消收藏") : t("收藏这组配色")}
          className={cn(
            "shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            favorited ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Heart className={cn("size-3.5", favorited && "fill-current")} />
        </button>
      </div>
    </div>
  );
});
