import { PaletteWall } from "./home/PaletteWall";

/**
 * 首页：整页的配色方案墙。
 *
 * 这里刻意只剩一层壳 —— 品牌 hero、工具卡片网格、最近收藏区都已经移除，
 * 工具入口只靠左侧栏。根元素仍然是 `colora-surface-card`：桌面端（≥1024px）
 * 它就是滚动容器，配色墙的虚拟滚动依赖这一点（见 `use-windowed-grid`）。
 */
export function HomeTool() {
  return (
    <div className="colora-surface-card">
      <PaletteWall />
    </div>
  );
}
