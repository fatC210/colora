import type { ReactNode } from "react";

/**
 * 右栏里的一个分区：标题 + 内容（+ 与上一节之间的分隔线）。
 *
 * 外观按断点分两套（见 styles.css）：
 * - <1024px：分区是独立卡片 —— 那时 rail 排在主内容上方，卡片是最自然的容器；
 * - ≥1024px：去掉卡片外观，改用两端留白的分隔线 —— 整栏已并入页面背景。
 *
 * 分区内边距统一由这里给（各工具内容不要再带 p-4/p-5），否则标题与内容左缘会错位。
 */
export function RailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    // tabIndex=-1：收起态的图标栏点击后会展开面板并把焦点送到这里
    // （刚点的图标随 strip 一起隐藏，焦点不接管就会丢）。
    <section data-rail-section={id} tabIndex={-1} className="colora-rail-section">
      <h3 className="colora-rail-section-title">{title}</h3>
      {children}
    </section>
  );
}