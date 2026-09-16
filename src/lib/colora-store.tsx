import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { CBMode, InterpSpace, MixMode } from "./color";
import type { Lang, TKey } from "./i18n";
import { detectBrowserLang, getStoredLang, translate } from "./i18n";

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

/** 导出用的取色点位（不含显示用的临时状态）。 */
export type ImageExportPoint = {
  id: string;
  /** 归一化坐标 0..1，相对原图左上角。 */
  x: number;
  y: number;
  hex: string;
  /** 仅 K-means 铺的初始点位有：该聚类像素占比。 */
  share?: number;
};

export type ImageExportState = {
  count: number;
  points: ImageExportPoint[];
  hasImage: boolean;
  /** 原图 dataURL。导出「原图 + 配色」合成图需要，故不放进 JSON 导出。 */
  src: string | null;
  /** 原图像素宽，未加载完时为 0。 */
  width: number;
  /** 原图像素高，未加载完时为 0。 */
  height: number;
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
  lang: Lang;
  setLang: (lang: Lang) => void;
  zenMode: boolean;
  toggleZen: () => void;
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
  signIn: (email: string, password: string) => { ok: boolean; errorKey?: TKey };
  signUp: (email: string, password: string, confirm: string) => { ok: boolean; errorKey?: TKey };
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
  logoGradient: string[];
  randomizeLogoGradient: () => void;
};

const Ctx = createContext<Store | null>(null);

const DEFAULT_PALETTE = ["#6366F1", "#F97316", "#FACC15", "#14B8A6", "#8B5CF6"];

/**
 * 首页与侧栏两处品牌字 “COLORA” 共用的渐变色组。每次点击随机取一组。
 *
 * 刻意用手挑的固定色组、而不是 `randomHex()` 抽两个随机色：
 * 随机色经常抽到相邻的两个低对比色（比如深蓝配深紫），
 * 铺在细笔画字形上会糊成一片；固定色组保证每一组都足够鲜艳、明暗有对比。
 */
const LOGO_GRADIENTS: readonly (readonly string[])[] = [
  ["#F97316", "#8B5CF6"],
  ["#6366F1", "#EC4899"],
  ["#14B8A6", "#FACC15"],
  ["#8B5CF6", "#06B6D4"],
  ["#F43F5E", "#FB923C"],
  ["#22C55E", "#0EA5E9"],
  ["#A855F7", "#F97316", "#FACC15"],
  ["#3B82F6", "#8B5CF6", "#EC4899"],
  ["#EF4444", "#F59E0B", "#10B981"],
  ["#0891B2", "#7C3AED"],
];

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
  // 非组件环境（模块级函数），拿不到 useT，用 getStoredLang + translate。
  const t = (key: TKey) => translate(getStoredLang(), key);
  toast.warning(t("请先登录后再收藏"), {
    description: t("登录后，收藏会跟随你的账号保存。"),
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
  const [lang, setLang] = useState<Lang>("zh");
  const [zenMode, setZenMode] = useState(false);
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
    points: [],
    hasImage: false,
    src: null,
    width: 0,
    height: 0,
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
    group: "phone",
    device: "iphone-17-pro-max",
    cards: [],
    colors: DEFAULT_PALETTE,
  });
  const [logoGradient, setLogoGradient] = useState<string[]>([...LOGO_GRADIENTS[0]]);
  // 记住上一次抽中的下标，用于避免连续两次点到同一组（看不出“换过了”）。
  const logoGradientIndex = useRef(0);

  useEffect(() => {
    setTheme(load<"light" | "dark">("colora.theme", "light"));
    // 无已存偏好时跟随浏览器语言；用户一旦手动选过，就永远以 colora.lang 为准。
    setLang(load<Lang>("colora.lang", detectBrowserLang()));
    setZenMode(load<boolean>("colora.zen", false));
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

  useEffect(() => {
    localStorage.setItem("colora.zen", JSON.stringify(zenMode));
  }, [zenMode]);

  // 界面文案已接入 i18n，同步 <html lang> 让屏幕阅读器拿到正确的内容语言。
  // __root.tsx 里静态的 lang="zh-CN" 是 SSR 默认值，客户端由这里覆盖。
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    localStorage.setItem("colora.lang", JSON.stringify(lang));
  }, [lang]);

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
    const last = logoGradientIndex.current;
    let next = last;
    while (next === last) next = Math.floor(Math.random() * LOGO_GRADIENTS.length);
    logoGradientIndex.current = next;
    setLogoGradient([...LOGO_GRADIENTS[next]]);
  }, []);

  const value = useMemo<Store>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      lang,
      setLang,
      zenMode,
      toggleZen: () => setZenMode((v) => !v),
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
        if (!accounts[key]) return { ok: false, errorKey: "该邮箱尚未注册" };
        if (accounts[key] !== password) return { ok: false, errorKey: "密码不正确" };
        setUser(key);
        localStorage.setItem("colora.user", JSON.stringify(key));
        return { ok: true };
      },
      signUp: (email, password, confirm) => {
        const key = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key))
          return { ok: false, errorKey: "请输入有效的邮箱地址" };
        if (password.length < 6) return { ok: false, errorKey: "密码至少 6 位" };
        if (password !== confirm) return { ok: false, errorKey: "两次输入的密码不一致" };
        if (accounts[key]) return { ok: false, errorKey: "该邮箱已注册，请直接登录" };
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
      lang,
      zenMode,
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
