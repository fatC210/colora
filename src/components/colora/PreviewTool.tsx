import { useEffect, useMemo, useState } from "react";
import { Download, Lock, MoreVertical, Pipette, Plus, Trash2, Unlock } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { bestTextOn, normalizeHex, simulateCB } from "@/lib/color";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ColorPicker, Tip } from "./primitives";
import { ExportDialog } from "./ExportDialog";

const DEVICE_GROUPS: Record<string, { label: string; w: number; h: number }[]> = {
  手机: [
    { label: "iPhone 16 (393×852)", w: 393, h: 852 },
    { label: "iPhone 16 Pro Max (440×956)", w: 440, h: 956 },
    { label: "iPhone 15 Pro (393×852)", w: 393, h: 852 },
    { label: "iPhone 14 Pro Max (430×932)", w: 430, h: 932 },
    { label: "iPhone SE (375×667)", w: 375, h: 667 },
    { label: "Pixel 8 (412×915)", w: 412, h: 915 },
    { label: "Pixel 8 Pro (448×998)", w: 448, h: 998 },
    { label: "Galaxy S24 (360×780)", w: 360, h: 780 },
    { label: "Galaxy S24 Ultra (384×824)", w: 384, h: 824 },
    { label: "Android 常用 (360×800)", w: 360, h: 800 },
  ],
  平板: [
    { label: "iPad (820×1180)", w: 820, h: 1180 },
    { label: 'iPad 10.9" 横屏 (1180×820)', w: 1180, h: 820 },
    { label: 'iPad Air 11" (820×1180)', w: 820, h: 1180 },
    { label: 'iPad Pro 11" (834×1194)', w: 834, h: 1194 },
    { label: 'iPad Pro 12.9" (1024×1366)', w: 1024, h: 1366 },
    { label: "iPad Mini (744×1133)", w: 744, h: 1133 },
    { label: "Surface Pro (912×1368)", w: 912, h: 1368 },
    { label: "Android 平板 (800×1280)", w: 800, h: 1280 },
  ],
  桌面: [
    { label: "1280×720", w: 1280, h: 720 },
    { label: "1366×768", w: 1366, h: 768 },
    { label: "1440×900", w: 1440, h: 900 },
    { label: "1536×864", w: 1536, h: 864 },
    { label: "1920×1080", w: 1920, h: 1080 },
    { label: "2560×1440", w: 2560, h: 1440 },
    { label: 'MacBook Air 13" (1440×932)', w: 1440, h: 932 },
    { label: 'MacBook Pro 14" (1512×982)', w: 1512, h: 982 },
    { label: "超宽屏 (3440×1440)", w: 3440, h: 1440 },
  ],
  演示文稿: [
    { label: "16:10 (1920×1200)", w: 1920, h: 1200 },
    { label: "16:9 (1920×1080)", w: 1920, h: 1080 },
    { label: "16:9 (1280×720)", w: 1280, h: 720 },
    { label: "4:3 (1024×768)", w: 1024, h: 768 },
    { label: "4:3 (1600×1200)", w: 1600, h: 1200 },
    { label: "A4 横版 (842×595)", w: 842, h: 595 },
    { label: "Keynote 宽屏 (1920×1080)", w: 1920, h: 1080 },
    { label: "社媒演示 (1080×1350)", w: 1080, h: 1350 },
  ],
  手表: [
    { label: "Apple Watch 46mm (208×248)", w: 208, h: 248 },
    { label: "Apple Watch 45mm (198×242)", w: 198, h: 242 },
    { label: "Apple Watch 44mm (184×224)", w: 184, h: 224 },
    { label: "Apple Watch 41mm (176×215)", w: 176, h: 215 },
    { label: "Apple Watch 40mm (162×197)", w: 162, h: 197 },
    { label: "Wear OS 圆形 (192×192)", w: 192, h: 192 },
    { label: "Galaxy Watch (450×450)", w: 450, h: 450 },
  ],
  纸张: [
    { label: "A3 (842×1191)", w: 842, h: 1191 },
    { label: "A4 (595×842)", w: 595, h: 842 },
    { label: "A5 (420×595)", w: 420, h: 595 },
    { label: "A6 (298×420)", w: 298, h: 420 },
    { label: "Letter (612×792)", w: 612, h: 792 },
    { label: "Legal (612×1008)", w: 612, h: 1008 },
    { label: "名片 (336×192)", w: 336, h: 192 },
    { label: "海报 2:3 (800×1200)", w: 800, h: 1200 },
  ],
  社交媒体: [
    { label: "Instagram 帖子 (1080×1080)", w: 1080, h: 1080 },
    { label: "Instagram 竖图 (1080×1350)", w: 1080, h: 1350 },
    { label: "Instagram 故事 (1080×1920)", w: 1080, h: 1920 },
    { label: "小红书封面 (1242×1660)", w: 1242, h: 1660 },
    { label: "抖音 / TikTok (1080×1920)", w: 1080, h: 1920 },
    { label: "YouTube 缩略图 (1280×720)", w: 1280, h: 720 },
    { label: "Twitter/X 帖子 (1600×900)", w: 1600, h: 900 },
    { label: "Facebook 封面 (1640×924)", w: 1640, h: 924 },
    { label: "LinkedIn 帖子 (1200×627)", w: 1200, h: 627 },
  ],
};

