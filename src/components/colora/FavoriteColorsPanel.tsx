import { useState } from "react";
import { Heart, Pencil, Trash2 } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { simulateCB } from "@/lib/color";
import { useT } from "@/lib/i18n/use-t";
import { InlineRename, Tip } from "./primitives";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * 「收藏颜色」的管理面板：应用 / 重命名 / 删除。
 *
 * 原先只存在于 InfoPanel，随 InfoPanel 下线迁到这里 —— PaletteTool 的色块只能**新增**
 * 收藏，重命名与删除此前只有这一个入口，所以不能跟着一起删掉。
 */
export function FavoriteColorsPanel() {
  const { favoriteColors, removeColor, renameColor, setColor, cbMode, user } = useColora();
  const [editingId, setEditingId] = useState<string | null>(null);
  const t = useT();

  // 收藏是登录后才有的能力，未登录时整块不渲染（与 InfoPanel 当年的条件一致）。
  if (!user) return null;

  return (
    <CollapsibleSection icon={Heart} title={t("收藏颜色")} defaultOpen>
      {favoriteColors.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("暂无收藏颜色。点击上方图标后可从这里一键应用继续调整。")}
        </p>
      ) : (
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
      )}
    </CollapsibleSection>
  );
}
