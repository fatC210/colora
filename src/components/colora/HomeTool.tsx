import { ArrowRight } from "lucide-react";
import { useColora, type GradientConfig, type GradientStop } from "@/lib/colora-store";
import { generateHarmony, randomHex, simulateCB } from "@/lib/color";
import type { ToolId } from "./Sidebar";
import { visibleTools } from "./Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { Button } from "@/components/ui/button";
import { Tip } from "./primitives";

function gradientPreviewStyle(
  config: GradientConfig,
  stops: GradientStop[],
  cbMode: ReturnType<typeof useColora>["cbMode"],
) {
  const sortedStops = [...stops].sort((a, b) => a.pos - b.pos);
  const list = sortedStops
    .map((stop) => `${simulateCB(stop.hex, cbMode)} ${Math.round(stop.pos)}%`)
    .join(", ");

  if (config.type === "mesh") {
    return {
      backgroundColor: sortedStops[0]?.hex,
      backgroundImage: sortedStops
        .map((stop, index) => {
          const point = stop.mesh ?? { x: 20 + index * 18, y: 30 + (index % 2) * 36 };
          return `radial-gradient(at ${point.x}% ${point.y}%, ${simulateCB(stop.hex, cbMode)} 0px, transparent 55%)`;
        })
        .join(", "),
    };
  }

  return {
    backgroundImage:
      config.type === "linear"
        ? `linear-gradient(${config.angle}deg, ${list})`
        : config.type === "radial"
          ? `radial-gradient(circle at ${config.center.x}% ${config.center.y}%, ${list})`
          : `conic-gradient(from ${config.angle}deg at ${config.center.x}% ${config.center.y}%, ${list})`,
  };
}

const cloneGradientStops = (stops: GradientStop[]) =>
  stops.map((stop) => ({ ...stop, mesh: stop.mesh ? { ...stop.mesh } : undefined }));

/** 首页工具卡片的说明文案，key 是 ToolId（不含 home）。 */
const TOOL_DESCRIPTIONS: Record<Exclude<ToolId, "home">, TKey> = {
  palette: "基于色彩理论自动生成方案，支持锁定与自由选配。",
  gradient: "线性 / 径向 / 锥形 / Mesh 渐变可视化编辑。",
  canvas: "在画布上绘制线条与形状，颜色沿路径弧长分布。",
  mixer: "模拟颜料混合，带液体融合动画与三种混合模式。",
  image: "上传图片，拖动取色点实时提取主色。",
  contrast: "WCAG 对比度检测与智能替代色推荐。",
  preview: "把配色应用到真实组件与设备尺寸中对比。",
};