type CompType = "card" | "heading" | "text" | "button" | "input" | "circle" | "divider" | "image";

const COMPONENTS: { key: CompType; label: string }[] = [
  { key: "card", label: "矩形色块 / 卡片" },
  { key: "heading", label: "标题文字" },
  { key: "text", label: "正文文字" },
  { key: "button", label: "按钮" },
  { key: "input", label: "输入框" },
  { key: "circle", label: "圆形" },
  { key: "divider", label: "分割线" },
  { key: "image", label: "图片占位框" },
];

type Comp = { id: string; type: CompType; color: string; radius: number };
type Card = { id: string; name: string; bg: string; comps: Comp[] };
type ColorQueueItem = { hex: string; locked: boolean; reused?: boolean };
type CardColorSelection = { cardId: string; source: "list" | "custom"; hex: string };

const COLOR_QUEUE_KEY = "colora.preview.customColors";

function uniqueHexColors(colors: Array<string | null | undefined>) {
  const unique: string[] = [];

  colors.forEach((colorValue) => {
    if (!colorValue) return;
    const hex = normalizeHex(colorValue);
    if (hex && !unique.includes(hex)) unique.push(hex);
  });

  return unique;
}

function uniqueColorQueueItems(items: ColorQueueItem[]) {
  const unique: ColorQueueItem[] = [];

  items.forEach((item) => {
    const hex = normalizeHex(item.hex);
    if (!hex || unique.some((existing) => existing.hex === hex)) return;
    unique.push({ hex, locked: item.locked, reused: item.reused });
  });

  return unique;
}

function mergeColorQueue(platformColors: string[], currentQueue: ColorQueueItem[]) {
  const queuedItems = uniqueColorQueueItems(currentQueue);
  const queuedItemByHex = new Map(queuedItems.map((item) => [item.hex, item]));
  const platformColorSet = new Set(platformColors);
  const platformItems = platformColors.map((hex) => ({
    hex,
    locked: queuedItemByHex.get(hex)?.locked ?? false,
    reused: queuedItemByHex.get(hex)?.reused,
  }));
  const extraItems = queuedItems.filter(
    (item) => !platformColorSet.has(item.hex) && (item.locked || item.reused),
  );

  return uniqueColorQueueItems([...platformItems, ...extraItems]);
}

function loadLockedColorQueue() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(COLOR_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return uniqueColorQueueItems(
      parsed
        .map((item): ColorQueueItem | null => {
          if (typeof item === "string") return { hex: item, locked: true };
          if (item && typeof item === "object" && "hex" in item) {
            return { hex: String(item.hex), locked: true };
          }

          return null;
        })
        .filter((item): item is ColorQueueItem => Boolean(item)),
    );
  } catch {
    return [];
  }
}

function saveLockedColorQueue(items: ColorQueueItem[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    COLOR_QUEUE_KEY,
    JSON.stringify(items.filter((item) => item.locked).map((item) => item.hex)),
  );
}

