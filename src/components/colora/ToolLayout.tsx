import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { PanelRight } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import { RailSection } from "./RailSection";

/**
 * 右栏的一个分区。同一份数组同时驱动展开态的面板与收起态的图标栏（单一数据源，
 * 图标与分区不可能错位）。
 */
export type RailSectionSpec = {
  id: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  content: ReactNode;
  /**
   * 由工具自己算（「未登录」「还没有点位」这类条件），false 时整项不出现。
   *
   * 必须显式给，不能靠「渲染出来是不是 null」判断：组件返回 null 的元素本身不是 null，
   * 只有渲染完才知道 —— 那样收起态的图标栏会多出点了没反应的死图标。
   */
  visible?: boolean;
};

/** 读右栏展开偏好。SSR 无 window 时返回 true（默认展开）。 */
function loadRailOpen() {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("colora.railOpen") !== "false";
  } catch {
    return true;
  }
}

/**
 * 工具工作区：主内容卡片 +（可选）右侧参数栏。
 *
 * 参数 state 留在各工具内部，由工具自己把「调整类控件」作为 `rail` 传进来 ——
 * 而不是把 state 提升到 store（store 的 value 是单个 useMemo，任何字段变化都会让
 * 整个应用重渲染，拖动类交互会直接卡死），也不是 context 插槽（要多一轮 render
 * 且有两个真值来源）。这样参数只有一份 DOM、一份 state，拖动零性能回归。
 *
 * `rail` 不传（或过滤后为空）时就是一张普通的内容卡片（首页、以及还没迁移的工具）。
 */
export function ToolLayout({
  title,
  rail,
  children,
}: {
  /** 当前工具名，显示在右栏顶部（≥1024px）。 */
  title: string;
  rail?: RailSectionSpec[];
  children: ReactNode;
}) {
  const t = useT();
  const [railOpen, setRailOpen] = useState(true);
  useEffect(() => {
    setRailOpen(loadRailOpen());
  }, []);

  // 持久化。用 ref 跳过挂载后的首跑，否则会用默认的 true 覆盖掉上面刚读出来的偏好。
  const skipPersistRef = useRef(true);
  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem("colora.railOpen", JSON.stringify(railOpen));
    } catch {
      // 隐私模式等场景下 localStorage 可能抛错；偏好丢失不影响功能。
    }
  }, [railOpen]);

  // `[]` 是 truthy，得按「过滤后还剩几个」判断有没有 rail —— 否则条件分区全不可见时
  // 会渲染出一条空栏。
  const sections = (rail ?? []).filter((section) => section.visible !== false);
  const hasRail = sections.length > 0;

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const bodyId = useId();

  /**
   * 焦点必须在这里（点击处理器）接管，不能放到监听 railOpen 的 effect 里：
   * 挂载时那个 setRailOpen(loadRailOpen()) 也会触发 effect，会在页面加载时抢走焦点。
   */
  const collapse = () => {
    // body 挂上 inert 后里面的焦点会凭空消失（Chrome 还会因此拒绝应用 aria-hidden），
    // 先把焦点交还给切换按钮。
    if (bodyRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    setRailOpen(false);
  };

  const openAt = (id?: string) => {
    setRailOpen(true);
    const body = bodyRef.current;
    if (!id || !body) return;
    const target = body.querySelector<HTMLElement>(`[data-rail-section="${id}"]`);
    if (!target) return;
    // 只滚目标容器：scrollIntoView 会连 overflow:hidden 的祖先一起滚，
    // 展开动画进行中会把祖先的 scrollLeft 也搅动。
    body.scrollTo({ top: target.offsetTop - body.offsetTop, behavior: "smooth" });
    // 刚点的图标会随 strip 一起隐藏，焦点得先落到目标分区，否则会丢。
    window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  };

  const label = railOpen ? t("收起参数面板") : t("展开参数面板");

  return (
    <div className="colora-tool-grid" data-rail={hasRail ? (railOpen ? "open" : "closed") : undefined}>
      <div className="colora-tool-main">
        <div className="colora-surface-card">{children}</div>
      </div>

      {hasRail && (
        <aside className="colora-tool-rail">
          <div className="colora-rail-card">
            <div className="colora-rail-header">
              <span className="colora-rail-title">{title}</span>
              <button
                ref={toggleRef}
                type="button"
                onClick={() => (railOpen ? collapse() : openAt())}
                aria-expanded={railOpen}
                aria-controls={bodyId}
                aria-label={label}
                className="colora-rail-toggle"
              >
                <PanelRight className="size-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="colora-rail-viewport">
              {/* inert 必须加：宽度收缩 + overflow:hidden 只是视觉隐藏，
                  不加的话 Tab 键仍会落进看不见的控件里。 */}
              <div
                ref={bodyRef}
                id={bodyId}
                className="colora-rail-body"
                inert={!railOpen ? true : undefined}
              >
                {sections.map((section) => (
                  <RailSection key={section.id} id={section.id} title={section.title}>
                    {section.content}
                  </RailSection>
                ))}
              </div>

              {/* 收起态的图标栏。必须与 body 同级 —— body 挂着 inert，
                  套在里面会连图标一起废掉，收起后就点不动了。 */}
              <div className="colora-rail-strip" inert={railOpen ? true : undefined}>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => openAt(section.id)}
                    aria-label={section.title}
                    className="colora-rail-strip-button"
                  >
                    <section.icon className="size-5 shrink-0" strokeWidth={1.6} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}