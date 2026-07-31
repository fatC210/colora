import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { CBMode, InterpSpace, MixMode } from "./color";
import { randomHex } from "./color";

export type SavedPalette = { id: string; name: string; colors: string[]; createdAt: number };
export type SavedColor = { id: string; name: string; hex: string; createdAt: number };
export type GradientStop = {
  id: string;
  hex: string;
  pos: number;
  mesh?: { x: number; y: number };
};

export type GradientConfig = {
  type: "linear" | "radial" | "conic" | "mesh";
  angle: number;
  space: InterpSpace;
  center: { x: number; y: number };
};

export type SavedGradient = {
  id: string;
  name: string;
  stops: GradientStop[];
  config: GradientConfig;
  createdAt: number;
};

export type ImageExportState = {
  count: number;
  colors: { hex: string; share: number }[];
  hasImage: boolean;
};

export type MixerExportState = {
  items: { hex: string; weight: number }[];
  mode: MixMode;
  result: string;
};

export type ContrastExportState = {
  fg: string;
  bg: string;
  ratio: number;
  suggestions: string[];
};

export type PreviewExportState = {
  group: string;
  device: string;
  cards: {
    id: string;
    name: string;
    bg: string;
    comps: { id: string; type: string; color: string; radius: number }[];
  }[];
  colors: string[];
};

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
  favoriteColors: SavedColor[];
  saveColor: (name: string, hex: string) => void;
  removeColor: (id: string) => void;
  renameColor: (id: string, name: string) => void;
  favoriteGradients: SavedGradient[];
  saveGradient: (name: string, stops: GradientStop[], config: GradientConfig) => void;
  removeGradient: (id: string) => void;
  renameGradient: (id: string, name: string) => void;
  user: string | null;
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signUp: (email: string, password: string, confirm: string) => { ok: boolean; error?: string };
  signOut: () => void;
  gradientStops: GradientStop[];
  setGradientStops: Dispatch<SetStateAction<GradientStop[]>>;
  gradientConfig: GradientConfig;
  setGradientConfig: Dispatch<SetStateAction<GradientConfig>>;
  imageExport: ImageExportState;
  setImageExport: Dispatch<SetStateAction<ImageExportState>>;
  mixerExport: MixerExportState;
  setMixerExport: Dispatch<SetStateAction<MixerExportState>>;
  contrastExport: ContrastExportState;
  setContrastExport: Dispatch<SetStateAction<ContrastExportState>>;
  previewExport: PreviewExportState;
  setPreviewExport: Dispatch<SetStateAction<PreviewExportState>>;
  logoGradient: [string, string];
  randomizeLogoGradient: () => void;
};

const Ctx = createContext<Store | null>(null);

const DEFAULT_PALETTE = ["#6366F1", "#F97316", "#FACC15", "#14B8A6", "#8B5CF6"];

const DEFAULT_GRADIENT_CONFIG: GradientConfig = {
  type: "linear",
  angle: 135,
  space: "rgb",
  center: { x: 50, y: 50 },
};

function createId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSavedColors(colors: string[]) {
  return colors.map((hex) => hex.toUpperCase());
}

function cloneGradientStops(stops: GradientStop[]) {
  return stops.map((stop) => ({ ...stop, mesh: stop.mesh ? { ...stop.mesh } : undefined }));
}

