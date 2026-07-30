import { useLayoutEffect, useRef, useState } from "react";
import {
  Blend,
  Contrast,
  Droplets,
  Eye,
  Home,
  Image as ImageIcon,
  Moon,
  Palette,
  Smartphone,
  Sun,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/colora/Logo";
import { useColora } from "@/lib/colora-store";
import { CB_LABELS, type CBMode } from "@/lib/color";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tip } from "./primitives";

export type ToolId =
  | "home"
  | "palette"
  | "gradient"
  | "mixer"
  | "image"
  | "contrast"
  | "preview";

export const TOOLS: { id: ToolId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "首页", icon: Home },
  { id: "palette", label: "配色方案", icon: Palette },
  { id: "gradient", label: "渐变编辑", icon: Droplets },
  { id: "mixer", label: "色彩混合", icon: Blend },
  { id: "image", label: "图片取色", icon: ImageIcon },
  { id: "contrast", label: "对比度检查", icon: Contrast },
  { id: "preview", label: "实时预览", icon: Smartphone },
];

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

function AccountPopover() {
  const { user, signIn, signUp, signOut } = useColora();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    emailOk && pw.length >= 6 && (mode === "login" || pw2.length >= 6);

  const reset = () => {
    setPw("");
    setPw2("");
    setError(null);
  };

  const submit = () => {
    const res =
      mode === "login" ? signIn(email, pw) : signUp(email, pw, pw2);
    if (!res.ok) setError(res.error ?? "操作失败");
    else reset();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="我的账户"
          className="colora-sidebar-button flex w-full flex-col items-center rounded-lg text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <User className="size-5" strokeWidth={1.6} />
          <span className="colora-sidebar-label leading-none">
            {user ? "我的账户" : "登录"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-72">
        {user ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{user}</p>
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
                    <p className="text-[11px] text-muted-foreground">
                      两次输入的密码不一致
                    </p>
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
}: {
  tool: ToolId;
  onTool: (t: ToolId) => void;
}) {
  const { cbMode, setCbMode, theme, toggleTheme, logoGradient, randomizeLogoGradient } = useColora();
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

  return (
    <aside className="colora-sidebar">
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

      <nav ref={navRef} className="colora-sidebar-nav">
        <span
          ref={activeIndicatorRef}
          aria-hidden
          className="colora-sidebar-active-indicator"
        />
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
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="色盲模拟"
              data-active={cbMode !== "none" ? "true" : undefined}
              className={cn(
                "colora-sidebar-button flex w-full flex-col items-center rounded-lg text-[11px]",
                cbMode !== "none"
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Eye className="size-5" strokeWidth={1.6} />
              <span className="colora-sidebar-label leading-none">色盲模拟</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-44 p-1">
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
                  <Eye className="size-4" strokeWidth={1.6} />
                  {CB_LABELS[m]}
                </span>
                {cbMode === m && <span>✓</span>}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={toggleTheme}
          title="深浅色切换"
          className="colora-sidebar-button flex w-full flex-col items-center rounded-lg text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          {theme === "dark" ? (
            <Sun className="size-5" strokeWidth={1.6} />
          ) : (
            <Moon className="size-5" strokeWidth={1.6} />
          )}
          <span className="colora-sidebar-label leading-none">
            {theme === "dark" ? "浅色" : "深色"}
          </span>
        </button>

        <AccountPopover />
      </div>
    </aside>
  );
}
