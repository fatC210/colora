import { PaletteWall } from "./home/PaletteWall";
import type { ToolId } from "./Sidebar";

/**
 * 首页：整页的配色方案墙。
 *
 * 这里刻意只剩一层壳 —— 品牌 hero、工具卡片网格、最近收藏区都已经移除，
 * 工具入口只靠左侧栏。根元素仍然是 `colora-surface-card`：桌面端（≥1024px）
 * 它就是滚动容器，配色墙的虚拟滚动依赖这一点（见 `use-windowed-grid`）。
 *
 * `onNavigate` 是从 `routes/index.tsx` 传下来的 `setTool` —— 卡片菜单里的
 * 「送进工具」要用它跳到别的工具。项目没有 per-tool 路由（工具切换是那个组件的
 * 本地 state），所以只能这样一层层传下来，而不是在深层组件里查路由。
 */
export function HomeTool({ onNavigate }: { onNavigate: (tool: ToolId) => void }) {
  return (
    <div className="colora-surface-card">
      <PaletteWall onNavigate={onNavigate} />
    </div>
  );
}