function cloneGradientConfig(config: GradientConfig): GradientConfig {
  return { ...config, center: { ...config.center } };
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function userStorageKey(user: string, key: string) {
  return `colora.users.${user}.${key}`;
}

function loadUserCollection<T>(user: string, key: string, fallback: T): T {
  return load<T>(userStorageKey(user, key), fallback);
}

function persistUserCollection<T>(user: string | null, key: string, value: T) {
  if (!user || typeof window === "undefined") return;
  localStorage.setItem(userStorageKey(user, key), JSON.stringify(value));
}

function promptSignInForFavorite() {
  toast.warning("请先登录后再收藏", {
    description: "登录后，收藏会跟随你的账号保存。",
  });
}

function migrateLegacyCollections(user: string) {
  if (typeof window === "undefined") return;

  const legacyKeys = ["saved", "favoriteColors", "favoriteGradients"] as const;
  const hasUserData = legacyKeys.some((key) => localStorage.getItem(userStorageKey(user, key)));
  if (hasUserData) return;

  const legacySaved = localStorage.getItem("colora.saved");
  const legacyFavoriteColors = localStorage.getItem("colora.favoriteColors");
  const legacyFavoriteGradients = localStorage.getItem("colora.favoriteGradients");

  if (legacySaved) localStorage.setItem(userStorageKey(user, "saved"), legacySaved);
  if (legacyFavoriteColors)
    localStorage.setItem(userStorageKey(user, "favoriteColors"), legacyFavoriteColors);
  if (legacyFavoriteGradients)
    localStorage.setItem(userStorageKey(user, "favoriteGradients"), legacyFavoriteGradients);

  if (legacySaved || legacyFavoriteColors || legacyFavoriteGradients) {
    localStorage.removeItem("colora.saved");
    localStorage.removeItem("colora.favoriteColors");
    localStorage.removeItem("colora.favoriteGradients");
  }
}

export function ColoraProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [color, setColorState] = useState("#6366F1");
  const [prevColor, setPrevColor] = useState("#6366F1");
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [cbMode, setCbMode] = useState<CBMode>("none");
  const [saved, setSaved] = useState<SavedPalette[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<SavedColor[]>([]);
  const [favoriteGradients, setFavoriteGradients] = useState<SavedGradient[]>([]);
  const [user, setUser] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([
    { id: "gradient-stop-1", hex: "#6366F1", pos: 0, mesh: { x: 18, y: 35 } },
    { id: "gradient-stop-2", hex: "#14B8A6", pos: 100, mesh: { x: 62, y: 18 } },
  ]);
  const [gradientConfig, setGradientConfig] = useState<GradientConfig>(DEFAULT_GRADIENT_CONFIG);
  const [imageExport, setImageExport] = useState<ImageExportState>({
    count: 6,
    colors: [],
    hasImage: false,
  });
  const [mixerExport, setMixerExport] = useState<MixerExportState>({
    items: [
      { hex: "#6366F1", weight: 50 },
      { hex: "#F97316", weight: 50 },
    ],
    mode: "subtractive",
    result: "#78536D",
  });
  const [contrastExport, setContrastExport] = useState<ContrastExportState>({
    fg: "#0F172A",
    bg: "#F1F1F1",
    ratio: 14.9,
    suggestions: [],
  });
  const [previewExport, setPreviewExport] = useState<PreviewExportState>({
    group: "手机",
    device: "iPhone 16 (393×852)",
    cards: [],
    colors: DEFAULT_PALETTE,
  });
  const [logoGradient, setLogoGradient] = useState<[string, string]>(["#F97316", "#8B5CF6"]);

  useEffect(() => {
    setTheme(load<"light" | "dark">("colora.theme", "light"));
    setUser(load<string | null>("colora.user", null));
    setAccounts(load<Record<string, string>>("colora.accounts", {}));
  }, []);

  useEffect(() => {
    if (!user) {
      setSaved([]);
      setFavoriteColors([]);
      setFavoriteGradients([]);
      return;
    }

    migrateLegacyCollections(user);
    setSaved(loadUserCollection<SavedPalette[]>(user, "saved", []));
    setFavoriteColors(loadUserCollection<SavedColor[]>(user, "favoriteColors", []));
    setFavoriteGradients(loadUserCollection<SavedGradient[]>(user, "favoriteGradients", []));
  }, [user]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("colora.theme", JSON.stringify(theme));
  }, [theme]);

  const persistSaved = useCallback(
    (next: SavedPalette[]) => {
      if (!user) {
        promptSignInForFavorite();
        return;
      }
      setSaved(next);
      persistUserCollection(user, "saved", next);
    },
    [user],
  );

  const persistFavoriteColors = useCallback(
    (next: SavedColor[]) => {
      if (!user) {
        promptSignInForFavorite();
        return;
      }
      setFavoriteColors(next);
      persistUserCollection(user, "favoriteColors", next);
    },
    [user],
  );

  const persistFavoriteGradients = useCallback(
    (next: SavedGradient[]) => {
      if (!user) {
        promptSignInForFavorite();
        return;
      }
      setFavoriteGradients(next);
      persistUserCollection(user, "favoriteGradients", next);
    },
    [user],
  );

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
          {
            id: createId("palette"),
            name,
            colors: normalizeSavedColors(colors),
            createdAt: Date.now(),
          },
          ...saved,
        ]),
      removePalette: (id) => persistSaved(saved.filter((s) => s.id !== id)),
      renamePalette: (id, name) =>
        persistSaved(saved.map((s) => (s.id === id ? { ...s, name } : s))),
      favoriteColors,
      saveColor: (name, hex) =>
        persistFavoriteColors([
          { id: createId("color"), name, hex: hex.toUpperCase(), createdAt: Date.now() },
          ...favoriteColors,
        ]),
      removeColor: (id) => persistFavoriteColors(favoriteColors.filter((s) => s.id !== id)),
      renameColor: (id, name) =>
        persistFavoriteColors(favoriteColors.map((s) => (s.id === id ? { ...s, name } : s))),
      favoriteGradients,
      saveGradient: (name, stops, config) =>
        persistFavoriteGradients([
          {
            id: createId("gradient"),
            name,
            stops: cloneGradientStops(stops),
            config: cloneGradientConfig(config),
            createdAt: Date.now(),
          },
          ...favoriteGradients,
        ]),
      removeGradient: (id) =>
        persistFavoriteGradients(favoriteGradients.filter((s) => s.id !== id)),
      renameGradient: (id, name) =>
        persistFavoriteGradients(favoriteGradients.map((s) => (s.id === id ? { ...s, name } : s))),
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
        setSaved([]);
        setFavoriteColors([]);
        setFavoriteGradients([]);
      },
      gradientStops,
      setGradientStops,
      gradientConfig,
      setGradientConfig,
      imageExport,
      setImageExport,
      mixerExport,
      setMixerExport,
      contrastExport,
      setContrastExport,
      previewExport,
      setPreviewExport,
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
      favoriteColors,
      favoriteGradients,
      user,
      accounts,
      gradientStops,
      gradientConfig,
      imageExport,
      mixerExport,
      contrastExport,
      previewExport,
      logoGradient,
      persistSaved,
      persistFavoriteColors,
      persistFavoriteGradients,
      randomizeLogoGradient,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useColora() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useColora must be used inside ColoraProvider");
  return ctx;
}
