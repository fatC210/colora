import { ArrowRight } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { generateHarmony, randomHex, simulateCB } from "@/lib/color";
import type { ToolId } from "./Sidebar";
import { TOOLS } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

export function HomeTool({ onTool }: { onTool: (t: ToolId) => void }) {
  const { palette, setPalette, setColor, cbMode, saved, logoGradient } = useColora();

  return (
    <div className="space-y-5">
      <section className="panel p-8">
        <div className="mb-5 flex items-baseline" aria-label="Colora">
          <Logo className="size-8 text-foreground" aria-hidden="true" />
          <span className="-ml-2 text-2xl font-semibold tracking-tight" aria-hidden="true">olora</span>
        </div>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          调配、混合、预览、导出，一站式完成配色工作
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Colora 是面向设计师与前端开发者的轻量级色彩工具。所见即所得，从选色到拿到代码不超过三步。
        </p>

        <div className="mt-7 flex h-28 overflow-hidden rounded-xl border border-border">
          {palette.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setColor(c)}
              className="flex-1 transition-[flex] duration-300 hover:flex-[1.4]"
              style={{ backgroundColor: simulateCB(c, cbMode) }}
              aria-label={c}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => setPalette(generateHarmony(randomHex(), "analogous"))}>
            随机生成一组配色
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => onTool("palette")}>
            前往配色方案 <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.filter((t) => t.id !== "home").map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            className="panel flex items-start gap-3 p-5 text-left transition-colors hover:bg-accent"
          >
            <t.icon className="size-5 shrink-0" strokeWidth={1.6} />
            <span>
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {
                  {
                    palette: "基于色彩理论自动生成方案，支持锁定与自由选配。",
                    gradient: "线性 / 径向 / 锥形 / Mesh 渐变可视化编辑。",
                    mixer: "模拟颜料混合，带液体融合动画与三种混合模式。",
                    image: "上传图片，K-means 提取主色与占比。",
                    contrast: "WCAG 对比度检测与智能替代色推荐。",
                    preview: "把配色应用到真实组件与设备尺寸中对比。",
                  }[t.id as Exclude<ToolId, "home">]
                }
              </span>
            </span>
          </button>
        ))}
      </div>

      {saved.length > 0 && (
        <section className="panel p-5">
          <h3 className="mb-3 text-sm font-medium">最近保存的方案</h3>
          <div className="flex flex-wrap gap-3">
            {saved.slice(0, 6).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPalette(s.colors)}
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
        </section>
      )}
    </div>
  );
}
