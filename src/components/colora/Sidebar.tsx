import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Blend,
  Contrast,
  Droplets,
  Eye,
  Home,
  Image as ImageIcon,
  Menu,
  Moon,
  Palette,
  Smartphone,
  Sun,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/colora/Logo";
import { useColora } from "@/lib/colora-store";
import { CB_LABELS, type CBMode } from "@/lib/color";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tip } from "./primitives";

export type ToolId = "home" | "palette" | "gradient" | "mixer" | "image" | "contrast" | "preview";

export const TOOLS: { id: ToolId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "首页", icon: Home },
  { id: "palette", label: "配色方案", icon: Palette },
  { id: "gradient", label: "渐变编辑", icon: Droplets },
  { id: "mixer", label: "色彩混合", icon: Blend },
  { id: "image", label: "图片取色", icon: ImageIcon },
  { id: "contrast", label: "对比度检查", icon: Contrast },
  { id: "preview", label: "实时预览", icon: Smartphone },
];

const CB_ICON_COLORS: Record<Exclude<CBMode, "none">, string> = {
  protanopia: "#ef4444",
  deuteranopia: "#22c55e",
  tritanopia: "#3b82f6",
  achromatopsia: "#737373",
};

type ActionVariant = "sidebar" | "topbar";

function getUserInitial(user: string) {
  return user.trim().charAt(0).toUpperCase() || "U";
}

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
  buttonRef,
}: {
  label: string;
  icon: typeof Home;
  active?: boolean;
  onClick?: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={label}
      data-label={label}
      data-active={active ? "true" : undefined}
      className={cn(
        "colora-sidebar-button relative flex w-full flex-col items-center rounded-lg text-[11px]",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-5" strokeWidth={1.6} />
      <span className="colora-sidebar-label leading-none">
        {label === "对比度检查" ? (
          <>
            <span className="colora-sidebar-label-line">对比度</span>
            <span className="colora-sidebar-label-line">检查</span>
          </>
        ) : (
          label
        )}
      </span>
    </button>
  );
}

/** 色盲模拟按钮：sidebar 为纵向（桌面侧边栏），topbar 为横向小图标（移动端右上角）。 */
function ColorBlindAction({ variant }: { variant: ActionVariant }) {
  const { cbMode, setCbMode } = useColora();
  const active = cbMode !== "none";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="色盲模拟"
          aria-label="色盲模拟"
          data-active={active ? "true" : undefined}
          className={cn(
            "colora-sidebar-button flex w-full flex-col items-center rounded-lg text-[11px]",
            variant === "topbar" && "colora-action-button-topbar",
            active
              ? "bg-sidebar-accent font-medium text-sidebar-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Eye
            className="size-5"
            strokeWidth={1.6}
            style={{
              color: active ? CB_ICON_COLORS[cbMode as Exclude<CBMode, "none">] : undefined,
            }}
          />
          {variant === "sidebar" && (
            <span className="colora-sidebar-label leading-none">色盲模拟</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={variant === "topbar" ? "bottom" : "right"}
        align="end"
        className="w-44 p-1"
      >
        {(Object.keys(CB_LABELS) as Exclude<CBMode, "none">[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setCbMode(cbMode === m ? "none" : m)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm hover:bg-accent",
              cbMode === m && "bg-accent font-medium",
            )}
          >
            <span className="flex items-center gap-2">
              <Eye className="size-4" strokeWidth={1.6} style={{ color: CB_ICON_COLORS[m] }} />
              {CB_LABELS[m]}
            </span>
            {cbMode === m && <span>✓</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** 主题切换按钮。 */
function ThemeAction({ variant }: { variant: ActionVariant }) {
  const { theme, toggleTheme } = useColora();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title="深浅色切换"
      aria-label="深浅色切换"
      className={cn(
        "colora-sidebar-button flex w-full flex-col items-center rounded-lg text-[11px]",
        variant === "topbar" && "colora-action-button-topbar",
        "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {theme === "dark" ? (
        <Sun className="size-5" strokeWidth={1.6} />
      ) : (
        <Moon className="size-5" strokeWidth={1.6} />
      )}
      {variant === "sidebar" && (
        <span className="colora-sidebar-label leading-none">
          {theme === "dark" ? "浅色" : "深色"}
        </span>
      )}
    </button>
  );
}

/** 登录/账户按钮 + 弹出表单。 */
function AccountAction({ variant }: { variant: ActionVariant }) {
  const { user, signIn, signUp, signOut } = useColora();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailOk && pw.length >= 6 && (mode === "login" || pw2.length >= 6);
  const avatarInitial = user ? getUserInitial(user) : null;

  const reset = () => {
    setPw("");
    setPw2("");
    setError(null);
  };

  const submit = () => {
    const res = mode === "login" ? signIn(email, pw) : signUp(email, pw, pw2);
    if (!res.ok) setError(res.error ?? "操作失败");
    else reset();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={user ? `已登录：${user}` : "登录"}
          aria-label={user ? `已登录：${user}` : "登录"}
          data-signed-in={user ? "true" : undefined}
          className={cn(
            "colora-sidebar-button flex w-full flex-col items-center rounded-lg text-[11px]",
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
            <User className="size-5" strokeWidth={1.6} />
          )}
          {variant === "sidebar" && (
            <span className="colora-sidebar-label leading-none">{user ? "已登录" : "登录"}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side={variant === "topbar" ? "bottom" : "right"} align="end" className="w-72">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 border border-border bg-primary text-primary-foreground">
                <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">已登录</p>
                <p className="truncate text-sm font-medium">{user}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">配色方案将保存到此账户。</p>
            <Button variant="outline" className="w-full" onClick={signOut}>
              退出登录
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v);
                reset();
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="register">注册</TabsTrigger>
              </TabsList>
            </Tabs>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="text-xs text-muted-foreground">邮箱地址</label>
              <Input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="请输入邮箱地址"
                type="email"
                autoComplete="email"
              />
              <label className="text-xs text-muted-foreground">密码</label>
              <Input
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setError(null);
                }}
                placeholder="至少 6 位密码"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "register" && (
                <>
                  <label className="text-xs text-muted-foreground">确认密码</label>
                  <Input
                    value={pw2}
                    onChange={(e) => {
                      setPw2(e.target.value);
                      setError(null);
                    }}
                    placeholder="请再次输入密码"
                    type="password"
                    autoComplete="new-password"
                  />
                  {pw2.length > 0 && pw !== pw2 && (
                    <p className="text-[11px] text-muted-foreground">两次输入的密码不一致</p>
                  )}
                </>
              )}
              {error && <p className="text-[11px] font-medium">{error}</p>}
              <Button className="w-full" type="submit" disabled={!canSubmit}>
                {mode === "login" ? "登录" : "注册并登录"}
              </Button>
            </form>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              无需登录即可使用大部分工具，但登录后才能保存和管理配色方案。
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  const navRef = useRef<HTMLElement | null>(null);
  const navItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndicatorRef = useRef<HTMLSpanElement | null>(null);
  const activeToolIndex = Math.max(
    TOOLS.findIndex((toolConfig) => toolConfig.id === tool),
    0,
  );

  useLayoutEffect(() => {
    let frameId = 0;
    let settleTimeoutId = 0;

    const updateActiveIndicator = () => {
      const navNode = navRef.current;
      const activeButton = navItemRefs.current[activeToolIndex];
      const indicator = activeIndicatorRef.current;

      if (!navNode || !activeButton || !indicator) return;

      const navRect = navNode.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      const top = buttonRect.top - navRect.top + buttonRect.height / 2;

      indicator.style.opacity = "1";
      indicator.style.transform = `translate3d(0, ${top}px, 0) translateY(-50%)`;
    };

    const scheduleActiveIndicatorUpdate = () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimeoutId);

      frameId = window.requestAnimationFrame(updateActiveIndicator);
      settleTimeoutId = window.setTimeout(updateActiveIndicator, 180);
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleActiveIndicatorUpdate);

    const navNode = navRef.current;

    scheduleActiveIndicatorUpdate();

    if (resizeObserver) {
      if (navNode) resizeObserver.observe(navNode);
    }

    window.addEventListener("resize", scheduleActiveIndicatorUpdate);
    navNode?.addEventListener("pointerover", scheduleActiveIndicatorUpdate);
    navNode?.addEventListener("pointerout", scheduleActiveIndicatorUpdate);
    navNode?.addEventListener("transitionend", scheduleActiveIndicatorUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimeoutId);
      window.removeEventListener("resize", scheduleActiveIndicatorUpdate);
      navNode?.removeEventListener("pointerover", scheduleActiveIndicatorUpdate);
      navNode?.removeEventListener("pointerout", scheduleActiveIndicatorUpdate);
      navNode?.removeEventListener("transitionend", scheduleActiveIndicatorUpdate);
      resizeObserver?.disconnect();
    };
  }, [activeToolIndex]);

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
      // 过滤 propertyName：子元素（active-indicator 等）的 transitionend 会冒泡，
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
        aria-label="打开侧边栏"
        className="colora-mobile-nav-toggle"
      >
        <Menu className="size-5" strokeWidth={1.8} />
      </button>

      {/* 移动端：右上角动作栏（色盲 / 主题 / 登录） */}
      <div className="colora-mobile-actions" role="toolbar" aria-label="操作">
        <ColorBlindAction variant="topbar" />
        <ThemeAction variant="topbar" />
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
        onPointerDown={onDragPointerDown}
      >
        <div className="colora-sidebar-header">
          <Tip label="试试点击！" side="right">
            <button
              type="button"
              onClick={randomizeLogoGradient}
              aria-label="点击随机切换笑脸颜色"
              className="colora-sidebar-logo transition-opacity hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              <Logo className="size-8 text-foreground" gradient={logoGradient} />
              <span className="sr-only">Colora</span>
            </button>
          </Tip>
          <button
            type="button"
            onClick={close}
            aria-label="收起侧边栏"
            className="colora-sidebar-close"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        <nav ref={navRef} className="colora-sidebar-nav">
          <span ref={activeIndicatorRef} aria-hidden className="colora-sidebar-active-indicator" />
          {TOOLS.map((toolConfig, index) => (
            <NavItem
              key={toolConfig.id}
              label={toolConfig.label}
              icon={toolConfig.icon}
              active={tool === toolConfig.id}
              buttonRef={(node) => {
                navItemRefs.current[index] = node;
              }}
              onClick={() => onTool(toolConfig.id)}
            />
          ))}
        </nav>

        <div className="colora-sidebar-actions">
          <ColorBlindAction variant="sidebar" />
          <ThemeAction variant="sidebar" />
          <AccountAction variant="sidebar" />
        </div>
      </aside>
    </>
  );
}
