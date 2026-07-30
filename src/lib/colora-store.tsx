import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CBMode } from "./color";
import { randomHex } from "./color";

export type SavedPalette = { id: string; name: string; colors: string[]; createdAt: number };

type Store = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  color: string;
  setColor: (hex: string) => void;
  prevColor: string;
  palette: string[];
  setPalette: (c: string[]) => void;
  cbMode: CBMode;
  setCbMode: (m: CBMode) => void;
  saved: SavedPalette[];
  savePalette: (name: string, colors: string[]) => void;
  removePalette: (id: string) => void;
  renamePalette: (id: string, name: string) => void;
  user: string | null;
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signUp: (
    email: string,
    password: string,
    confirm: string,
  ) => { ok: boolean; error?: string };
  signOut: () => void;
  gradientStops: { hex: string; pos: number }[];
  setGradientStops: (s: { hex: string; pos: number }[]) => void;
  logoGradient: [string, string];
  randomizeLogoGradient: () => void;
};

const Ctx = createContext<Store | null>(null);

const DEFAULT_PALETTE = ["#6366F1", "#F97316", "#FACC15", "#14B8A6", "#8B5CF6"];

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ColoraProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [color, setColorState] = useState("#6366F1");
  const [prevColor, setPrevColor] = useState("#6366F1");
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [cbMode, setCbMode] = useState<CBMode>("none");
  const [saved, setSaved] = useState<SavedPalette[]>([]);
  const [user, setUser] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [gradientStops, setGradientStops] = useState([
    { hex: "#6366F1", pos: 0 },
    { hex: "#14B8A6", pos: 100 },
  ]);
  const [logoGradient, setLogoGradient] = useState<[string, string]>([
    "#F97316",
    "#8B5CF6",
  ]);

  useEffect(() => {
    setTheme(load<"light" | "dark">("colora.theme", "light"));
    setSaved(load<SavedPalette[]>("colora.saved", []));
    setUser(load<string | null>("colora.user", null));
    setAccounts(load<Record<string, string>>("colora.accounts", {}));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("colora.theme", JSON.stringify(theme));
  }, [theme]);

  const persistSaved = useCallback((next: SavedPalette[]) => {
    setSaved(next);
    localStorage.setItem("colora.saved", JSON.stringify(next));
  }, []);

  const randomizeLogoGradient = useCallback(() => {
    setLogoGradient([randomHex(), randomHex()]);
  }, []);

  const value = useMemo<Store>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      color,
      setColor: (hex) => {
        setPrevColor(color);
        setColorState(hex.toUpperCase());
      },
      prevColor,
      palette,
      setPalette,
      cbMode,
      setCbMode,
      saved,
      savePalette: (name, colors) =>
        persistSaved([
          { id: crypto.randomUUID(), name, colors, createdAt: Date.now() },
          ...saved,
        ]),
      removePalette: (id) => persistSaved(saved.filter((s) => s.id !== id)),
      renamePalette: (id, name) =>
        persistSaved(saved.map((s) => (s.id === id ? { ...s, name } : s))),
      user,
      signIn: (email, password) => {
        const key = email.trim().toLowerCase();
        if (!accounts[key]) return { ok: false, error: "该邮箱尚未注册" };
        if (accounts[key] !== password) return { ok: false, error: "密码不正确" };
        setUser(key);
        localStorage.setItem("colora.user", JSON.stringify(key));
        return { ok: true };
      },
      signUp: (email, password, confirm) => {
        const key = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key))
          return { ok: false, error: "请输入有效的邮箱地址" };
        if (password.length < 6) return { ok: false, error: "密码至少 6 位" };
        if (password !== confirm) return { ok: false, error: "两次输入的密码不一致" };
        if (accounts[key]) return { ok: false, error: "该邮箱已注册，请直接登录" };
        const next = { ...accounts, [key]: password };
        setAccounts(next);
        localStorage.setItem("colora.accounts", JSON.stringify(next));
        setUser(key);
        localStorage.setItem("colora.user", JSON.stringify(key));
        return { ok: true };
      },
      signOut: () => {
        setUser(null);
        localStorage.removeItem("colora.user");
      },
      gradientStops,
      setGradientStops,
      logoGradient,
      randomizeLogoGradient,
    }),
    [
      theme,
      color,
      prevColor,
      palette,
      cbMode,
      saved,
      user,
      accounts,
      gradientStops,
      persistSaved,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useColora() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useColora must be used inside ColoraProvider");
  return ctx;
}
