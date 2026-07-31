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
import {
  bestTextOn,
  contrastRatio,
  formatAll,
  hexToRgb,
  rgbToHsl,
  simulateCB,
  type CBMode,
} from "@/lib/color";
import { CopyButton } from "./primitives";

type ExportModule =
  "all" | "color" | "palette" | "gradient" | "image" | "mixer" | "contrast" | "preview" | "saved";

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function copy(value: string) {
  void navigator.clipboard?.writeText(value);
}

function toRgbString(hex: string) {
  const color = hexToRgb(hex);
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

function toHslString(hex: string) {
  const color = rgbToHsl(hexToRgb(hex));
  return `hsl(${Math.round(color.h)}, ${Math.round(color.s)}%, ${Math.round(color.l)}%)`;
}

function colorRows(hex: string) {
  const all = formatAll(hex);
  return [
    ["HEX", all.hex],
    ["RGB", all.rgb],
    ["HSL", all.hsl],
    ["HSV", all.hsv],
    ["CMYK", all.cmyk],
    ["Lab", all.lab],
    ["LCH", all.lch],
    ["最近 CSS 色", `${all.name} (${all.nameHex})`],
    ["对比黑", all.onBlack.toFixed(2)],
    ["对比白", all.onWhite.toFixed(2)],
  ] as const;
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="w-28 shrink-0 text-sm font-medium">{label}</span>
      <span className="flex-1 break-all font-mono text-xs text-muted-foreground">{value}</span>
      <CopyButton value={value} />
    </div>
  );
}

function SectionShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileJson;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.6} />
        {title}
      </div>
      {children}
    </section>
  );
}

function colorSvg(colors: string[], width = 180, height = 180) {
  const sliceWidth = Math.max(1, Math.floor(width / Math.max(colors.length, 1)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${colors
    .map(
      (color, index) =>
        `<rect x="${index * sliceWidth}" y="0" width="${sliceWidth}" height="${height}" fill="${color}" />`,
    )
    .join("")}</svg>`;
}

function colorPng(colors: string[], labels: string[] = []) {
  const canvas = document.createElement("canvas");
  const width = 240 * Math.max(colors.length, 1);
  const height = 320;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  colors.forEach((color, index) => {
    const x = index * 240;
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, 240, height - 70);
    ctx.fillStyle = bestTextOn(color);
    ctx.font = "20px monospace";
    ctx.fillText(labels[index] ?? color, x + 18, height - 28);
  });
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  });
}

function gradientCss(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  const stopList = stops
    .map((stop) => `${simulateCB(stop.hex, "none" as CBMode)} ${Math.round(stop.pos)}%`)
    .join(", ");
  if (config.type === "radial")
    return `background: radial-gradient(circle at ${config.center.x}% ${config.center.y}%, ${stopList});`;
  if (config.type === "conic")
    return `background: conic-gradient(from ${config.angle}deg at ${config.center.x}% ${config.center.y}%, ${stopList});`;
  return `background: linear-gradient(${config.angle}deg, ${stopList});`;
}

function gradientSvg(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  if (config.type === "radial") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><radialGradient id="gradient" cx="${config.center.x}%" cy="${config.center.y}%">${stops
      .map((stop) => `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.hex}" />`)
      .join(
        "",
      )}</radialGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><linearGradient id="gradient" gradientTransform="rotate(${config.angle})">${stops
    .map((stop) => `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.hex}" />`)
    .join(
      "",
    )}</linearGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
}

function gradientPng(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (config.type === "radial") {
    const gradient = ctx.createRadialGradient(
      config.center.x * 10,
      config.center.y * 10,
      10,
      500,
      500,
      700,
    );
    stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);
    return canvas;
  }

  if (config.type === "conic" && "createConicGradient" in ctx) {
    const gradient = (
      ctx as CanvasRenderingContext2D & { createConicGradient: typeof ctx.createConicGradient }
    ).createConicGradient(
      (config.angle * Math.PI) / 180,
      config.center.x * 10,
      config.center.y * 10,
    );
    stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);
    return canvas;
  }

  const gradient = ctx.createLinearGradient(0, 0, 1000, 0);
  stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
  ctx.fillStyle = gradient;
  ctx.save();
  ctx.translate(500, 500);
  ctx.rotate((config.angle * Math.PI) / 180);
  ctx.translate(-500, -500);
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
  return canvas;
}

function markdownTable(rows: readonly (readonly [string, string])[]) {
  return [
    `| 项目 | 值 |`,
    `| --- | --- |`,
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}

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
  const chosen = module === "all" ? order : [module];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-4 sm:p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => contentRef.current?.focus());
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{module === "all" ? "导出中心" : "导出当前模块"}</DialogTitle>
        </DialogHeader>

        <div ref={contentRef} tabIndex={-1} className="min-h-0 overflow-y-auto pr-1 outline-none">
          {module === "all" ? (
            <Tabs defaultValue={order[0]} className="min-h-0 space-y-4">
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-w-max justify-start">
                  <TabsTrigger value="color">当前颜色</TabsTrigger>
                  <TabsTrigger value="palette">配色方案</TabsTrigger>
                  <TabsTrigger value="gradient">渐变</TabsTrigger>
                  <TabsTrigger value="image">图片取色</TabsTrigger>
                  <TabsTrigger value="mixer">颜色混合</TabsTrigger>
                  <TabsTrigger value="contrast">对比度</TabsTrigger>
                  <TabsTrigger value="preview">实时预览</TabsTrigger>
                  <TabsTrigger value="saved">收藏色板</TabsTrigger>
                </TabsList>
              </div>
              {order.map((item) => (
                <TabsContent key={item} value={item} className="mt-0">
                  {sections[item]}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="space-y-4">{chosen.map((item) => sections[item])}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