function ColorOptionList({
  items,
  selected,
  onSelect,
  onDelete,
  onToggleLock,
}: {
  items: ColorQueueItem[];
  selected: string;
  onSelect: (hex: string) => void;
  onDelete: (hex: string) => void;
  onToggleLock: (hex: string) => void;
}) {
  const selectedHex = normalizeHex(selected);

  return (
    <div className="grid max-h-40 grid-cols-6 justify-items-center gap-x-2 gap-y-3 overflow-y-auto px-1 py-1">
      {items.map(({ hex, locked }) => {
        const isSelected = selectedHex === hex;

        return (
          <div key={hex} className="group relative size-8">
            <button
              type="button"
              onClick={() => onSelect(hex)}
              className={cn(
                "size-8 rounded-lg border border-black/10 shadow-inner transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                locked &&
                  "border-background/80 ring-1 ring-foreground/35 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]",
                isSelected && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: hex }}
              aria-label={`选择颜色 ${hex}`}
              aria-pressed={isSelected}
            />
            {locked && (
              <span className="pointer-events-none absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm">
                <Lock className="size-2.5" />
              </span>
            )}
            <span className="absolute inset-x-0 top-0 flex justify-between p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleLock(hex);
                }}
                className="grid size-3.5 place-items-center rounded-sm bg-background/90 text-foreground shadow-sm hover:bg-background"
                aria-label={locked ? `取消锁定 ${hex}` : `锁定 ${hex}`}
              >
                {locked ? <Unlock className="size-2.5" /> : <Lock className="size-2.5" />}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(hex);
                }}
                className="grid size-3.5 place-items-center rounded-sm bg-background/90 text-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                aria-label={`删除 ${hex}`}
              >
                <Trash2 className="size-2.5" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CustomColorQueue({
  value,
  onChange,
  onAdd,
}: {
  value: string;
  onChange: (hex: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="text-xs font-medium text-muted-foreground">自定义颜色</div>
      <ColorPicker value={value} onChange={onChange} compact />
      <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={onAdd}>
        <span
          className="size-3 rounded-sm border border-border"
          style={{ backgroundColor: value }}
        />
        加入复用队列
      </Button>
    </div>
  );
}

function CardColorOptions({
  items,
  selection,
  customColor,
  onSelectListColor,
  onSelectCustomColor,
  onChangeCustomColor,
  onToggleLock,
  onDeleteColor,
  onAddToReuseList,
  onDeleteCard,
}: {
  items: ColorQueueItem[];
  selection: CardColorSelection;
  customColor: string;
  onSelectListColor: (hex: string) => void;
  onSelectCustomColor: () => void;
  onChangeCustomColor: (hex: string) => void;
  onToggleLock: () => void;
  onDeleteColor: () => void;
  onAddToReuseList: () => void;
  onDeleteCard: () => void;
}) {
  const selectedHex = normalizeHex(selection.hex);
  const selectedItem = items.find((item) => item.hex === selectedHex);
  const isLocked = selectedItem?.locked ?? false;
  const isCustomSelected = selection.source === "custom";

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">设置背景</div>
        <div className="grid max-h-40 grid-cols-6 justify-items-center gap-x-2 gap-y-3 overflow-y-auto px-1 py-1">
          {items.map(({ hex, locked }) => {
            const isSelected = !isCustomSelected && selectedHex === hex;

            return (
              <div key={hex} className="relative size-8">
                <button
                  type="button"
                  onClick={() => onSelectListColor(hex)}
                  className={cn(
                    "size-8 rounded-lg border border-black/10 shadow-inner transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                    locked &&
                      "border-background/80 ring-1 ring-foreground/35 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]",
                    isSelected && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: hex }}
                  aria-label={locked ? `选择已锁定颜色 ${hex}` : `选择颜色 ${hex}`}
                  aria-pressed={isSelected}
                />
                {locked && (
                  <span className="pointer-events-none absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm">
                    <Lock className="size-2.5" />
                  </span>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={onSelectCustomColor}
            className={cn(
              "relative grid size-8 place-items-center rounded-lg border-2 border-dashed border-foreground/45 bg-background p-0.5 transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
              isCustomSelected && "ring-2 ring-foreground",
            )}
            aria-label={`选择自定义颜色 ${customColor}`}
            aria-pressed={isCustomSelected}
          >
            <span
              className="size-full rounded-md shadow-inner"
              style={{ backgroundColor: customColor }}
            />
            <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-background bg-foreground text-background shadow-sm">
              <Pipette className="size-2.5" />
            </span>
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <ColorPicker value={selection.hex} onChange={onChangeCustomColor} compact />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onToggleLock}>
          {isLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
          {isLocked ? "取消锁定" : "锁定颜色"}
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onDeleteColor}>
          <Trash2 className="size-3.5" />
          删除颜色
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onAddToReuseList}
        >
          <Plus className="size-3.5" />
          加入复用列表
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={onDeleteCard}
        >
          <Trash2 className="size-3.5" />
          删除卡片
        </Button>
      </div>
    </div>
  );
}

function getPreviousColorOption(items: ColorQueueItem[], currentHex: string) {
  const normalizedHex = normalizeHex(currentHex);
  const currentIndex = items.findIndex((item) => item.hex === normalizedHex);

  if (currentIndex > 0) return items[currentIndex - 1].hex;
  if (currentIndex === 0) return items[1]?.hex ?? null;

  return items.at(-1)?.hex ?? null;
}

function DeviceGroupPreview({ group }: { group: string }) {
  const line = "bg-foreground/45";

  if (group === "手机") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <span className="flex h-7 w-4 flex-col items-center rounded-[5px] border border-foreground/45 bg-background p-0.5">
          <span className="mt-auto h-0.5 w-1 rounded-full bg-foreground/35" />
        </span>
      </span>
    );
  }

  if (group === "平板") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <span className="flex h-7 w-5 flex-col items-center rounded-[6px] border border-foreground/45 bg-background p-0.5">
          <span className="mt-auto h-0.5 w-1 rounded-full bg-foreground/35" />
        </span>
      </span>
    );
  }

  if (group === "桌面") {
    return (
      <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
        <span className="h-5 w-7 rounded-sm border border-foreground/45 bg-background" />
        <span className={`mt-0.5 h-0.5 w-2 rounded-full ${line}`} />
      </span>
    );
  }

  if (group === "演示文稿") {
    return (
      <span className="flex h-10 w-10 shrink-0 flex-col justify-center gap-1 rounded-lg bg-muted px-2">
        <span className="h-2 w-5 rounded-sm bg-foreground/45" />
        <span className="h-1 w-6 rounded-full bg-foreground/25" />
        <span className="h-1 w-4 rounded-full bg-foreground/25" />
      </span>
    );
  }

  if (group === "手表") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <span className="relative h-5 w-4 rounded-md border border-foreground/45 bg-background before:absolute before:left-1/2 before:top-[-5px] before:h-1 before:w-2 before:-translate-x-1/2 before:rounded-t-sm before:bg-foreground/30 after:absolute after:bottom-[-5px] after:left-1/2 after:h-1 after:w-2 after:-translate-x-1/2 after:rounded-b-sm after:bg-foreground/30" />
      </span>
    );
  }

  if (group === "纸张") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <span className="h-7 w-5 rounded-sm border border-foreground/35 bg-background shadow-[4px_4px_0_hsl(var(--foreground)/0.12)]" />
      </span>
    );
  }

  return (
    <span className="grid h-10 w-10 shrink-0 grid-cols-2 gap-0.5 rounded-lg bg-muted p-2">
      <span className="rounded-sm bg-foreground/45" />
      <span className="rounded-full bg-foreground/30" />
      <span className="rounded-full bg-foreground/25" />
      <span className="rounded-sm bg-foreground/40" />
    </span>
  );
}

