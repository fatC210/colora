import { useCallback, useEffect, useRef, useState } from "react";
import {
  Blend,
  Contrast,
  Droplets,
  Home,
  Image as ImageIcon,
  Menu,
  Palette,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  SwatchBook,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useColora } from "@/lib/colora-store";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark } from "./BrandMark";
import { Tip } from "./primitives";
import { AccountMenu } from "./account/AccountMenu";
import { SignInDialog } from "./account/SignInDialog";
import { getUserInitial } from "./account/utils";

export type ToolId =
  | "home"
  | "palette"
  | "colors"
  | "gradient"
  | "canvas"
  | "mixer"
  | "image"
  | "contrast"
  | "preview";

/** 移动端（窄屏 < 768px）暂不支持的工具：画布依赖精细指针与手势，触控体验未完善。 */
const MOBILE_UNSUPPORTED: ReadonlySet<ToolId> = new Set<ToolId>(["canvas"]);

/**
 * 按设备过滤工具列表：移动端隐藏暂不支持的工具入口（侧栏与首页共用同一来源）。
 * @param isMobile 窄屏判定（来自 useIsMobile，与 CSS 断点 768px 一致）。
 */
export function visibleTools(isMobile: boolean) {
  return isMobile ? TOOLS.filter((t) => !MOBILE_UNSUPPORTED.has(t.id)) : TOOLS;
}

/** 该工具在移动端是否可用（用于纠正已选中的工具，如持久化的 Zen 模式）。 */
export function isToolSupportedOnMobile(id: ToolId) {
  return !MOBILE_UNSUPPORTED.has(id);
}

/** 读侧栏收起偏好。SSR 无 window 时返回 false（默认展开）。 */
function loadNavCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("colora.navCollapsed") === "true";
  } catch {
    return false;
  }
}

export const TOOLS: { id: ToolId; label: TKey; icon: typeof Home; badge?: string }[] = [
  { id: "home", label: "首页", icon: Home },
  { id: "palette", label: "配色方案", icon: Palette },
  { id: "colors", label: "颜色库", icon: SwatchBook },
  { id: "gradient", label: "渐变编辑", icon: Droplets },
  { id: "canvas", label: "画布", icon: Paintbrush },
  { id: "mixer", label: "色彩混合", icon: Blend },
  { id: "image", label: "图片取色", icon: ImageIcon },
  { id: "contrast", label: "对比度检查", icon: Contrast },
  { id: "preview", label: "实时预览", icon: Smartphone },
];

type ActionVariant = "sidebar" | "topbar";

function NavItem({
  toolId,
  label,
  icon: Icon,
  badge,
  active,
  tip,
  onClick,
}: {
  toolId: ToolId;
  label: string;
  icon: typeof Home;
  badge?: string;
  active?: boolean;
  /** 仅桌面收起态传入：此时按钮只剩图标，tooltip 是唯一的文字提示。 */
  tip?: string;
  onClick?: () => void;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      // 用工具 id 而非 label：label 会随语言变，而 styles.css 按 `[data-label]` 做 per-tool 微调。
      data-label={toolId}
      data-active={active ? "true" : undefined}
      className={cn(
        "colora-sidebar-button relative flex w-full items-center rounded-lg",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.6} />
      <span className="colora-sidebar-label truncate">{label}</span>
      {badge && (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] leading-none text-primary">
          {badge}
        </span>
      )}
    </button>
  );

  // Tip 走 cloneElement 把事件注入到直接子元素上（见 primitives.tsx），所以必须在这里
  // 包住真正的 <button>。调用点用 <Tip> 包 <NavItem/> 是不行的 —— 注入不到 DOM 上。
  //
  // 始终包 <Tip>、由 label 决定要不要显示（空 label 即不显示）。别写成
  // `tip ? <Tip>…</Tip> : button` —— 那会在侧栏收起/展开的瞬间换掉返回结构，
  // React 随之重建整棵子树，新 DOM 节点不跑 CSS 过渡，标签就变成瞬变而非收没。
  return (
    <Tip label={tip} side="right">
      {button}
    </Tip>
  );
}

