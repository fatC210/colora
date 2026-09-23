import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Heart } from "lucide-react";
import { bestTextOn, simulateCB, type CBMode } from "@/lib/color";
import type { CuratedPalette } from "@/lib/colora-palettes";
import type { useT } from "@/lib/i18n/use-t";
import { PaletteCardMenu, type PaletteMenuAction } from "./PaletteCardMenu";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useT>;

/**
 * 一张配色方案卡。视觉照 coolors：**无边框**，一条圆角色带 + 底下一行「名称 + 心形」。
 *
 * ⚠️ 这个组件**不订阅任何 context**：`useColora()` 的 value 是单个 useMemo，
 * `saved` 一变整个应用重渲染；`useT()` 也订阅 store。卡片一旦自己调它们，
 * 120 张卡的 memo 就全废了（`ContrastTool.tsx` 的 DuoCard 注释里记过同一件事）。
 * 所以 `t` 走 prop、收藏状态走 prop，卡片内部只有「刚复制了哪个色」这种瞬时 state。
 *
 * ⚠️ 卡片高度**必须恒定**：色号揭示层是 `absolute` 覆盖，不参与布局；名称一律
 * `truncate`。虚拟滚动靠 `getBoundingClientRect().height` 量卡高，任何一张卡高度
 * 不一样，占位条的总高就错了，滚到底会露白。**颜色数量 3–10 只影响色块宽度分配，
 * 不影响高度** —— 这是「数量不固定」能落地的前提。
 *
 * 交互（照 coolors）：
 * - hover 某个色块 → 它 `grow` 变宽（相邻的收窄），**色号 `#RRGGBB` 显示在该色块中央**。
 *   用 `flex-grow` 而不是 `transform: scale` —— scale 会溢出圆角容器、盖住相邻色块，
 *   还要额外加 `overflow-hidden` 裁掉。grow 天然不出界，也是 coolors 的实际做法。
 * - 点色块 → 复制色号，出现 ✓ 反馈。
 *
 * 色号**不再走原生 `title`** —— 那东西有 1 秒延迟、样式不可控，而且和 hover 放大
 * 是两套反馈。现在是 hover 即刻显示、和放大的那一格绑在一起。
 */
export const PaletteCard = memo(function PaletteCard({
  palette,
  name,
  favorited,
  cbMode,
  t,
  onToggleFavorite,
  onAction,
}: {
  palette: CuratedPalette;
  /** 已翻译的方案名。 */
  name: string;
  favorited: boolean;
  cbMode: CBMode;
  t: T;
  onToggleFavorite: (palette: CuratedPalette) => void;
  /** 菜单里那些要跨组件/跨工具的动作。**恒定引用**，见 `PaletteWall` 的 `latest` ref。 */
  onAction: (palette: CuratedPalette, action: PaletteMenuAction) => void;
}) {
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
    <div data-palette-card="" data-palette-id={palette.id} className="flex flex-col">
      <div className="relative flex h-24 overflow-hidden rounded-xl sm:h-28">
        {colors.map((hex, i) => (
          <button
            key={hex + i}
            type="button"
            onClick={() => copy(hex)}
            aria-label={t("复制 {value}", { value: hex })}
            style={{
              backgroundColor: shown[i],
              // flex 子项亚像素取整会在相邻色块间透出 1px 容器底色，形成不规则竖线缝隙；
              // 让每个色块相对前一个重叠 1px 可消除（旧首页色带同款处理）。
              marginLeft: i > 0 ? -1 : 0,
            }}
            className="group/swatch relative min-w-0 shrink basis-0 grow cursor-pointer transition-[flex-grow] duration-300 hover:grow-[2] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {/*
              色号层。`absolute inset-0` 覆盖在色块上、**不参与布局** —— 卡片高度恒定，
              虚拟滚动的等高契约不破。`pointer-events-none` 免得挡住色块的点击。
              宽度够用：hover 的那一格同时 `grow-[2]` 变宽，最挤的 10 色方案也有 ~55px，
              而 `#RRGGBB` 在 12px 等宽下约 50px —— 所以不需要按色数缩字号。
            */}
            <span
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs tracking-tight transition-opacity duration-200",
                // 刚复制的那一格让位给 ✓，别两个叠在一起
                copied === hex ? "opacity-0" : "opacity-0 group-hover/swatch:opacity-100",
              )}
              style={{ color: bestTextOn(shown[i]) }}
            >
              {hex}
            </span>

            {copied === hex && (
              <Check
                className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 animate-pop"
                style={{ color: bestTextOn(shown[i]) }}
                strokeWidth={3}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>

        <PaletteCardMenu palette={palette} name={name} t={t} onAction={onAction} />

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
