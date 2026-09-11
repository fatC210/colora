import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** 单个快捷键行：左侧说明，右侧按键组合。 */
type ShortcutRow = { label: string; keys: string[] };
type ShortcutGroup = { title: string; rows: ShortcutRow[] };

/** 平台修饰键显示：mac 用 ⌘/⇧/⌥，其它用 Ctrl/Shift/Alt。 */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";
const SHIFT = IS_MAC ? "⇧" : "Shift";
const ALT = IS_MAC ? "⌥" : "Alt";

/** 已实现的画布快捷键汇总（与 CanvasTool 中的 keydown 监听保持同步）。 */
const GROUPS: ShortcutGroup[] = [
  {
    title: "工具",
    rows: [
      { label: "选择", keys: ["V"] },
      { label: "抓手", keys: ["H"] },
      { label: "矩形", keys: ["R"] },
      { label: "菱形", keys: ["D"] },
      { label: "椭圆", keys: ["O"] },
      { label: "箭头", keys: ["A"] },
      { label: "直线", keys: ["L"] },
      { label: "画笔", keys: ["P"] },
      { label: "文本", keys: ["T"] },
      { label: "橡皮", keys: ["E"] },
    ],
  },
  {
    title: "编辑",
    rows: [
      { label: "撤销", keys: [MOD, "Z"] },
      { label: "重做", keys: [MOD, SHIFT, "Z"] },
      { label: "重做（备选）", keys: [MOD, "Y"] },
      { label: "全选", keys: [MOD, "A"] },
      { label: "复制", keys: [MOD, "C"] },
      { label: "粘贴", keys: [MOD, "V"] },
      { label: "创建副本", keys: [MOD, "D"] },
      { label: "删除选中", keys: ["Del"] },
      { label: "取消 / 关闭 / 重置视口", keys: ["Esc"] },
      { label: "微移 1px", keys: ["↑↓←→"] },
      { label: "微移 10px", keys: [SHIFT, "↑↓←→"] },
    ],
  },
  {
    title: "组合与图层",
    rows: [
      { label: "组合", keys: [MOD, "G"] },
      { label: "取消组合", keys: [MOD, SHIFT, "G"] },
      { label: "上移一层", keys: [MOD, "]"] },
      { label: "下移一层", keys: [MOD, "["] },
      { label: "旋转吸附 15°", keys: [SHIFT, "拖动旋转柄"] },
    ],
  },
  {
    title: "视图",
    rows: [
      { label: "放大", keys: [MOD, "+"] },
      { label: "缩小", keys: [MOD, "-"] },
      { label: "缩放 100%", keys: [MOD, "0"] },
      { label: "重置视口", keys: ["0"] },
      { label: "适应内容", keys: ["1"] },
      { label: "按住临时平移", keys: ["空格"] },
      { label: "切换 Zen 模式", keys: [ALT, "Z"] },
    ],
  },
  {
    title: "鼠标与滚轮",
    rows: [
      { label: "平移画布", keys: ["滚轮"] },
      { label: "水平平移", keys: [SHIFT, "滚轮"] },
      { label: "以指针为锚点缩放", keys: [MOD, "滚轮"] },
      { label: "拖拽平移", keys: ["中键拖动"] },
      { label: "双击空白处", keys: ["新建文本"] },
      { label: "双击元素", keys: ["编辑文本/节点"] },
    ],
  },
  {
    title: "帮助",
    rows: [
      { label: "打开 / 收起本速查面板", keys: ["?"] },
      { label: "缩放 / 重置（右下角控件）", keys: ["−", "+", "100%"] },
    ],
  },
];

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="border-b border-border/50 px-5 py-4">
          <DialogTitle className="text-base">键盘快捷键</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">
            画布中已支持的全部快捷键与鼠标操作。
          </DialogDescription>
        </div>

        <div className="max-h-[calc(85dvh-6rem)] overflow-y-auto px-5 py-4">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {GROUPS.map((group) => (
              <section key={group.title} className="min-w-0 space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="space-y-1">
                  {group.rows.map((row) => (
                    <li
                      key={row.label}
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
          提示：在输入框、文本编辑态中，快捷键交给输入法本身，不会触发画布操作。
        </div>
      </DialogContent>
    </Dialog>
  );
}