/**
 * 动作按钮的 tooltip 包装：侧栏（variant="sidebar"）按钮自带文字标签，tooltip 冗余，故不包；
 * 移动端顶栏（variant="topbar"）为纯图标，tooltip 是唯一文字提示，保留。
 */
function ActionTip({
  variant,
  label,
  children,
}: {
  variant: ActionVariant;
  label: string;
  children: React.ReactNode;
}) {
  if (variant === "sidebar") return <>{children}</>;
  return <Tip label={label}>{children}</Tip>;
}

/*
 * 这里原先还有一个「导出中心」入口（ExportDialog 不传 module 即 "all"，含全部 tab）。
 * 已去掉：导出改为各工具自己提供（各自传自己的 module），侧栏底部只留账户。
 * 注意去掉后 ExportDialog 的 "color"（当前颜色）与 "saved"（收藏色板）两个 tab
 * 暂时没有入口 —— 它们不在任何工具的 module 里。
 */

/** 账户与设置入口：点击展开面板（语言 / 主题 / 登录），面板里再点「登录」才弹居中弹窗。 */
function AccountAction({ variant }: { variant: ActionVariant }) {
  const { user } = useColora();
  const t = useT();
  const [panelOpen, setPanelOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // 标记「这次关面板是为了转场到登录弹窗」，供 onCloseAutoFocus 判断。
  const toAuthRef = useRef(false);
  const avatarInitial = user ? getUserInitial(user) : null;
  const label = user ? t("账户与设置（已登录：{email}）", { email: user }) : t("账户与设置");

  const requestSignIn = () => {
    // Popover 关闭时默认把焦点还给触发按钮，会和 Dialog 的自动聚焦相争，
    // 导致弹窗内的键盘操作失效。置位标记让 onCloseAutoFocus 放弃归还焦点。
    toAuthRef.current = true;
    setPanelOpen(false);
    setAuthOpen(true);
  };

  return (
    <>
      <Popover open={panelOpen} onOpenChange={setPanelOpen}>
        <ActionTip variant={variant} label={label}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label}
              data-signed-in={user ? "true" : undefined}
              className={cn(
                "colora-sidebar-button flex w-full items-center rounded-lg",
                variant === "topbar" && "colora-action-button-topbar",
                user ? "text-sidebar-foreground" : "text-muted-foreground",
                "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {avatarInitial ? (
                <Avatar className="colora-sidebar-avatar size-6 border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
                  <AvatarFallback className="bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="size-5 shrink-0" strokeWidth={1.6} />
              )}
              {variant === "sidebar" && (
                <span className="colora-sidebar-label leading-none">{t("账户")}</span>
              )}
            </button>
          </PopoverTrigger>
        </ActionTip>
        <PopoverContent
          side={variant === "topbar" ? "bottom" : "right"}
          align="end"
          className="colora-account-menu w-72"
          onCloseAutoFocus={(e) => {
            if (!toAuthRef.current) return;
            toAuthRef.current = false;
            e.preventDefault();
          }}
        >
          <AccountMenu onRequestSignIn={requestSignIn} onClose={() => setPanelOpen(false)} />
        </PopoverContent>
      </Popover>

      <SignInDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}

export function Sidebar({
  tool,
  onTool,
  open = false,
  onOpenChange,
}: {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { logoGradient, randomizeLogoGradient } = useColora();
  const t = useT();
  const isMobile = useIsMobile();
  // 移动端隐藏暂不支持的工具入口（画布）；index 的标题与这里共用同一列表。
  const navTools = visibleTools(isMobile);
  // 桌面侧栏的展开/收起偏好。放在组件内而非 store：store 的 value 是单个 useMemo，
  // 加字段会让全应用（含常驻挂载的 CanvasTool）跟着重渲染。
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(loadNavCollapsed());
  }, []);

  /**
   * 撤掉 `__root.tsx` 那段内联脚本留下的首帧覆盖。
   *
   * **只能在用户手动切换时撤，不能在挂载 effect 里撤** —— 挂载 effect 跑的那一刻
   * React 的 state 还是首帧的 `false`，覆盖一撤就会跳回展开，接着 effect 再把
   * 它收回去，反而制造出闪烁（实测左栏会 72px → 204px → 72px 地抖一轮）。
   */
  const clearNavPref = () => document.documentElement.removeAttribute("data-nav-pref");

  // 持久化。用 ref 跳过挂载后的首跑，否则会用默认的 false 覆盖掉上面刚读出来的偏好。
  const skipPersistRef = useRef(true);
  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem("colora.navCollapsed", JSON.stringify(collapsed));
    } catch {
      // 隐私模式等场景下 localStorage 可能抛错；偏好丢失不影响功能。
    }
  }, [collapsed]);

  const asideRef = useRef<HTMLElement | null>(null);
  const dragState = useRef({ startX: 0, dx: 0, width: 0, dragging: false });

  const onDragPointerMove = useCallback((e: PointerEvent) => {
    if (!dragState.current.dragging) return;
    const { startX, width } = dragState.current;
    const dx = Math.max(-width, Math.min(0, e.clientX - startX));
    dragState.current.dx = dx;
    const aside = asideRef.current;
    if (aside) aside.style.transform = `translateX(${dx}px)`;
  }, []);

  const onDragPointerUp = useCallback(() => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    window.removeEventListener("pointermove", onDragPointerMove);
    window.removeEventListener("pointerup", onDragPointerUp);
    window.removeEventListener("pointercancel", onDragPointerUp);

    const aside = asideRef.current;
    const dx = dragState.current.dx;
    const width = dragState.current.width;
    if (!aside) return;
    aside.dataset.dragging = "false";
    // 拖拽期 transition 被禁用（data-dragging=true → transition:none），
    // 这里先强制一次 reflow 让 transition 恢复，否则紧接着改 transform
    // 会被合并进无过渡帧，导致回弹/滑出动画不生效。
    void aside.offsetWidth;

    const shouldClose = dx < -(width * 0.25 || 80);
    if (shouldClose) {
      // 侧边栏交给 CSS 过渡滑出（dx → -100%）；
      // 同时立即通知父组件关闭，让遮罩层同步开始淡出，而不是等侧边栏动画结束。
      aside.style.transform = "translateX(-100%)";
      onOpenChange?.(false);

      // 过渡结束后清掉内联 transform，下次打开从干净状态开始。
      // 过滤 propertyName：子元素的 transitionend 会冒泡上来，
      // 提前触发会让内联被清时 React 状态尚未更新而闪回。
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        aside.removeEventListener("transitionend", onEnd);
        aside.style.transform = "";
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target === aside && e.propertyName === "transform") done();
      };
      aside.addEventListener("transitionend", onEnd);
      window.setTimeout(done, 320);
    } else {
      aside.style.transform = "";
    }
  }, [onDragPointerMove, onOpenChange]);

  // 卸载时清理可能残留的 window 监听
  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onDragPointerMove);
      window.removeEventListener("pointerup", onDragPointerUp);
      window.removeEventListener("pointercancel", onDragPointerUp);
    },
    [onDragPointerMove, onDragPointerUp],
  );

  // 抽屉关闭后清掉内联 transform，确保下次打开从干净状态开始
  useEffect(() => {
    if (open) return;
    const aside = asideRef.current;
    if (aside) {
      aside.style.transform = "";
      aside.dataset.dragging = "false";
    }
  }, [open]);

  const onDragPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !open) return;
    const aside = asideRef.current;
    const width = aside?.offsetWidth ?? 248;
    dragState.current = { startX: e.clientX, dx: 0, width, dragging: true };
    if (aside) aside.dataset.dragging = "true";
    window.addEventListener("pointermove", onDragPointerMove);
    window.addEventListener("pointerup", onDragPointerUp);
    window.addEventListener("pointercancel", onDragPointerUp);
  };

  const close = () => onOpenChange?.(false);

  return (
    <>
      {/* 移动端：左上角展开按钮 */}
      <button
        type="button"
        onClick={() => onOpenChange?.(true)}
        aria-label={t("打开侧边栏")}
        className="colora-mobile-nav-toggle"
      >
        <Menu className="size-5" strokeWidth={1.8} />
      </button>

      {/* 移动端：右上角动作栏（账户与设置） */}
      <div className="colora-mobile-actions" role="toolbar" aria-label={t("操作")}>
        <AccountAction variant="topbar" />
      </div>

      {/* 移动端：遮罩层（点击或向左滑动均可关闭抽屉） */}
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={close}
        onPointerDown={onDragPointerDown}
        className="colora-sidebar-overlay"
        data-open={open ? "true" : undefined}
      />

      <aside
        ref={asideRef}
        className="colora-sidebar"
        data-open={open ? "true" : undefined}
        data-collapsed={collapsed ? "true" : undefined}
        onPointerDown={onDragPointerDown}
      >
        <div className="colora-sidebar-header">
          {/*
            桌面端展开/收起。收起态这个按钮本身就是品牌 logo —— hover 时 logo 淡出、
            展开箭头淡入，所以两种形态下按钮都在 header 左侧的同一位置，用户来回切换
            时鼠标不用移动（旧版把展开按钮单独排一行，收起态是竖排的 header）。
            移动端整块隐藏，抽屉里用右上角的关闭按钮。
          */}
          <button
            type="button"
            onClick={() => {
              clearNavPref();
              setCollapsed((c) => !c);
            }}
            aria-label={collapsed ? t("展开侧边栏") : t("收起侧边栏")}
            aria-expanded={!collapsed}
            className="colora-sidebar-toggle"
          >
            {/*
              三层始终都在，靠 CSS 的 opacity 交叉淡入淡出（见 styles.css）。
              不要按 collapsed 条件渲染图标：换图标 = 换 DOM 节点 = 新节点不跑过渡，
              收起瞬间箭头会硬切成品牌图形。
            */}
            <BrandMark gradient={logoGradient} className="colora-sidebar-toggle-logo" />
            <PanelLeftOpen
              className="colora-sidebar-toggle-icon colora-sidebar-toggle-icon-open size-4"
              strokeWidth={1.8}
            />
            <PanelLeftClose
              className="colora-sidebar-toggle-icon colora-sidebar-toggle-icon-close size-4"
              strokeWidth={1.8}
            />
          </button>
          <Tip label={t("试试点击！")} side="right">
            <button
              type="button"
              onClick={randomizeLogoGradient}
              aria-label={t("点击随机切换品牌渐变")}
              className="colora-sidebar-logo hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              {/*
                渐变色挂在紧贴文字的这层 span 上，而不是按钮上：background-clip:text
                的渐变按元素自身盒子铺开，挂在按钮上时渐变会被按钮的内边距摊薄。
                收起态整个按钮由 CSS 隐藏，位置让给上面的 logo 按钮。
              */}
              <span
                className="colora-sidebar-logo-text font-brand bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${logoGradient.join(", ")})` }}
              >
                COLORA
              </span>
            </button>
          </Tip>
          <button
            type="button"
            onClick={close}
            aria-label={t("收起侧边栏")}
            className="colora-sidebar-close"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <nav className="colora-sidebar-nav">
          {navTools.map((toolConfig) => (
            <NavItem
              key={toolConfig.id}
              toolId={toolConfig.id}
              label={t(toolConfig.label)}
              icon={toolConfig.icon}
              badge={toolConfig.badge}
              active={tool === toolConfig.id}
              // 只在桌面收起态给 tooltip：移动端抽屉里按钮本就带文字，且 Tip 带长按逻辑。
              tip={!isMobile && collapsed ? t(toolConfig.label) : undefined}
              onClick={() => onTool(toolConfig.id)}
            />
          ))}
        </nav>

        <div className="colora-sidebar-actions">
          <AccountAction variant="sidebar" />
        </div>
      </aside>
    </>
  );
}
