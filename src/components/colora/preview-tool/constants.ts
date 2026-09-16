import type { CompType } from "./types";
import type { TKey } from "@/lib/i18n";

/** 设备分组的稳定 id。用 id 而非中文名做键 —— 中文名会随语言变。 */
export type DeviceGroupId =
  "phone" | "tablet" | "desktop" | "presentation" | "watch" | "paper" | "social";

export type Device = {
  /** 稳定 id，存进 state 与导出 JSON。 */
  id: string;
  /**
   * 显示名，也是词典 key。
   * 品牌名与纯数字尺寸（如 "iPhone 17 Pro Max (440×956)"）在任何语言下都相同，
   * 词典里做恒等映射即可；含中文的（如 "超宽屏"）才给真正的英文译文。
   */
  label: TKey;
  w: number;
  h: number;
};

export type DeviceGroup = { id: DeviceGroupId; label: TKey; devices: Device[] };

export const DEVICE_GROUPS: DeviceGroup[] = [
  {
    id: "phone",
    label: "手机",
    devices: [
      { id: "iphone-17-pro-max", label: "iPhone 17 Pro Max (440×956)", w: 440, h: 956 },
      { id: "iphone-17-pro", label: "iPhone 17 Pro (402×874)", w: 402, h: 874 },
      { id: "iphone-17", label: "iPhone 17 (402×874)", w: 402, h: 874 },
      { id: "iphone-air", label: "iPhone Air (420×912)", w: 420, h: 912 },
      { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max (440×956)", w: 440, h: 956 },
      { id: "iphone-16-pro", label: "iPhone 16 Pro (402×874)", w: 402, h: 874 },
      { id: "iphone-16-plus", label: "iPhone 16 Plus (430×932)", w: 430, h: 932 },
      { id: "iphone-16", label: "iPhone 16 (393×852)", w: 393, h: 852 },
      { id: "iphone-16e", label: "iPhone 16e (390×844)", w: 390, h: 844 },
      { id: "iphone-15-pro", label: "iPhone 15 Pro (393×852)", w: 393, h: 852 },
      { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max (430×932)", w: 430, h: 932 },
      { id: "iphone-se", label: "iPhone SE (375×667)", w: 375, h: 667 },
      { id: "pixel-8", label: "Pixel 8 (412×915)", w: 412, h: 915 },
      { id: "pixel-8-pro", label: "Pixel 8 Pro (448×998)", w: 448, h: 998 },
      { id: "galaxy-s24", label: "Galaxy S24 (360×780)", w: 360, h: 780 },
      { id: "galaxy-s24-ultra", label: "Galaxy S24 Ultra (384×824)", w: 384, h: 824 },
      { id: "android-common", label: "Android 常用 (360×800)", w: 360, h: 800 },
    ],
  },
  {
    id: "tablet",
    label: "平板",
    devices: [
      { id: "ipad-pro-13-m4", label: 'iPad Pro 13" M4 (1032×1376)', w: 1032, h: 1376 },
      {
        id: "ipad-pro-13-m4-landscape",
        label: 'iPad Pro 13" M4 横屏 (1376×1032)',
        w: 1376,
        h: 1032,
      },
      { id: "ipad-pro-11-m4", label: 'iPad Pro 11" M4 (834×1210)', w: 834, h: 1210 },
      { id: "ipad-air-13", label: 'iPad Air 13" (1024×1366)', w: 1024, h: 1366 },
      { id: "ipad-air-11", label: 'iPad Air 11" (820×1180)', w: 820, h: 1180 },
      { id: "ipad-11", label: "iPad 11 (820×1180)", w: 820, h: 1180 },
      { id: "ipad-mini", label: "iPad Mini (744×1133)", w: 744, h: 1133 },
      { id: "ipad-pro-129", label: 'iPad Pro 12.9" (1024×1366)', w: 1024, h: 1366 },
      { id: "ipad-pro-11", label: 'iPad Pro 11" (834×1194)', w: 834, h: 1194 },
      { id: "surface-pro", label: "Surface Pro (912×1368)", w: 912, h: 1368 },
      { id: "android-tablet", label: "Android 平板 (800×1280)", w: 800, h: 1280 },
    ],
  },
  {
    id: "desktop",
    label: "桌面",
    devices: [
      { id: "1280x720", label: "1280×720", w: 1280, h: 720 },
      { id: "1366x768", label: "1366×768", w: 1366, h: 768 },
      { id: "1440x900", label: "1440×900", w: 1440, h: 900 },
      { id: "1536x864", label: "1536×864", w: 1536, h: 864 },
      { id: "1920x1080", label: "1920×1080", w: 1920, h: 1080 },
      { id: "2560x1440", label: "2560×1440", w: 2560, h: 1440 },
      { id: "macbook-air-13", label: 'MacBook Air 13" (1470×956)', w: 1470, h: 956 },
      { id: "macbook-air-15", label: 'MacBook Air 15" (1710×1107)', w: 1710, h: 1107 },
      { id: "macbook-pro-14", label: 'MacBook Pro 14" (1512×982)', w: 1512, h: 982 },
      { id: "macbook-pro-16", label: 'MacBook Pro 16" (1728×1117)', w: 1728, h: 1117 },
      { id: "ultrawide", label: "超宽屏 (3440×1440)", w: 3440, h: 1440 },
    ],
  },
  {
    id: "presentation",
    label: "演示文稿",
    devices: [
      { id: "16-10-1920x1200", label: "16:10 (1920×1200)", w: 1920, h: 1200 },
      { id: "16-9-1920x1080", label: "16:9 (1920×1080)", w: 1920, h: 1080 },
      { id: "16-9-1280x720", label: "16:9 (1280×720)", w: 1280, h: 720 },
      { id: "4-3-1024x768", label: "4:3 (1024×768)", w: 1024, h: 768 },
      { id: "4-3-1600x1200", label: "4:3 (1600×1200)", w: 1600, h: 1200 },
      { id: "powerpoint-widescreen", label: "PowerPoint 宽屏 (960×540)", w: 960, h: 540 },
      { id: "powerpoint-4-3", label: "PowerPoint 4:3 (720×540)", w: 720, h: 540 },
      { id: "a4-landscape", label: "A4 横版 (842×595)", w: 842, h: 595 },
      { id: "social-presentation", label: "社媒演示 (1080×1350)", w: 1080, h: 1350 },
    ],
  },
  {
    id: "watch",
    label: "手表",
    devices: [
      { id: "apple-watch-ultra", label: "Apple Watch Ultra (205×251)", w: 205, h: 251 },
      { id: "apple-watch-46", label: "Apple Watch 46mm (208×248)", w: 208, h: 248 },
      { id: "apple-watch-45", label: "Apple Watch 45mm (198×242)", w: 198, h: 242 },
      { id: "apple-watch-44", label: "Apple Watch 44mm (184×224)", w: 184, h: 224 },
      { id: "apple-watch-41", label: "Apple Watch 41mm (176×215)", w: 176, h: 215 },
      { id: "apple-watch-40", label: "Apple Watch 40mm (162×197)", w: 162, h: 197 },
      { id: "wear-os-round", label: "Wear OS 圆形 (192×192)", w: 192, h: 192 },
      { id: "galaxy-watch", label: "Galaxy Watch (450×450)", w: 450, h: 450 },
    ],
  },
  {
    id: "paper",
    label: "纸张",
    devices: [
      { id: "a3", label: "A3 (842×1191)", w: 842, h: 1191 },
      { id: "a4", label: "A4 (595×842)", w: 595, h: 842 },
      { id: "a5", label: "A5 (420×595)", w: 420, h: 595 },
      { id: "a6", label: "A6 (298×420)", w: 298, h: 420 },
      { id: "letter", label: "Letter (612×792)", w: 612, h: 792 },
      { id: "legal", label: "Legal (612×1008)", w: 612, h: 1008 },
      { id: "business-card", label: "名片 (252×144)", w: 252, h: 144 },
      { id: "poster-2-3", label: "海报 2:3 (800×1200)", w: 800, h: 1200 },
    ],
  },
  {
    id: "social",
    label: "社交媒体",
    devices: [
      { id: "instagram-post", label: "Instagram 帖子 (1080×1080)", w: 1080, h: 1080 },
      { id: "instagram-portrait", label: "Instagram 竖图 (1080×1350)", w: 1080, h: 1350 },
      { id: "instagram-story", label: "Instagram 故事 (1080×1920)", w: 1080, h: 1920 },
      { id: "xiaohongshu-cover", label: "小红书封面 (1242×1660)", w: 1242, h: 1660 },
      { id: "tiktok", label: "抖音 / TikTok (1080×1920)", w: 1080, h: 1920 },
      { id: "youtube-thumbnail", label: "YouTube 缩略图 (1280×720)", w: 1280, h: 720 },
      { id: "twitter-post", label: "Twitter/X 帖子 (1600×900)", w: 1600, h: 900 },
      { id: "facebook-cover", label: "Facebook 封面 (820×312)", w: 820, h: 312 },
      { id: "linkedin-post", label: "LinkedIn 帖子 (1200×627)", w: 1200, h: 627 },
    ],
  },
];

/** 取分组的默认设备 id（新建卡片、切换分组时用）。 */
export function defaultDeviceId(groupId: DeviceGroupId): string {
  return DEVICE_GROUPS.find((g) => g.id === groupId)?.devices[0].id ?? "iphone-17-pro-max";
}

export const COMPONENTS: { key: CompType; label: TKey }[] = [
  { key: "card", label: "矩形色块 / 卡片" },
  { key: "heading", label: "标题文字" },
  { key: "text", label: "正文文字" },
  { key: "button", label: "按钮" },
  { key: "input", label: "输入框" },
  { key: "circle", label: "圆形" },
  { key: "divider", label: "分割线" },
  { key: "image", label: "图片占位框" },
];

/** 按 CompType 直接取 label，避免调用点写 `find(...)?.label` 再处理 undefined。 */
export const COMPONENT_LABELS = Object.fromEntries(
  COMPONENTS.map((c) => [c.key, c.label]),
) as Record<CompType, TKey>;

export const COLOR_QUEUE_KEY = "colora.preview.customColors";
