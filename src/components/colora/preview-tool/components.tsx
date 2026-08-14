import { Lock, Pipette, Plus, Trash2, Unlock } from "lucide-react";
import { bestTextOn, normalizeHex, simulateCB } from "@/lib/color";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ColorPicker } from "../primitives";
import type { CardColorSelection, ColorQueueItem, Comp } from "./types";

export function ColorOptionList({
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

export function CustomColorQueue({
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

export function CardColorOptions({
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

export function DeviceGroupPreview({ group }: { group: string }) {
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

export function DeviceSizePreview({ width, height }: { width: number; height: number }) {
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

export function CompactDeviceGroupPreview({ group }: { group: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
      <div className="scale-[0.65]">
        <DeviceGroupPreview group={group} />
      </div>
    </div>
  );
}

export function CompactDeviceSizePreview({ width, height }: { width: number; height: number }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
      <div className="scale-[0.65]">
        <DeviceSizePreview width={width} height={height} />
      </div>
    </div>
  );
}

export function renderComp(c: Comp, cb: Parameters<typeof simulateCB>[1]) {
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
