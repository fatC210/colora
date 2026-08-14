import { normalizeHex } from "@/lib/color";
import { COLOR_QUEUE_KEY } from "./constants";
import type { ColorQueueItem } from "./types";

export function uniqueHexColors(colors: Array<string | null | undefined>) {
  const unique: string[] = [];

  colors.forEach((colorValue) => {
    if (!colorValue) return;
    const hex = normalizeHex(colorValue);
    if (hex && !unique.includes(hex)) unique.push(hex);
  });

  return unique;
}

export function uniqueColorQueueItems(items: ColorQueueItem[]) {
  const unique: ColorQueueItem[] = [];

  items.forEach((item) => {
    const hex = normalizeHex(item.hex);
    if (!hex || unique.some((existing) => existing.hex === hex)) return;
    unique.push({ hex, locked: item.locked, reused: item.reused });
  });

  return unique;
}

export function mergeColorQueue(platformColors: string[], currentQueue: ColorQueueItem[]) {
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

export function loadLockedColorQueue() {
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

export function saveLockedColorQueue(items: ColorQueueItem[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    COLOR_QUEUE_KEY,
    JSON.stringify(items.filter((item) => item.locked).map((item) => item.hex)),
  );
}

export function getPreviousColorOption(items: ColorQueueItem[], currentHex: string) {
  const normalizedHex = normalizeHex(currentHex);
  const currentIndex = items.findIndex((item) => item.hex === normalizedHex);

  if (currentIndex > 0) return items[currentIndex - 1].hex;
  if (currentIndex === 0) return items[1]?.hex ?? null;

  return items.at(-1)?.hex ?? null;
}
