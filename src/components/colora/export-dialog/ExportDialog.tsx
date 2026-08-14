import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ClipboardCopy,
  FileCode,
  FileImage,
  FileJson,
  Palette as PaletteIcon,
  Image as ImageIcon,
  Blend,
  Contrast,
  Monitor,
  SwatchBook,
  LayoutGrid,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useColora } from "@/lib/colora-store";
import { formatAll, hexToRgb, rgbToHsl } from "@/lib/color";
import { CodeRow, SectionShell } from "./components";
import {
  canvasToBlob,
  colorPng,
  colorSvg,
  gradientCss,
  gradientPng,
  gradientSvg,
} from "./exporters";
import { colorRows, copy, download, markdownTable, toHslString, toRgbString } from "./utils";

type ExportModule =
  "all" | "color" | "palette" | "gradient" | "image" | "mixer" | "contrast" | "preview" | "saved";

export function ExportDialog({
  trigger,
  module = "all",
}: {
  trigger: ReactNode;
  module?: ExportModule;
}) {
  const {
    color,
    palette,
    saved,
    gradientStops,
    gradientConfig,
    imageExport,
    mixerExport,
    contrastExport,
    previewExport,
  } = useColora();
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const colorInfo = useMemo(() => colorRows(color), [color]);
  const paletteFormats = useMemo(() => {
    const hexes = palette;
    return {
      hexes,
      rgbs: hexes.map(toRgbString),
      hsls: hexes.map(toHslString),
      css: hexes.map((hex, index) => `--color-${index + 1}: ${hex};`).join(" "),
      tailwind: `colors: { ${hexes.map((hex, index) => `'color-${index + 1}': '${hex}'`).join(", ")} }`,
      scss: hexes.map((hex, index) => `$color-${index + 1}: ${hex};`).join(" "),
      swift: hexes
        .map((hex) => {
          const rgb = hexToRgb(hex);
          return `UIColor(red: ${(rgb.r / 255).toFixed(2)}, green: ${(rgb.g / 255).toFixed(2)}, blue: ${(rgb.b / 255).toFixed(2)}, alpha: 1.0)`;
        })
        .join("\n"),
      kotlin: hexes.map((hex) => `Color(0xFF${hex.slice(1)})`).join("  "),
    };
  }, [palette]);

  const gradientText = useMemo(
    () => gradientCss(gradientConfig, gradientStops),
    [gradientConfig, gradientStops],
  );

  const sections = {
    color: (
      <SectionShell title="当前颜色" icon={ClipboardCopy}>
        <div className="rounded-lg border border-border">
          {colorInfo.map(([label, value]) => (
            <CodeRow key={label} label={label} value={value} />
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-color.json",
                JSON.stringify({ color, ...formatAll(color) }, null, 2),
                "application/json",
              )
            }
          >
            下载 JSON
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download("colora-color.css", `:root { ${paletteFormats.css} }`, "text/css")
            }
          >
            下载 CSS
          </button>
        </div>
      </SectionShell>
    ),
    palette: (
      <SectionShell title="配色方案" icon={SwatchBook}>
        <div className="rounded-lg border border-border">
          <CodeRow label="HEX" value={paletteFormats.hexes.join("  ")} />
          <CodeRow label="RGB" value={paletteFormats.rgbs.join("  ")} />
          <CodeRow label="HSL" value={paletteFormats.hsls.join("  ")} />
          <CodeRow label="CSS 变量" value={paletteFormats.css} />
          <CodeRow label="Tailwind" value={paletteFormats.tailwind} />
          <CodeRow label="SCSS" value={paletteFormats.scss} />
          <CodeRow label="Swift" value={paletteFormats.swift} />
          <CodeRow label="Kotlin" value={paletteFormats.kotlin} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-palette.json",
                JSON.stringify(
                  {
                    colors: palette.map((hex) => ({
                      hex,
                      rgb: hexToRgb(hex),
                      hsl: rgbToHsl(hexToRgb(hex)),
                    })),
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            JSON
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => download("colora-palette.svg", colorSvg(palette), "image/svg+xml")}
          >
            SVG
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => {
              const canvas = colorPng(palette);
              if (canvas) canvasToBlob(canvas, "colora-palette.png");
            }}
          >
            PNG
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-palette.ase.txt",
                palette
                  .map((hex) => `${hex} ${hexToRgb(hex).r},${hexToRgb(hex).g},${hexToRgb(hex).b}`)
                  .join("\n"),
                "text/plain",
              )
            }
          >
            ASE 文本
          </button>
        </div>
      </SectionShell>
    ),
    gradient: (
      <SectionShell title="渐变" icon={LayoutGrid}>
        <div className="rounded-lg border border-border">
          <CodeRow label="CSS" value={gradientText} />
          <CodeRow label="SVG" value={gradientSvg(gradientConfig, gradientStops)} />
          <CodeRow
            label="Stops"
            value={gradientStops.map((stop) => `${stop.hex} ${Math.round(stop.pos)}%`).join(" | ")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => download("colora-gradient.css", gradientText, "text/css")}
          >
            CSS
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-gradient.svg",
                gradientSvg(gradientConfig, gradientStops),
                "image/svg+xml",
              )
            }
          >
            SVG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => {
              const canvas = gradientPng(gradientConfig, gradientStops);
              if (canvas) canvasToBlob(canvas, "colora-gradient.png");
            }}
          >
            PNG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-gradient.json",
                JSON.stringify({ config: gradientConfig, stops: gradientStops }, null, 2),
                "application/json",
              )
            }
          >
            JSON
          </button>
        </div>
      </SectionShell>
    ),
    image: (
      <SectionShell title="图片取色" icon={ImageIcon}>
        <div className="rounded-lg border border-border">
          <CodeRow label="提取数量" value={String(imageExport.count)} />
          <CodeRow
            label="提取颜色"
            value={
              imageExport.colors
                .map((item) => `${item.hex} ${item.share.toFixed(1)}%`)
                .join(" | ") || "暂无结果"
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-image-colors.json",
                JSON.stringify(imageExport, null, 2),
                "application/json",
              )
            }
          >
            JSON
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-image-colors.svg",
                colorSvg(imageExport.colors.map((item) => item.hex)),
                "image/svg+xml",
              )
            }
          >
            SVG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => {
              const canvas = colorPng(
                imageExport.colors.map((item) => item.hex),
                imageExport.colors.map((item) => item.hex),
              );
              if (canvas) canvasToBlob(canvas, "colora-image-colors.png");
            }}
          >
            PNG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => copy(imageExport.colors.map((item) => item.hex).join(", "))}
          >
            复制 HEX
          </button>
        </div>
      </SectionShell>
    ),
    mixer: (
      <SectionShell title="颜色混合" icon={Blend}>
        <div className="rounded-lg border border-border">
          <CodeRow label="模式" value={mixerExport.mode} />
          <CodeRow
            label="输入色"
            value={mixerExport.items.map((item) => `${item.hex} ${item.weight}%`).join(" | ")}
          />
          <CodeRow label="结果" value={mixerExport.result} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download("colora-mix.json", JSON.stringify(mixerExport, null, 2), "application/json")
            }
          >
            JSON
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download("colora-mix.svg", colorSvg([mixerExport.result]), "image/svg+xml")
            }
          >
            SVG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => {
              const canvas = colorPng([mixerExport.result], [mixerExport.result]);
              if (canvas) canvasToBlob(canvas, "colora-mix.png");
            }}
          >
            PNG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => copy(mixerExport.result)}
          >
            复制结果
          </button>
        </div>
      </SectionShell>
    ),
    contrast: (
      <SectionShell title="对比度检查" icon={Contrast}>
        <div className="rounded-lg border border-border">
          <CodeRow label="前景" value={contrastExport.fg} />
          <CodeRow label="背景" value={contrastExport.bg} />
          <CodeRow label="对比度" value={`${contrastExport.ratio.toFixed(2)} : 1`} />
          <CodeRow label="建议色" value={contrastExport.suggestions.join(" | ") || "暂无"} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-contrast.json",
                JSON.stringify(contrastExport, null, 2),
                "application/json",
              )
            }
          >
            JSON
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-contrast.md",
                markdownTable([
                  ["前景", contrastExport.fg],
                  ["背景", contrastExport.bg],
                  ["对比度", `${contrastExport.ratio.toFixed(2)} : 1`],
                  ["建议色", contrastExport.suggestions.join(", ") || "暂无"],
                ]),
                "text/markdown",
              )
            }
          >
            Markdown
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              copy(
                `FG ${contrastExport.fg} / BG ${contrastExport.bg} / ${contrastExport.ratio.toFixed(2)}:1`,
              )
            }
          >
            复制摘要
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-contrast.svg",
                colorSvg([contrastExport.fg, contrastExport.bg]),
                "image/svg+xml",
              )
            }
          >
            SVG
          </button>
        </div>
      </SectionShell>
    ),
    preview: (
      <SectionShell title="实时预览" icon={Monitor}>
        <div className="rounded-lg border border-border">
          <CodeRow label="设备组" value={previewExport.group} />
          <CodeRow label="设备" value={previewExport.device} />
          <CodeRow label="配色来源" value={previewExport.colors.join(" | ")} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-preview.json",
                JSON.stringify(previewExport, null, 2),
                "application/json",
              )
            }
          >
            JSON
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-preview.css",
                previewExport.colors
                  .map((hex, index) => `--preview-${index + 1}: ${hex};`)
                  .join(" "),
                "text/css",
              )
            }
          >
            CSS 变量
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download("colora-preview.svg", colorSvg(previewExport.colors), "image/svg+xml")
            }
          >
            SVG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => copy(JSON.stringify(previewExport))}
          >
            复制 JSON
          </button>
        </div>
      </SectionShell>
    ),
    saved: (
      <SectionShell title="收藏色板" icon={PaletteIcon}>
        <div className="rounded-lg border border-border">
          <CodeRow label="数量" value={String(saved.length)} />
          <CodeRow label="名称" value={saved.map((item) => item.name).join(" | ") || "暂无"} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-saved-palettes.json",
                JSON.stringify(saved, null, 2),
                "application/json",
              )
            }
          >
            JSON
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() =>
              download(
                "colora-saved-palettes.svg",
                colorSvg(saved.flatMap((item) => item.colors)),
                "image/svg+xml",
              )
            }
          >
            SVG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => {
              const colors = saved.flatMap((item) => item.colors);
              const canvas = colorPng(colors, colors);
              if (canvas) canvasToBlob(canvas, "colora-saved-palettes.png");
            }}
          >
            PNG
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => copy(JSON.stringify(saved))}
          >
            复制 JSON
          </button>
        </div>
      </SectionShell>
    ),
  } as const;

  const order: ExportModule[] = [
    "color",
    "palette",
    "gradient",
    "image",
    "mixer",
    "contrast",
    "preview",
    "saved",
  ];
  const tabMeta: Record<ExportModule, { icon: typeof FileJson; label: string }> = {
    color: { icon: ClipboardCopy, label: "当前颜色" },
    palette: { icon: SwatchBook, label: "配色方案" },
    gradient: { icon: LayoutGrid, label: "渐变" },
    image: { icon: ImageIcon, label: "图片取色" },
    mixer: { icon: Blend, label: "颜色混合" },
    contrast: { icon: Contrast, label: "对比度" },
    preview: { icon: Monitor, label: "实时预览" },
    saved: { icon: PaletteIcon, label: "收藏色板" },
  };
  const chosen = module === "all" ? order : [module];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex h-[80dvh] w-[960px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-4 sm:p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => contentRef.current?.focus());
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{module === "all" ? "导出中心" : "导出当前模块"}</DialogTitle>
        </DialogHeader>

        {module === "all" ? (
          <Tabs defaultValue={order[0]} className="flex min-h-0 flex-1 flex-col">
            <div className="-mx-4 shrink-0 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6">
              <TabsList className="colora-export-tabs min-w-max justify-start">
                {order.map((key) => {
                  const Icon = tabMeta[key].icon;
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      aria-label={tabMeta[key].label}
                      className="colora-export-tab gap-1.5"
                    >
                      <Icon className="size-4 colora-export-tab-icon" strokeWidth={1.6} />
                      <span className="colora-export-tab-text">{tabMeta[key].label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
            <div
              ref={contentRef}
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-y-auto pt-4 pr-1 outline-none"
            >
              {order.map((item) => (
                <TabsContent key={item} value={item} className="mt-0">
                  {sections[item]}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        ) : (
          <div
            ref={contentRef}
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
          >
            <div className="space-y-4">{chosen.map((item) => sections[item])}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
