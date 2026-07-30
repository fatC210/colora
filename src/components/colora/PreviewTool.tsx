import { useState } from "react";
import { MoreVertical, Plus, Smartphone } from "lucide-react";
import { useColora } from "@/lib/colora-store";
import { bestTextOn, simulateCB } from "@/lib/color";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DEVICE_GROUPS: Record<string, { label: string; w: number; h: number }[]> = {
  手机: [
    { label: "iPhone 16 (393×852)", w: 393, h: 852 },
    { label: "iPhone SE (375×667)", w: 375, h: 667 },
  ],
  平板: [
    { label: "iPad (820×1180)", w: 820, h: 1180 },
    { label: "iPad Mini (744×1133)", w: 744, h: 1133 },
  ],
  桌面: [
    { label: "1440×900", w: 1440, h: 900 },
    { label: "1920×1080", w: 1920, h: 1080 },
  ],
  演示文稿: [
    { label: "16:9 (1920×1080)", w: 1920, h: 1080 },
    { label: "4:3 (1024×768)", w: 1024, h: 768 },
  ],
  手表: [
    { label: "Apple Watch 46mm (208×248)", w: 208, h: 248 },
    { label: "Apple Watch 40mm (162×197)", w: 162, h: 197 },
  ],
  纸张: [
    { label: "A4 (595×842)", w: 595, h: 842 },
    { label: "A5 (420×595)", w: 420, h: 595 },
    { label: "Letter (612×792)", w: 612, h: 792 },
  ],
  社交媒体: [
    { label: "Instagram 帖子 (1080×1080)", w: 1080, h: 1080 },
    { label: "Instagram 故事 (1080×1920)", w: 1080, h: 1920 },
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

function renderComp(c: Comp, cb: Parameters<typeof simulateCB>[1]) {
  const color = simulateCB(c.color, cb);
  switch (c.type) {
    case "card":
      return <div className="h-20 w-full" style={{ backgroundColor: color, borderRadius: c.radius }} />;
    case "heading":
      return <p className="text-lg font-semibold" style={{ color }}>探索色彩的无限可能</p>;
    case "text":
      return <p className="text-xs leading-relaxed" style={{ color }}>科学的配色方案，让设计更出彩。</p>;
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
  const { palette, cbMode, setColor } = useColora();
  const [group, setGroup] = useState("手机");
  const [device, setDevice] = useState(DEVICE_GROUPS["手机"][0].label);
  const [cards, setCards] = useState<Card[]>([
    { id: "1", name: "预览卡片 01", bg: palette[4] ?? "#EDEDED", comps: [] },
  ]);

  const dev =
    DEVICE_GROUPS[group].find((d) => d.label === device) ?? DEVICE_GROUPS[group][0];
  const scale = Math.min(1, 320 / dev.w, 560 / dev.h);

  const update = (id: string, patch: Partial<Card>) =>
    setCards(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={group}
          onValueChange={(g) => {
            setGroup(g);
            setDevice(DEVICE_GROUPS[g][0].label);
          }}
        >
          <SelectTrigger className="w-40">
            <Smartphone className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(DEVICE_GROUPS).map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={device} onValueChange={setDevice}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICE_GROUPS[group].map((d) => (
              <SelectItem key={d.label} value={d.label}>
                {d.label}
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
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {cards.map((card) => (
          <div key={card.id} className="panel w-[360px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: simulateCB(card.bg, cbMode) }}
                />
                {card.name}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {palette.map((p) => (
                    <DropdownMenuItem key={p} onClick={() => update(card.id, { bg: p })}>
                      <span className="size-3.5 rounded" style={{ backgroundColor: p }} />
                      背景设为 {p}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => setCards(cards.filter((c) => c.id !== card.id))}>
                    删除卡片
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                    <span className="w-20 shrink-0 truncate text-muted-foreground">
                      {COMPONENTS.find((x) => x.key === c.type)?.label}
                    </span>
                    <div className="flex gap-1">
                      {palette.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() =>
                            update(card.id, {
                              comps: card.comps.map((x) => (x.id === c.id ? { ...x, color: p } : x)),
                            })
                          }
                          className="size-4 rounded border border-border/60"
                          style={{ backgroundColor: p }}
                          aria-label={`应用 ${p}`}
                        />
                      ))}
                    </div>
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
                      className="w-16 accent-foreground"
                      aria-label="圆角"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        update(card.id, { comps: card.comps.filter((x) => x.id !== c.id) })
                      }
                      className="ml-auto text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
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
