import { en } from "./en";

/**
 * 界面语言。
 *
 * 注意：中文原文当词典 key，所以 `translate("zh", key)` 直接返回 key 本身 ——
 * 不需要 zh 词典。见 `./en.ts` 的说明。
 */
export type Lang = "zh" | "en";

/** 语言选择器的选项。`label` 用各语言自己的写法（endonym），保证任何语言下都读得懂。 */
export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
];

/** 合法的词典 key。写错 key 会在编译期报错。 */
export type TKey = keyof typeof en;

/** 插值参数。key 里用 `{name}` 形式的占位符。 */
export type TParams = Record<string, string | number>;

const STORAGE_KEY = "colora.lang";

function isLang(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}

/** 无已存偏好时的判定：浏览器语言以 zh 开头则中文，否则英文。SSR 无 window 时返回 "zh"。 */
export function detectBrowserLang(): Lang {
  if (typeof navigator === "undefined") return "zh";
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * 读取当前语言，供**非组件环境**使用（路由 head、file-format 等拿不到 hook 的地方）。
 * 组件内请用 `useT()`，否则切语言不会重渲染。
 */
export function getStoredLang(): Lang {
  if (typeof window === "undefined") return "zh";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return detectBrowserLang();
    const parsed: unknown = JSON.parse(raw);
    return isLang(parsed) ? parsed : detectBrowserLang();
  } catch {
    return detectBrowserLang();
  }
}

/**
 * 取译文并替换占位符。
 * 中文时 `key` 本身就是模板，替换后即为中文结果；英文时查词典。
 */
export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const template = lang === "en" ? en[key] : key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
