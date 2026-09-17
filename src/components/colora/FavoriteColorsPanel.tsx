import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { simulateCB } from "@/lib/color";
import { useT } from "@/lib/i18n/use-t";
import { InlineRename, Tip } from "./primitives";

/**
 * 「收藏颜色」的管理面板：应用 / 重命名 / 删除。
 *
 * 原先只存在于 InfoPanel，随 InfoPanel 下线迁到这里 —— PaletteTool 的色块只能**新增**
 * 收藏，重命名与删除此前只有这一个入口，所以不能跟着一起删掉。
 *
 * 只渲染内容本身：外层分区（标题 / 分隔线）由 PaletteTool 的 rail 声明提供。
 * 收藏是登录后才有的能力，「未登录就不出现」交给那边的 `visible` 决定 —— 组件自己
 * 返回 null 的话调用点看不见，收起态的图标栏会多出一个点了没反应的死图标。
 */
export function FavoriteColorsPanel() {
  const { favoriteColors, removeColor, renameColor, setColor, cbMode } = useColora();
  const [editingId, setEditingId] = useState<string | null>(null);
  const t = useT();

  if (favoriteColors.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("暂无收藏颜色。点击上方图标后可从这里一键应用继续调整。")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {favoriteColors.slice(0, 12).map((savedColor) => (
        <div
          key={savedColor.id}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 p-1.5"
        >
          <button
            type="button"
            onClick={() => setColor(savedColor.hex)}
            className="size-7 shrink-0 rounded-md border border-border/70"
            style={{ backgroundColor: simulateCB(savedColor.hex, cbMode) }}
            aria-label={t("应用颜色：{name}", { name: savedColor.name })}
          />
          <div className="min-w-0 flex-1">
            <InlineRename
              value={savedColor.name}
              editing={editingId === savedColor.id}
              onEditingChange={(editing) => setEditingId(editing ? savedColor.id : null)}
              onSave={(nextName) => renameColor(savedColor.id, nextName)}
              className="w-full"
              textClassName="text-xs font-medium"
              inputClassName="w-full"
              ariaLabel={t("重命名颜色")}
            />
            <button
              type="button"
              onClick={() => setColor(savedColor.hex)}
              className="block font-mono text-[11px] text-muted-foreground hover:text-foreground"
              aria-label={t("应用颜色：{name}", { name: savedColor.name })}
            >
              {savedColor.hex}
            </button>
          </div>
          <Tip label={t("重命名颜色")}>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("重命名颜色")}
              onClick={() => setEditingId(savedColor.id)}
            >
              <Pencil className="size-3.5" />
            </button>
          </Tip>
          <Tip label={t("删除颜色")}>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("删除颜色")}
              onClick={() => removeColor(savedColor.id)}
            >
              <Trash2 className="size-3.5" />
            </button>
          </Tip>
        </div>
      ))}
    </div>
  );
}