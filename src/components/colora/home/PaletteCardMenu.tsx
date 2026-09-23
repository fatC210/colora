import { Info, Maximize2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CuratedPalette } from "@/lib/colora-palettes";
import type { useT } from "@/lib/i18n/use-t";
import { formatPalette } from "../export-dialog/palette-formats";
import { canvasToBlob, colorPng, colorSvg } from "../export-dialog/exporters";
import { copy, download } from "../export-dialog/utils";

type T = ReturnType<typeof useT>;

/** 卡片菜单里会绕回 `PaletteWall` 的动作。纯本地的（复制 / 导出）不走这里。 */
export type PaletteMenuAction = "fullscreen" | "info" | "to-gradient" | "to-palette";

/**
 * 配色卡片的三点菜单。
 *
 * ⚠️ 和 `PaletteCard` 一样**不订阅任何 context** —— `t` 走 prop。菜单的展开态由
 * `DropdownMenu` 自己管，内容渲染在 body 上的 Portal 里，**不参与卡片布局**，
 * 所以卡片高度恒定的契约不破（虚拟滚动靠量卡高）。
 *
 * 「复制为 / 导出」在本地就能做完（`copy` / `download` 是纯函数，不碰 store），
 * 只有跨工具的动作才绕回 `PaletteWall` 的 `onAction` —— 那条路径要保持恒定引用。
 */
export function PaletteCardMenu({
  palette,
  name,
  t,
  onAction,
}: {
  palette: CuratedPalette;
  name: string;
  t: T;
  onAction: (palette: CuratedPalette, action: PaletteMenuAction) => void;
}) {
  const colors = palette.colors;
  const formats = formatPalette(colors);

  const copyAs = async (label: string, value: string) => {
    await copy(value);
    toast.success(t("已复制{label}", { label }));
  };

  const exportPng = () => {
    const canvas = colorPng([...colors]);
    if (!canvas) {
      toast.error(t("导出失败"));
      return;
    }
    canvasToBlob(canvas, `${name}.png`);
  };

  const exportSvg = () => {
    download(`${name}.svg`, colorSvg([...colors]), "image/svg+xml");
  };

  const exportJson = () => {
    download(`${name}.json`, JSON.stringify(colors, null, 2), "application/json");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("更多操作")}
        className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onAction(palette, "fullscreen")}>
          <Maximize2 className="size-3.5" />
          {t("查看全屏")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction(palette, "info")}>
          <Info className="size-3.5" />
          {t("色值详情")}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("复制为")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => copyAs(t("色号"), colors.join(", "))}>
              {t("色号")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyAs(t("CSS 变量"), formats.css)}>
              {t("CSS 变量")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyAs("Tailwind", formats.tailwind)}>
              Tailwind
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyAs("SCSS", formats.scss)}>SCSS</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyAs("JSON", JSON.stringify(colors))}>
              JSON
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("导出")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={exportPng}>PNG</DropdownMenuItem>
            <DropdownMenuItem onSelect={exportSvg}>SVG</DropdownMenuItem>
            <DropdownMenuItem onSelect={exportJson}>JSON</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("送进")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onAction(palette, "to-gradient")}>
              {t("渐变编辑")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction(palette, "to-palette")}>
              {t("配色方案")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
