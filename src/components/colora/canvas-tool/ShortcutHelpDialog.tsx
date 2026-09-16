import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";

/** 单个快捷键行：左侧说明，右侧按键组合。 */
type ShortcutRow = { label: string; keys: string[] };
type ShortcutGroup = { title: string; rows: ShortcutRow[] };

/** 平台修饰键显示：mac 用 ⌘/⇧/⌥，其它用 Ctrl/Shift/Alt。 */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";
const SHIFT = IS_MAC ? "⇧" : "Shift";
const ALT = IS_MAC ? "⌥" : "Alt";

/** 已实现的画布快捷键汇总（与 CanvasTool 中的 keydown 监听保持同步）。 */
function buildGroups(t: (key: TKey) => string): ShortcutGroup[] {
  return [
    {
      title: t("工具"),
      rows: [
        { label: t("选择"), keys: ["V"] },
        { label: t("抓手"), keys: ["H"] },
        { label: t("矩形"), keys: ["R"] },
        { label: t("菱形"), keys: ["D"] },
        { label: t("椭圆"), keys: ["O"] },
        { label: t("箭头"), keys: ["A"] },
        { label: t("直线"), keys: ["L"] },
        { label: t("画笔"), keys: ["P"] },
        { label: t("文本"), keys: ["T"] },
        { label: t("橡皮"), keys: ["E"] },
      ],
    },
    {
      title: t("编辑"),
      rows: [
        { label: t("撤销"), keys: [MOD, "Z"] },
        { label: t("重做"), keys: [MOD, SHIFT, "Z"] },
        { label: t("重做（备选）"), keys: [MOD, "Y"] },
        { label: t("全选"), keys: [MOD, "A"] },
        { label: t("复制"), keys: [MOD, "C"] },
        { label: t("粘贴"), keys: [MOD, "V"] },
        { label: t("创建副本"), keys: [MOD, "D"] },
        { label: t("删除选中"), keys: ["Del"] },
        { label: t("取消 / 关闭 / 重置视口"), keys: ["Esc"] },
        { label: t("微移 1px"), keys: ["↑↓←→"] },
        { label: t("微移 10px"), keys: [SHIFT, "↑↓←→"] },
      ],
    },
    {
      title: t("组合与图层"),
      rows: [
        { label: t("组合"), keys: [MOD, "G"] },
        { label: t("取消组合"), keys: [MOD, SHIFT, "G"] },
        { label: t("上移一层"), keys: [MOD, "]"] },
        { label: t("下移一层"), keys: [MOD, "["] },
        { label: t("旋转吸附 15°"), keys: [SHIFT, t("拖动旋转柄")] },
      ],
    },
    {
      title: t("视图"),
      rows: [
        { label: t("放大"), keys: [MOD, "+"] },
        { label: t("缩小"), keys: [MOD, "-"] },
        { label: t("缩放 100%"), keys: [MOD, "0"] },
        { label: t("重置视口"), keys: ["0"] },
        { label: t("适应内容"), keys: ["1"] },
        { label: t("按住临时平移"), keys: [t("空格")] },
        { label: t("切换 Zen 模式"), keys: [ALT, "Z"] },
      ],
    },
    {
      title: t("鼠标与滚轮"),
      rows: [
        { label: t("平移画布"), keys: [t("滚轮")] },
        { label: t("水平平移"), keys: [SHIFT, t("滚轮")] },
        { label: t("以指针为锚点缩放"), keys: [MOD, t("滚轮")] },
        { label: t("拖拽平移"), keys: [t("中键拖动")] },
        { label: t("双击空白处"), keys: [t("新建文本")] },
        { label: t("双击元素"), keys: [t("编辑文本/节点")] },
      ],
    },
    {
      title: t("帮助"),
      rows: [
        { label: t("打开 / 收起本速查面板"), keys: ["?"] },
        { label: t("缩放 / 重置（右下角控件）"), keys: ["−", "+", "100%"] },
      ],
    },
  ];
}

/** 键盘按键帽。 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/70 bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground shadow-[0_1px_0_rgb(0_0_0/0.06)]">
      {children}
    </kbd>
  );
}

/**
 * 快捷键速查弹窗。汇总画布当前已实现的全部键盘与鼠标操作，
 * 按工具/编辑/组合图层/视图/鼠标分组，修饰键随平台显示 ⌘ 或 Ctrl。
 */
export function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const groups = buildGroups(t);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="border-b border-border/50 px-5 py-4">
          <DialogTitle className="text-base">{t("键盘快捷键")}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">
            {t("画布中已支持的全部快捷键与鼠标操作。")}
          </DialogDescription>
        </div>

        <div className="max-h-[calc(85dvh-6rem)] overflow-y-auto px-5 py-4">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {groups.map((group, groupIndex) => (
              <section key={groupIndex} className="min-w-0 space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="space-y-1">
                  {group.rows.map((row, rowIndex) => (
                    <li
                      key={rowIndex}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md px-1.5 py-1",
                        "hover:bg-accent/60",
                      )}
                    >
                      <span className="min-w-0 truncate text-xs text-foreground">{row.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {row.keys.map((key, i) => (
                          <span key={`${key}-${i}`} className="flex items-center gap-1">
                            {i > 0 && (
                              <span className="text-[10px] text-muted-foreground/60">+</span>
                            )}
                            <Kbd>{key}</Kbd>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="border-t border-border/50 px-5 py-2.5 text-[11px] text-muted-foreground">
          {t("提示：在输入框、文本编辑态中，快捷键交给输入法本身，不会触发画布操作。")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
