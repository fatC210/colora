import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { X } from "lucide-react";
import { ColoraProvider, useColora } from "@/lib/colora-store";
import { CB_LABELS, cbMatrixValues } from "@/lib/color";
import { Sidebar, TOOLS, type ToolId } from "@/components/colora/Sidebar";
import { InfoPanel } from "@/components/colora/InfoPanel";
import { HomeTool } from "@/components/colora/HomeTool";
import { PaletteTool } from "@/components/colora/PaletteTool";
import { GradientTool } from "@/components/colora/GradientTool";
import { MixerTool } from "@/components/colora/MixerTool";
import { ImageTool } from "@/components/colora/ImageTool";
import { ContrastTool } from "@/components/colora/ContrastTool";
import { PreviewTool } from "@/components/colora/PreviewTool";
import { Tip } from "@/components/colora/primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Colora" },
      {
        name: "description",
        content:
          "Colora 是面向设计师与前端开发者的色彩工具：配色方案生成、渐变编辑、色彩混合、图片取色、对比度检查与实时预览，一键导出代码。",
      },
      { property: "og:title", content: "Colora — 色彩搭配与配色方案工具" },
      {
        property: "og:description",
        content: "调配、混合、预览、导出，一站式完成配色工作。支持深浅色主题与色盲模拟。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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
  const [collapsed, setCollapsed] = useState(false);
  const { cbMode, setCbMode } = useColora();

  const title = TOOLS.find((t) => t.id === tool)?.label ?? "";

  return (
    <div className="colora-app-shell">
      <CbFilters />
      <Sidebar tool={tool} onTool={setTool} />

      <main
        className="colora-main"
        style={cbMode !== "none" ? { filter: `url(#cb-${cbMode})` } : undefined}
      >
        <div className="colora-content-scroller">
          {cbMode !== "none" && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-6 py-3 text-sm">
              <span>当前处于 {CB_LABELS[cbMode]} 模拟模式</span>
              <Tip label="退出色盲模拟">
                <button
                  type="button"
                  onClick={() => setCbMode("none")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="退出色盲模拟"
                >
                  <X className="size-4" />
                </button>
              </Tip>
            </div>
          )}

          <div className="px-6 py-6 lg:px-8">
            <h1 className="mb-5 text-3xl font-bold tracking-tight">{title}</h1>
            {tool === "home" && <HomeTool onTool={setTool} />}
            {tool === "palette" && <PaletteTool />}
            {tool === "gradient" && <GradientTool />}
            {tool === "mixer" && <MixerTool />}
            {tool === "image" && <ImageTool />}
            {tool === "contrast" && <ContrastTool />}
            {tool === "preview" && <PreviewTool />}
          </div>
        </div>

        <InfoPanel collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </main>
    </div>
  );
}
