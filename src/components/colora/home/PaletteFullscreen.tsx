import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { bestTextOn, contrastRatio, hexToRgb, rgbToLab, simulateCB } from "@/lib/color";
import { CB_LABELS, type CBMode } from "@/lib/color";
import type { CuratedPalette } from "@/lib/colora-palettes";
import { useColora } from "@/lib/colora-store";
import { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";

/** 打开时的放大动画时长。和关闭共用。 */
const MORPH_MS = 320;

/**
 * 一组配色的全屏视图。
 *
 * 铺满视口的色块 + 底部信息栏（名称 / 对比度 / 色盲切换）+ 右上角关闭。
 *
 * ## 展开动画
 *
 * 用 FLIP：初始把整层 `translate + scale` 到被点卡片的位置，下一帧撤掉变换，
 * 视觉上就是「卡片长大成整屏」。关闭时反向。
 *
 * 用 `transform` 而不是改 `left/top/width/height`：后者会让色块在动画过程中重新排版
 * （每个色块的宽度都在变），文字会抖；`transform` 只是把已经排好的整屏缩下来。
 * 所以要设 `transform-origin: top left` 并自己算平移量 —— 默认的 `center` 会让
 * 缩放以屏幕中心为基准，起点对不上卡片。
 *
 * ## 对比度
 *
 * 一组配色不是一对颜色，所以这里给两个**有意义的**数字：最深与最浅之间的对比度
 * （这组配色的明度跨度够不够），以及两两组合里**最差的一对**（可读性下限 ——
 * 想拿这组配色做正文排版时，那个数字才是拦路的）。
 */
export function PaletteFullscreen({
  palette,
  name,
  originRect,
  onClose,
}: {
  palette: CuratedPalette;
  name: string;
  /** 被点卡片的 rect，动画起点。拿不到时直接淡入。 */
  originRect: DOMRect | null;
  onClose: () => void;
}) {
  const { cbMode, setCbMode } = useColora();
  const t = useT();
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const colors = palette.colors;
  const shown = useMemo(() => colors.map((hex) => simulateCB(hex, cbMode)), [colors, cbMode]);

  // 下一帧撤掉初始变换，触发过渡
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, MORPH_MS);
  }, [onClose]);

  // Escape 关闭 + 打开时把焦点交给关闭按钮（不这么做的话焦点还留在下面的卡片上，
  // 覆盖层里的 Tab 会绕回背景内容）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // 覆盖层期间锁掉背景滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      /* 剪贴板被拒：仍然给出反馈，不静默失败 */
    }
    setCopied(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1400);
  };

  /** 最深 / 最浅的对比度，以及两两之间最差的一对。 */
  const contrast = useMemo(() => {
    const ls = colors.map((hex) => rgbToLab(hexToRgb(hex)).l);
    const lightest = colors[ls.indexOf(Math.max(...ls))];
    const darkest = colors[ls.indexOf(Math.min(...ls))];
    let worst = { a: colors[0], b: colors[0], ratio: Number.POSITIVE_INFINITY };
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const ratio = contrastRatio(colors[i], colors[j]);
        if (ratio < worst.ratio) worst = { a: colors[i], b: colors[j], ratio };
      }
    }
    return { lightest, darkest, extreme: contrastRatio(lightest, darkest), worst };
  }, [colors]);

  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const morphed = !originRect || entered || leaving;

  // 挂到 body 上而不是留在 `<main>` 里：`<main>` 是 grid 的一列，且色盲模拟开启时
  // 它身上有 `filter`（filter 会让后代里的 `position: fixed` 相对**它**定位），
  // 留在原地的话全屏会被左侧栏那条宽度挤掉一截。
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      data-palette-fullscreen=""
      className="fixed inset-0 z-50 overflow-hidden bg-surface"
      style={{
        transformOrigin: "top left",
        transition: `transform ${MORPH_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${MORPH_MS}ms`,
        transform: morphed
          ? leaving && originRect
            ? `translate(${originRect.left}px, ${originRect.top}px) scale(${originRect.width / vw}, ${originRect.height / vh})`
            : "none"
          : `translate(${originRect.left}px, ${originRect.top}px) scale(${originRect.width / vw}, ${originRect.height / vh})`,
        opacity: morphed ? 1 : 0.6,
      }}
    >
      {/* 色块铺满整屏。hover 显示色号、点击复制 —— 和卡片上的色块同一套交互 */}
      <div className="absolute inset-0 flex">
        {colors.map((hex, i) => (
          <button
            key={hex + i}
            type="button"
            onClick={() => copy(hex)}
            aria-label={t("复制 {value}", { value: hex })}
            style={{
              backgroundColor: shown[i],
              // 相邻色块重叠 1px：flex 子项亚像素取整会透出容器底色，形成竖线缝隙
              marginLeft: i > 0 ? -1 : 0,
              transitionDelay: `${i * 40}ms`,
            }}
            className="group/fs relative min-w-0 shrink basis-0 grow cursor-pointer transition-[flex-grow] duration-300 hover:grow-[2] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-sm tracking-tight transition-opacity duration-200",
                copied === hex ? "opacity-0" : "opacity-0 group-hover/fs:opacity-100",
              )}
              style={{ color: bestTextOn(shown[i]) }}
            >
              {hex}
            </span>
            {copied === hex && (
              <Check
                className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-pop"
                style={{ color: bestTextOn(shown[i]) }}
                strokeWidth={3}
              />
            )}
          </button>
        ))}
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={close}
        aria-label={t("关闭全屏")}
        className="absolute top-4 right-4 z-10 cursor-pointer rounded-lg bg-black/35 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-5" />
      </button>

      {/* 底部信息栏：名称 / 对比度 / 色盲切换。
          刻意**不加整条渐变遮罩** —— 那会让色块底部发暗，而这一屏的意义就是看纯色。
          可读性靠文字阴影兜底，色盲按钮自己带半透明胶囊底。 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-4 text-white">
        <div className="min-w-0 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="mt-0.5 text-[11px] opacity-90">
            {t("最深与最浅 {ratio}:1", { ratio: contrast.extreme.toFixed(2) })}
            <span className="mx-1.5 opacity-60">·</span>
            {t("最弱组合 {ratio}:1", { ratio: contrast.worst.ratio.toFixed(2) })}
          </p>
        </div>

        {/* 色盲切换：全局那套模拟本来在账户菜单里，放这里顺手 */}
        <div className="pointer-events-auto flex flex-wrap gap-1">
          {(["none", ...Object.keys(CB_LABELS)] as CBMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCbMode(mode)}
              aria-pressed={cbMode === mode}
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-1 text-[11px] text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                // 底色用**黑**而不是白：配色里常有浅色块，白底白字会糊成一片
                cbMode === mode ? "bg-white text-black" : "bg-black/35 hover:bg-black/50",
              )}
            >
              {mode === "none" ? t("正常") : t(CB_LABELS[mode as keyof typeof CB_LABELS])}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
