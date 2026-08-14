import { useEffect, useMemo, useState } from "react";
import { Download, MoreVertical, Plus } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { bestTextOn, normalizeHex, simulateCB } from "@/lib/color";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "../primitives";
import { ExportDialog } from "../ExportDialog";
import { DEVICE_GROUPS, COMPONENTS } from "./constants";
import {
  getPreviousColorOption,
  loadLockedColorQueue,
  mergeColorQueue,
  saveLockedColorQueue,
  uniqueColorQueueItems,
  uniqueHexColors,
} from "./color-queue";
import {
  CardColorOptions,
  ColorOptionList,
  CompactDeviceGroupPreview,
  CompactDeviceSizePreview,
  CustomColorQueue,
  DeviceGroupPreview,
  DeviceSizePreview,
  renderComp,
} from "./components";
import type {
  Card,
  CardColorSelection,
  ColorQueueItem,
} from "./types";

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

        <div className="flex w-full gap-3 sm:contents">
          <Button
            variant="outline"
            className="flex-1 border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/90 hover:text-primary-foreground sm:flex-none sm:border-input sm:bg-background sm:text-foreground sm:shadow-sm sm:hover:bg-accent sm:hover:text-accent-foreground"
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
              <Button variant="outline" className="flex-1 gap-2 sm:flex-none">
                <Download className="size-4" /> 导出当前预览
              </Button>
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {cards.map((card) => (
          <div key={card.id} className="panel w-full p-4 sm:w-[360px]">
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
                  <p
                    className="m-auto text-center text-xs opacity-80"
                    style={{ color: bestTextOn(simulateCB(card.bg, cbMode)) }}
                  >
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