export function HomeTool({ onTool }: { onTool: (t: ToolId) => void }) {
  const isMobile = useIsMobile();
  const t = useT();
  // 移动端隐藏暂不支持的工具卡片（画布），与侧栏同一来源。
  const tools = visibleTools(isMobile).filter((tool) => tool.id !== "home");
  const {
    palette,
    setPalette,
    setColor,
    cbMode,
    saved,
    favoriteColors,
    favoriteGradients,
    setGradientStops,
    setGradientConfig,
    logoGradient,
    randomizeLogoGradient,
  } = useColora();

  return (
    <div className="space-y-5">
      <section className="panel p-5 sm:p-8">
        <div className="mb-5 flex items-center">
          {/*
            品牌字用 Acme（见 styles.css 的 @font-face），全大写 + 整词渐变。
            渐变色组存在 store 里与侧栏品牌字共享：点这里换色，侧栏跟着一起换。
          */}
          <Tip label={t("试试点击！")}>
            <button
              type="button"
              onClick={randomizeLogoGradient}
              aria-label={t("点击随机切换品牌渐变")}
              className="font-brand bg-clip-text text-3xl leading-none tracking-wide text-transparent transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{
                backgroundImage: `linear-gradient(135deg, ${logoGradient.join(", ")})`,
              }}
            >
              COLORA
            </button>
          </Tip>
        </div>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("调配、混合、预览、导出，一站式完成配色工作")}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t(
            "Colora 是面向设计师与前端开发者的轻量级色彩工具。所见即所得，从选色到拿到代码不超过三步。",
          )}
        </p>

        <div className="mt-7 flex h-40 overflow-hidden rounded-xl border border-border sm:h-28">
          {palette.map((c, i) => (
            <Tip key={i} label={c}>
              <button
                type="button"
                onClick={() => setColor(c)}
                className="flex-1 transition-[flex] duration-300 hover:flex-[1.4]"
                style={{
                  backgroundColor: simulateCB(c, cbMode),
                  // flex 子项亚像素取整会在相邻色块间透出 1px 容器底色，
                  // 形成不规则的竖线缝隙；让每个色块相对前一个重叠 1px 可消除。
                  marginLeft: i > 0 ? -1 : 0,
                }}
                aria-label={c}
              />
            </Tip>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            className="w-full gap-2 sm:w-48"
            onClick={() => setPalette(generateHarmony(randomHex(), "analogous"))}
          >
            {t("随机生成一组配色")}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 sm:w-48"
            onClick={() => onTool("palette")}
          >
            {t("前往配色方案")} <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onTool(tool.id)}
            className="panel flex flex-col items-center gap-2 p-4 text-center transition-colors hover:bg-accent sm:flex-row sm:items-start sm:gap-3 sm:p-5 sm:text-left"
          >
            <tool.icon className="size-5 shrink-0" strokeWidth={1.6} />
            <span>
              <span className="block text-sm font-medium">{t(tool.label)}</span>
              <span className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                {t(TOOL_DESCRIPTIONS[tool.id as Exclude<ToolId, "home">])}
              </span>
            </span>
          </button>
        ))}
      </div>

      {(favoriteColors.length > 0 || saved.length > 0 || favoriteGradients.length > 0) && (
        <section className="panel p-5">
          <h3 className="mb-3 text-sm font-medium">{t("最近收藏")}</h3>
          <div className="space-y-4">
            {favoriteColors.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{t("颜色")}</p>
                <div className="flex flex-wrap gap-2">
                  {favoriteColors.slice(0, 10).map((savedColor) => (
                    <Tip
                      key={savedColor.id}
                      label={t("应用颜色：{name}", { name: savedColor.name })}
                    >
                      <button
                        type="button"
                        onClick={() => setColor(savedColor.hex)}
                        className="size-9 rounded-md border border-border/70"
                        style={{ backgroundColor: simulateCB(savedColor.hex, cbMode) }}
                        aria-label={t("应用颜色：{name}", { name: savedColor.name })}
                      />
                    </Tip>
                  ))}
                </div>
              </div>
            )}
            {saved.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{t("配色方案")}</p>
                <div className="flex flex-wrap gap-3">
                  {saved.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setPalette(s.colors);
                        onTool("palette");
                      }}
                      className="w-40 space-y-1.5 text-left"
                    >
                      <span className="flex h-9 overflow-hidden rounded-md border border-border">
                        {s.colors.map((c, i) => (
                          <span key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      <span className="block truncate text-xs">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {favoriteGradients.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{t("渐变")}</p>
                <div className="flex flex-wrap gap-3">
                  {favoriteGradients.slice(0, 6).map((savedGradient) => (
                    <button
                      key={savedGradient.id}
                      type="button"
                      onClick={() => {
                        setGradientStops(cloneGradientStops(savedGradient.stops));
                        setGradientConfig({
                          ...savedGradient.config,
                          center: { ...savedGradient.config.center },
                        });
                        onTool("gradient");
                      }}
                      className="w-40 space-y-1.5 text-left"
                    >
                      <span
                        className="block h-14 rounded-md border border-border"
                        style={gradientPreviewStyle(
                          savedGradient.config,
                          savedGradient.stops,
                          cbMode,
                        )}
                      />
                      <span className="block truncate text-xs">{savedGradient.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
