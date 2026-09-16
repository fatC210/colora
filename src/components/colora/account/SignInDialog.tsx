import { useEffect, useRef, useState } from "react";
import { useColora } from "@/lib/colora-store";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 居中的登录 / 注册弹窗。
 *
 * 受控组件：开合状态由调用方（Sidebar 里的 AccountAction）持有 —— 它还要负责
 * 「关设置面板 → 开这个弹窗」的焦点转场，状态放外面才能协调两者。
 */
export function SignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signIn, signUp } = useColora();
  const t = useT();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<TKey | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailOk && pw.length >= 6 && (mode === "login" || pw2.length >= 6);

  // 关闭后清掉密码与错误，避免下次打开看到上次的残留；邮箱保留，方便改密重试。
  useEffect(() => {
    if (open) return;
    setPw("");
    setPw2("");
    setError(null);
  }, [open]);

  const submit = () => {
    const res = mode === "login" ? signIn(email, pw) : signUp(email, pw, pw2);

    if (!res.ok) {
      setError(res.errorKey ?? "操作失败");
      return;
    }

    setPw("");
    setPw2("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        // Radix 默认聚焦第一个可聚焦元素，而 DialogContent 内置的右上角关闭按钮排在最前，
        // 会导致打开后焦点落在「关闭」上。改为直接聚焦邮箱输入框。
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          emailRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("登录 Colora")}</DialogTitle>
          <DialogDescription>
            {t("无需登录即可使用大部分工具，登录后才能保存和管理配色方案。")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v);
            setPw("");
            setPw2("");
            setError(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="w-full">
              {t("登录")}
            </TabsTrigger>
            <TabsTrigger value="register" className="w-full">
              {t("注册")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="text-xs text-muted-foreground" htmlFor="colora-signin-email">
            {t("邮箱地址")}
          </label>
          <Input
            id="colora-signin-email"
            ref={emailRef}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder={t("请输入邮箱地址")}
            type="email"
            autoComplete="email"
          />
          <label className="text-xs text-muted-foreground" htmlFor="colora-signin-password">
            {t("密码")}
          </label>
          <Input
            id="colora-signin-password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setError(null);
            }}
            placeholder={t("至少 6 位密码")}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "register" && (
            <>
              <label className="text-xs text-muted-foreground" htmlFor="colora-signin-password2">
                {t("确认密码")}
              </label>
              <Input
                id="colora-signin-password2"
                value={pw2}
                onChange={(e) => {
                  setPw2(e.target.value);
                  setError(null);
                }}
                placeholder={t("请再次输入密码")}
                type="password"
                autoComplete="new-password"
              />
              {pw2.length > 0 && pw !== pw2 && (
                <p className="text-[11px] text-muted-foreground">{t("两次输入的密码不一致")}</p>
              )}
            </>
          )}
          {error && <p className="text-[11px] font-medium">{t(error)}</p>}
          <Button className="w-full" type="submit" disabled={!canSubmit}>
            {mode === "login" ? t("登录") : t("注册并登录")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
