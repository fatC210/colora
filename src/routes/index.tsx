import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ColoraProvider, useColora } from "@/lib/colora-store";
import { CB_LABELS, cbMatrixValues } from "@/lib/color";
import { Sidebar, TOOLS, type ToolId } from "@/components/colora/Sidebar";
import { HomeTool } from "@/components/colora/HomeTool";
import { PaletteTool } from "@/components/colora/PaletteTool";
import { GradientTool } from "@/components/colora/GradientTool";
import { CanvasTool } from "@/components/colora/CanvasTool";
import { MixerTool } from "@/components/colora/MixerTool";
import { ImageTool } from "@/components/colora/ImageTool";
import { ContrastTool } from "@/components/colora/ContrastTool";
import { PreviewTool } from "@/components/colora/PreviewTool";
import { Tip } from "@/components/colora/primitives";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStoredLang, translate, type TKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";

export const Route = createFileRoute("/")({
  // head 不是 React 组件，拿不到 hook，所以直接读已存偏好 + 纯函数翻译。
  // SSR 时 getStoredLang() 兜底返回 "zh"，客户端导航会用真实偏好重算。
  head: () => {
    const t = (key: TKey) => translate(getStoredLang(), key);
    return {
      meta: [
        { title: "Colora" },
        {
          name: "description",
          content: t(
            "Colora 是面向设计师与前端开发者的色彩工具：配色方案生成、渐变编辑、色彩混合、图片取色、对比度检查与实时预览，一键导出代码。",
          ),
        },
        { property: "og:title", content: t("Colora — 色彩搭配与配色方案工具") },
        {
          property: "og:description",
          content: t("调配、混合、预览、导出，一站式完成配色工作。支持深浅色主题与色盲模拟。"),
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: () => (
    <ColoraProvider>
      <ColoraApp />
    </ColoraProvider>
  ),
});

function CbFilters() {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        {(Object.keys(CB_LABELS) as (keyof typeof CB_LABELS)[]).map((m) => (
          <filter key={m} id={`cb-${m}`}>
            <feColorMatrix type="matrix" values={cbMatrixValues(m)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

function ColoraApp() {
  const [tool, setTool] = useState<ToolId>("palette");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { cbMode, setCbMode, zenMode, toggleZen } = useColora();
  const t = useT();
  const isMobile = useIsMobile();

  // 移动端不支持画布：入口已在侧栏/首页隐藏，这里再兜底两条绕过入口的路径——
  //   1) 桌面端开启的 Zen 模式（持久化在 localStorage），移动端打开会直接进入画布且侧栏隐藏、无处可退；
  //   2) 窗口从桌面端缩窄到移动端时，当前 tool 仍停留在画布。
  // 用派生值立即纠正（不等 effect），避免纠正前渲染出一帧空屏。
  const canvasBlocked = isMobile && (tool === "canvas" || zenMode);
  const effectiveTool: ToolId = isMobile && tool === "canvas" ? "palette" : tool;
  const effectiveZen = zenMode && !canvasBlocked;
  const showCanvas = !canvasBlocked && (zenMode || tool === "canvas");

  // 同步真实状态，使 localStorage 与选中态一致（派生值只负责渲染）。
  useEffect(() => {
    if (!isMobile) return;
    if (zenMode) toggleZen();
    if (tool === "canvas") setTool("palette");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, zenMode, tool]);

  const activeTool = TOOLS.find((item) => item.id === effectiveTool);
  const title = activeTool ? t(activeTool.label) : "";

  return (
    <div className="colora-app-shell">
      {!effectiveZen && <CbFilters />}
      {!effectiveZen && (
        <Sidebar
          tool={effectiveTool}
          onTool={(t) => {
            setTool(t);
            setMobileNavOpen(false);
          }}
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
        />
      )}

      <main
        className="colora-main"
        style={cbMode !== "none" ? { filter: `url(#cb-${cbMode})` } : undefined}
      >
        <div className="colora-content-scroller">
          {!effectiveZen && cbMode !== "none" && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-4 py-3 text-sm sm:px-6">
              <span>{t("当前处于 {mode} 模拟模式", { mode: t(CB_LABELS[cbMode]) })}</span>
              <Tip label={t("退出色盲模拟")}>
                <button
                  type="button"
                  onClick={() => setCbMode("none")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("退出色盲模拟")}
                >
                  <X className="size-4" />
                </button>
              </Tip>
            </div>
          )}

          {/* 画布工具常驻挂载（hidden 切换显隐），避免切走再切回时丢失笔画/重置状态。 */}
          <div className={showCanvas ? "contents" : "hidden"}>
            <CanvasTool />
          </div>

          {!effectiveZen && !showCanvas && (
            <div className="colora-page px-4 py-5 sm:px-6 sm:py-6 lg:py-2 lg:pr-2 lg:pl-0">
              <h1 className="colora-page-title mb-4 text-2xl font-bold tracking-tight sm:mb-5 sm:text-3xl">
                {title}
              </h1>
              {effectiveTool === "home" && <HomeTool onTool={setTool} />}
              {effectiveTool === "palette" && <PaletteTool />}
              {effectiveTool === "gradient" && <GradientTool />}
              {effectiveTool === "mixer" && <MixerTool />}
              {effectiveTool === "image" && <ImageTool />}
              {effectiveTool === "contrast" && <ContrastTool />}
              {effectiveTool === "preview" && <PreviewTool />}
            </div>
          )}
        </div>

        </main>
    </div>
  );
}
