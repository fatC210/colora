import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Eye, LogIn, LogOut } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { CB_LABELS, type CBMode } from "@/lib/color";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getUserInitial } from "./utils";

/** 各色盲类型对应的眼睛图标颜色，与 CB_LABELS 一一对应。 */
const CB_ICON_COLORS: Record<Exclude<CBMode, "none">, string> = {
  protanopia: "#ef4444",
  deuteranopia: "#22c55e",
  tritanopia: "#3b82f6",
  achromatopsia: "#737373",
};

/**
 * 鼠标离开后延迟关闭子菜单的时长。
 * 必须留出时间让指针跨过触发行与子菜单之间那 8px 的空隙（sideOffset），
 * 否则鼠标一离开触发行就会闪一下关掉、还没移到子菜单上。
 */
const HOVER_CLOSE_DELAY_MS = 150;

/** 设置行：左侧标签 + 右侧控件，两端对齐（同 ExportCanvasDialog 的 SettingRow）。 */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** 分段选择器：沿用 ExportCanvasDialog「缩放」那组的视觉，选中项反色。 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "h-7 rounded-md border px-2 text-xs font-medium transition-colors",
            value === option.value
              ? "border-foreground bg-foreground text-background"
              : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 账户与设置面板的内容（不含 Popover 外壳 —— 外壳留在 Sidebar 的 AccountAction，
 * 因为触发按钮的 markup 与 ActionTip 语义都依赖那里的 variant）。
 */
export function AccountMenu({
  onRequestSignIn,
  onClose,
}: {
  onRequestSignIn: () => void;
  onClose: () => void;
}) {
  const { user, lang, setLang, theme, toggleTheme, cbMode, setCbMode, signOut } = useColora();
  const [cbOpen, setCbOpen] = useState(false);
  const t = useT();

  // 子菜单开合的鼠标悬停逻辑。closeTimer 让指针有缓冲时间从触发行移到子菜单上。
  const closeTimerRef = useRef(0);
  // 最近一次指针类型：用来区分「鼠标点击」与「键盘 / 触屏点击」，
  // 前者交给 hover 接管（否则悬停展开后再点一下会立刻关掉，很别扭）。
  const lastPointerTypeRef = useRef<string>("mouse");

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = 0;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setCbOpen(false), HOVER_CLOSE_DELAY_MS);
  };
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const themeOptions: { value: "light" | "dark"; label: string }[] = [
    { value: "light", label: t("浅色") },
    { value: "dark", label: t("深色") },
  ];

  // 语言名用各自的写法（endonym），不走词典 —— 任何语言下都该显示成「简体中文 / English」。
  const langOptions: { value: Lang; label: string }[] = LANGUAGES.map((item) => ({
    value: item.id,
    label: item.label,
  }));

  // 「不模拟」排在最前，其余按 CB_LABELS 的顺序（红 / 绿 / 蓝 / 全）。
  const cbOptions: { value: CBMode; label: string }[] = [
    { value: "none", label: t("不模拟") },
    ...(Object.keys(CB_LABELS) as Exclude<CBMode, "none">[]).map((mode) => ({
      value: mode,
      label: t(CB_LABELS[mode]),
    })),
  ];
  const cbColor = cbMode === "none" ? undefined : CB_ICON_COLORS[cbMode];
  const cbLabel = cbMode === "none" ? t("不模拟") : t(CB_LABELS[cbMode]);

  return (
    <div className="space-y-4">
      {user && (
        <div className="flex items-center gap-3">
          <Avatar className="size-9 border border-border bg-primary text-primary-foreground">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {getUserInitial(user)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("已登录")}</p>
            <p className="truncate text-sm font-medium">{user}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <SettingRow label={t("语言")}>
          <Segmented<Lang> value={lang} options={langOptions} onChange={setLang} />
        </SettingRow>
        <SettingRow label={t("主题")}>
          <Segmented
            value={theme}
            options={themeOptions}
            // 只有浅色/深色两项，用 toggle 即可；将来若加「跟随系统」需改为直接 setTheme。
            onChange={(next) => {
              if (next !== theme) toggleTheme();
            }}
          />
        </SettingRow>

        {/* 色盲模拟：五项塞不进面板宽度，收进右侧弹出的二级菜单。
            用嵌套 Popover 而非 DropdownMenuSub —— 后者要求外层是 DropdownMenu 上下文，
            而本面板的外壳是 Popover（语言/主题的分段按钮也依赖它保持现状）。 */}
        <Popover open={cbOpen} onOpenChange={setCbOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("色盲模拟")}
              onPointerDown={(e) => {
                lastPointerTypeRef.current = e.pointerType;
              }}
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return; // 触屏没有 hover，走点击
                cancelClose();
                setCbOpen(true);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "mouse") return;
                scheduleClose();
              }}
              onClick={(e) => {
                // 键盘触发时 detail 为 0，走 Radix 默认的 toggle；
                // 鼠标点击则 preventDefault（Radix 会据此跳过自己的 toggle），开合完全交给 hover。
                if (e.detail > 0 && lastPointerTypeRef.current === "mouse") e.preventDefault();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>{t("色盲模拟")}</span>
              <span className="flex items-center gap-1">
                <Eye className="size-3.5" strokeWidth={1.6} style={{ color: cbColor }} />
                <span>{cbLabel}</span>
                <ChevronRight className="size-3.5" />
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-40 p-1"
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse") return;
              cancelClose();
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== "mouse") return;
              scheduleClose();
            }}
          >
            {cbOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setCbMode(option.value);
                  cancelClose();
                  setCbOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm hover:bg-accent",
                  cbMode === option.value && "bg-accent font-medium",
                )}
              >
                <span className="flex items-center gap-2">
                  <Eye
                    className="size-4 shrink-0"
                    strokeWidth={1.6}
                    style={{
                      color: option.value === "none" ? undefined : CB_ICON_COLORS[option.value],
                    }}
                  />
                  {option.label}
                </span>
                {cbMode === option.value && <span>✓</span>}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {user ? (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => {
            signOut();
            onClose();
          }}
        >
          <LogOut className="size-4" /> {t("退出登录")}
        </Button>
      ) : (
        <Button className="w-full gap-2" onClick={onRequestSignIn}>
          <LogIn className="size-4" /> {t("登录")}
        </Button>
      )}
    </div>
  );
}