function DeviceSizePreview({ width, height }: { width: number; height: number }) {
  const ratio = width / height;
  const previewWidth = ratio >= 1 ? 28 : Math.max(14, 28 * ratio);
  const previewHeight = ratio >= 1 ? Math.max(14, 28 / ratio) : 28;

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
      <span
        className="rounded-sm border border-foreground/45 bg-background shadow-sm"
        style={{ width: previewWidth, height: previewHeight }}
      />
    </span>
  );
}

function CompactDeviceGroupPreview({ group }: { group: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
      <div className="scale-[0.65]">
        <DeviceGroupPreview group={group} />
      </div>
    </div>
  );
}

function CompactDeviceSizePreview({ width, height }: { width: number; height: number }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
      <div className="scale-[0.65]">
        <DeviceSizePreview width={width} height={height} />
      </div>
    </div>
  );
}

function renderComp(c: Comp, cb: Parameters<typeof simulateCB>[1]) {
  const color = simulateCB(c.color, cb);
  switch (c.type) {
    case "card":
      return (
        <div className="h-20 w-full" style={{ backgroundColor: color, borderRadius: c.radius }} />
      );
    case "heading":
      return (
        <p className="text-lg font-semibold" style={{ color }}>
          探索色彩的无限可能
        </p>
      );
    case "text":
      return (
        <p className="text-xs leading-relaxed" style={{ color }}>
          科学的配色方案，让设计更出彩。
        </p>
      );
    case "button":
      return (
        <div
          className="px-4 py-2 text-center text-xs font-medium"
          style={{ backgroundColor: color, color: bestTextOn(c.color), borderRadius: c.radius }}
        >
          主要按钮
        </div>
      );
    case "input":
      return (
        <div
          className="px-3 py-2 text-xs text-muted-foreground"
          style={{ border: `1px solid ${color}`, borderRadius: c.radius }}
        >
          请输入内容
        </div>
      );
    case "circle":
      return <div className="size-12 rounded-full" style={{ backgroundColor: color }} />;
    case "divider":
      return <div className="h-0.5 w-full" style={{ backgroundColor: color }} />;
    default:
      return (
        <div
          className="checkerboard grid h-24 w-full place-items-center text-[10px] text-muted-foreground"
          style={{ borderRadius: c.radius, outline: `1px solid ${color}` }}
        >
          图片占位
        </div>
      );
  }
}

