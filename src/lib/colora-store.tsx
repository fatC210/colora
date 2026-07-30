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
  signIn: (email: string) => void;
  signOut: () => void;
  gradientStops: { hex: string; pos: number }[];
  setGradientStops: (s: { hex: string; pos: number }[]) => void;
};

const Ctx = createContext<Store | null>(null);

const DEFAULT_PALETTE = ["#111111", "#3D3D3D", "#7A7A7A", "#B4B4B4", "#EDEDED"];

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
  const [color, setColorState] = useState("#1A1A1A");
  const [prevColor, setPrevColor] = useState("#1A1A1A");
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [cbMode, setCbMode] = useState<CBMode>("none");
  const [saved, setSaved] = useState<SavedPalette[]>([]);
  const [user, setUser] = useState<string | null>(null);
  const [gradientStops, setGradientStops] = useState([
    { hex: "#000000", pos: 0 },
    { hex: "#FFFFFF", pos: 100 },
  ]);

  useEffect(() => {
    setTheme(load<"light" | "dark">("colora.theme", "light"));
    setSaved(load<SavedPalette[]>("colora.saved", []));
    setUser(load<string | null>("colora.user", null));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("colora.theme", JSON.stringify(theme));
  }, [theme]);

  const persistSaved = useCallback((next: SavedPalette[]) => {
    setSaved(next);
    localStorage.setItem("colora.saved", JSON.stringify(next));
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
      signIn: (email) => {
        setUser(email);
        localStorage.setItem("colora.user", JSON.stringify(email));
      },
      signOut: () => {
        setUser(null);
        localStorage.removeItem("colora.user");
      },
      gradientStops,
      setGradientStops,
    }),
    [theme, color, prevColor, palette, cbMode, saved, user, gradientStops, persistSaved],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useColora() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useColora must be used inside ColoraProvider");
  return ctx;
}