export function PreviewTool() {
  const {
    palette,
    color,
    prevColor,
    gradientStops,
    logoGradient,
    cbMode,
    setColor,
    setPreviewExport,
  } = useColora();
  const [group, setGroup] = useState("手机");
  const [device, setDevice] = useState(DEVICE_GROUPS["手机"][0].label);
  const defaultCardBg = palette[4] ?? "#EDEDED";
  const [cards, setCards] = useState<Card[]>([
    { id: "1", name: "预览卡片 01", bg: defaultCardBg, comps: [] },
  ]);
  const [cardColorSelections, setCardColorSelections] = useState<
    Record<string, CardColorSelection>
  >({
    "1": { cardId: "1", source: "list", hex: defaultCardBg },
  });
  const [cardCustomColors, setCardCustomColors] = useState<Record<string, string>>({
    "1": defaultCardBg,
  });
  const [removedColorHexes, setRemovedColorHexes] = useState<string[]>([]);
  const [colorQueue, setColorQueue] = useState<ColorQueueItem[]>([]);
  const [customDraft, setCustomDraft] = useState(color);
  const [customDraftSource, setCustomDraftSource] = useState<"list" | "custom">("custom");
  const [queueHydrated, setQueueHydrated] = useState(false);

  const dev = DEVICE_GROUPS[group].find((d) => d.label === device) ?? DEVICE_GROUPS[group][0];
  const scale = Math.min(1, 320 / dev.w, 560 / dev.h);
  const platformColors = useMemo(() => {
    const cardColors = cards.flatMap((card) => {
      const selected = cardColorSelections[card.id];
      const backgroundColors = selected?.source === "custom" ? [] : [card.bg];

      return [...backgroundColors, ...card.comps.map((comp) => comp.color)];
    });

    const removedColorSet = new Set(removedColorHexes);

    return uniqueHexColors([
      ...palette,
      color,
      prevColor,
      ...gradientStops.map((stop) => stop.hex),
      ...logoGradient,
      ...cardColors,
    ]).filter((hex) => !removedColorSet.has(hex));
  }, [
    cardColorSelections,
    cards,
    color,
    gradientStops,
    logoGradient,
    palette,
    prevColor,
    removedColorHexes,
  ]);

  useEffect(() => {
    setColorQueue((queue) =>
      mergeColorQueue(platformColors, queueHydrated ? queue : loadLockedColorQueue()),
    );
    if (!queueHydrated) setQueueHydrated(true);
  }, [platformColors, queueHydrated]);

  const colorOptions = colorQueue.length
    ? colorQueue
    : platformColors.map((hex) => ({ hex, locked: false }));

  useEffect(() => {
    const exportColors = colorQueue.length ? colorQueue.map((item) => item.hex) : platformColors;
    setPreviewExport({ group, device, cards, colors: exportColors });
  }, [cards, colorQueue, device, group, platformColors, setPreviewExport]);

  const update = (id: string, patch: Partial<Card>) =>
    setCards(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const updateColorQueue = (updater: (queue: ColorQueueItem[]) => ColorQueueItem[]) => {
    setColorQueue((queue) => {
      const next = uniqueColorQueueItems(updater(queue));
      saveLockedColorQueue(next);

      return next;
    });
  };

  const restoreDeletedColor = (hex: string) => {
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) return;

    setRemovedColorHexes((current) => current.filter((item) => item !== normalizedHex));
  };

  const deleteQueuedColor = (hex: string) => {
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) return;

    setRemovedColorHexes((current) =>
      current.includes(normalizedHex) ? current : [...current, normalizedHex],
    );
    updateColorQueue((queue) => queue.filter((item) => item.hex !== normalizedHex));
  };

  const toggleQueuedColorLock = (hex: string) => {
    updateColorQueue((queue) =>
      queue.map((item) => (item.hex === hex ? { ...item, locked: !item.locked } : item)),
    );
  };

  const selectListedColor = (hex: string) => {
    setCustomDraft(hex);
    setCustomDraftSource("list");
  };

  const selectCustomColor = (hex: string) => {
    setCustomDraft(hex);
    setCustomDraftSource("custom");
  };

  const previewCustomColor = (hex: string) => {
    const normalizedHex = normalizeHex(hex);
    selectCustomColor(hex);
    if (!normalizedHex) return;

    restoreDeletedColor(normalizedHex);
    updateColorQueue((queue) => {
      const existingItem = queue.find((item) => item.hex === normalizedHex);

      return [
        ...queue.filter((item) => item.hex !== normalizedHex),
        { hex: normalizedHex, locked: existingItem?.locked ?? false },
      ];
    });
  };

  const addCustomColor = () => {
    const hex = normalizeHex(customDraft);
    if (!hex) return null;

    restoreDeletedColor(hex);
    updateColorQueue((queue) => [
      ...queue.filter((item) => item.hex !== hex),
      { hex, locked: true, reused: true },
    ]);

    return hex;
  };

  const getCardColorSelection = (card: Card): CardColorSelection => {
    const selected = cardColorSelections[card.id];
    if (selected) return selected;

    const hex = normalizeHex(card.bg) ?? card.bg;

    return {
      cardId: card.id,
      source: colorOptions.some((item) => item.hex === hex) ? "list" : "custom",
      hex,
    };
  };

  const getCardCustomColor = (card: Card) => cardCustomColors[card.id] ?? card.bg;

  const setCardColorSelection = (selection: CardColorSelection) => {
    setCardColorSelections((current) => ({ ...current, [selection.cardId]: selection }));
  };

  const selectCardListColor = (cardId: string, hex: string) => {
    setCardColorSelection({ cardId, source: "list", hex });
    update(cardId, { bg: hex });
  };

  const selectCardCustomColor = (card: Card) => {
    const hex = normalizeHex(getCardCustomColor(card)) ?? card.bg;
    setCardCustomColors((current) => ({ ...current, [card.id]: hex }));
    setCardColorSelection({ cardId: card.id, source: "custom", hex });
    update(card.id, { bg: hex });
  };

  const changeCardPickerColor = (cardId: string, hex: string) => {
    setCardCustomColors((current) => ({ ...current, [cardId]: hex }));
    setCardColorSelection({ cardId, source: "custom", hex });
    update(cardId, { bg: hex });
  };

  const deleteSelectedCardColor = (card: Card) => {
    const selection = getCardColorSelection(card);
    const deletedHex = normalizeHex(selection.hex);
    if (!deletedHex) return;

    const fallbackHex = getPreviousColorOption(colorOptions, deletedHex);

    deleteQueuedColor(deletedHex);
    if (!fallbackHex) return;

    const fallbackSource = colorOptions.some((item) => item.hex === fallbackHex)
      ? "list"
      : "custom";

    setCardColorSelection({ cardId: card.id, source: fallbackSource, hex: fallbackHex });
    if (selection.source === "custom" || fallbackSource === "custom") {
      setCardCustomColors((current) => ({ ...current, [card.id]: fallbackHex }));
    }
    update(card.id, { bg: fallbackHex });
  };

  const toggleSelectedColorLock = (hex: string) => {
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) return;

    restoreDeletedColor(normalizedHex);
    updateColorQueue((queue) => {
      if (!queue.some((item) => item.hex === normalizedHex)) {
        return [...queue, { hex: normalizedHex, locked: true, reused: true }];
      }

      return queue.map((item) =>
        item.hex === normalizedHex ? { ...item, locked: !item.locked } : item,
      );
    });
  };

  const addSelectedColorToReuseList = (hex: string) => {
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) return;

    restoreDeletedColor(normalizedHex);
    updateColorQueue((queue) => {
      const existingItem = queue.find((item) => item.hex === normalizedHex);

      return [
        ...queue.filter((item) => item.hex !== normalizedHex),
        { hex: normalizedHex, locked: existingItem?.locked ?? false, reused: true },
      ];
    });
  };

  const deleteCard = (cardId: string) => {
    setCards(cards.filter((card) => card.id !== cardId));
    setCardColorSelections((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setCardCustomColors((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  };

  const openCardOptions = (card: Card) => {
    const hex = normalizeHex(card.bg) ?? card.bg;
    const currentSelection = cardColorSelections[card.id];
    setCardColorSelection({
      cardId: card.id,
      source:
        currentSelection?.hex === hex
          ? currentSelection.source
          : colorOptions.some((item) => item.hex === hex)
            ? "list"
            : "custom",
      hex,
    });
    setCardCustomColors((current) => ({ ...current, [card.id]: current[card.id] ?? hex }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col flex-wrap items-start gap-3 sm:flex-row sm:items-center">
        <Select
          value={group}
          onValueChange={(g) => {
            setGroup(g);
            setDevice(DEVICE_GROUPS[g][0].label);
          }}
        >
          <SelectTrigger className="w-full gap-2 sm:w-40">
            <CompactDeviceGroupPreview group={group} />
            <span className="min-w-0 flex-1 truncate text-left">{group}</span>
          </SelectTrigger>
          <SelectContent className="max-h-[360px]">
            {Object.keys(DEVICE_GROUPS).map((g) => (
              <SelectItem key={g} value={g} textValue={g} className="py-2">
                <span className="flex items-center gap-3">
                  <DeviceGroupPreview group={g} />
                  <span>{g}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={device} onValueChange={setDevice}>
          <SelectTrigger className="w-full gap-2 sm:w-64">
            <CompactDeviceSizePreview width={dev.w} height={dev.h} />
            <span className="min-w-0 flex-1 truncate text-left">{device}</span>
          </SelectTrigger>
          <SelectContent className="max-h-[360px]">
            {DEVICE_GROUPS[group].map((d) => (
              <SelectItem key={d.label} value={d.label} textValue={d.label} className="py-2">
                <span className="flex items-center gap-3">
                  <DeviceSizePreview width={d.w} height={d.h} />
                  <span>{d.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            setCards([
              ...cards,
              {
                id: crypto.randomUUID(),
                name: `预览卡片 ${String(cards.length + 1).padStart(2, "0")}`,
                bg: palette[cards.length % palette.length] ?? "#EDEDED",
                comps: [],
              },
            ])
          }
        >
          <Plus className="size-4" /> 新建预览卡片
        </Button>
        <ExportDialog
          module="preview"
          trigger={
            <Button variant="outline" className="gap-2">
              <Download className="size-4" /> 导出当前预览
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {cards.map((card) => (
          <div key={card.id} className="panel w-full max-w-[360px] p-4 sm:w-[360px]">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: simulateCB(card.bg, cbMode) }}
                />
                {card.name}
              </span>
              <Popover>
                <Tip label="卡片选项">
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openCardOptions(card)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="卡片选项"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </PopoverTrigger>
                </Tip>
                <PopoverContent align="end" className="w-80 p-3">
                  <CardColorOptions
                    items={colorOptions}
                    selection={getCardColorSelection(card)}
                    customColor={getCardCustomColor(card)}
                    onSelectListColor={(hex) => selectCardListColor(card.id, hex)}
                    onSelectCustomColor={() => selectCardCustomColor(card)}
                    onChangeCustomColor={(hex) => changeCardPickerColor(card.id, hex)}
                    onToggleLock={() => toggleSelectedColorLock(getCardColorSelection(card).hex)}
                    onDeleteColor={() => deleteSelectedCardColor(card)}
                    onAddToReuseList={() =>
                      addSelectedColorToReuseList(getCardColorSelection(card).hex)
                    }
                    onDeleteCard={() => deleteCard(card.id)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div
              className="mx-auto overflow-hidden rounded-xl border border-border"
              style={{
                width: dev.w * scale,
                height: dev.h * scale,
                backgroundColor: simulateCB(card.bg, cbMode),
              }}
            >
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
                {card.comps.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.color)}
                    className="w-full text-left"
                  >
                    {renderComp(c, cbMode)}
                  </button>
                ))}
                {card.comps.length === 0 && (
                  <p className="m-auto text-center text-xs text-muted-foreground">
                    点击下方添加组件，
                    <br />
                    预览配色效果
                  </p>
                )}
              </div>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-3 flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-4" />
                  点击添加组件
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1">
                {COMPONENTS.map((comp) => (
                  <button
                    key={comp.key}
                    type="button"
                    onClick={() =>
                      update(card.id, {
                        comps: [
                          ...card.comps,
                          {
                            id: crypto.randomUUID(),
                            type: comp.key,
                            color: palette[card.comps.length % palette.length] ?? "#111111",
                            radius: 10,
                          },
                        ],
                      })
                    }
                    className="w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
                  >
                    {comp.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {card.comps.length > 0 && (
              <div className="mt-3 space-y-2">
                {card.comps.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 truncate text-muted-foreground sm:w-20">
                      {COMPONENTS.find((x) => x.key === c.type)?.label}
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={() => selectCustomColor(c.color)}
                          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2 hover:bg-accent"
                          aria-label={`选择组件颜色 ${c.color}`}
                        >
                          <span
                            className="size-4 shrink-0 rounded-sm border border-border/70"
                            style={{ backgroundColor: simulateCB(c.color, cbMode) }}
                          />
                          <span className="truncate font-mono text-[11px]">{c.color}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 space-y-3 p-3">
                        <div>
                          <div className="mb-2 text-xs font-medium text-muted-foreground">
                            应用颜色
                          </div>
                          <ColorOptionList
                            items={colorOptions}
                            selected={customDraftSource === "list" ? customDraft : ""}
                            onSelect={(hex) => {
                              selectListedColor(hex);
                              update(card.id, {
                                comps: card.comps.map((x) =>
                                  x.id === c.id ? { ...x, color: hex } : x,
                                ),
                              });
                            }}
                            onDelete={(hex) => {
                              deleteQueuedColor(hex);
                              if (normalizeHex(customDraft) === hex) setCustomDraftSource("custom");
                            }}
                            onToggleLock={toggleQueuedColorLock}
                          />
                        </div>
                        <CustomColorQueue
                          value={customDraft}
                          onChange={(hex) => {
                            previewCustomColor(hex);
                            update(card.id, {
                              comps: card.comps.map((x) =>
                                x.id === c.id ? { ...x, color: hex } : x,
                              ),
                            });
                          }}
                          onAdd={() => {
                            const hex = addCustomColor();
                            if (!hex) return;

                            update(card.id, {
                              comps: card.comps.map((x) =>
                                x.id === c.id ? { ...x, color: hex } : x,
                              ),
                            });
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <input
                      type="range"
                      min={0}
                      max={28}
                      value={c.radius}
                      onChange={(e) =>
                        update(card.id, {
                          comps: card.comps.map((x) =>
                            x.id === c.id ? { ...x, radius: Number(e.target.value) } : x,
                          ),
                        })
                      }
                      className="w-12 shrink-0 accent-foreground sm:w-16"
                      aria-label="圆角"
                    />
                    <Tip label="删除组件">
                      <button
                        type="button"
                        onClick={() =>
                          update(card.id, { comps: card.comps.filter((x) => x.id !== c.id) })
                        }
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        aria-label="删除组件"
                      >
                        ✕
                      </button>
                    </Tip>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
