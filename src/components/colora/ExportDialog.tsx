import { useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useColora } from "@/lib/colora-store";
import { hexToRgb, rgbToHsl } from "@/lib/color";
import { CopyButton } from "./primitives";
import { FileCode, FileImage, FileJson, Palette as PaletteIcon } from "lucide-react";

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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

export function ExportDialog({ trigger }: { trigger: ReactNode }) {
  const { palette, gradientStops } = useColora();
  const [open, setOpen] = useState(false);

  const formats = useMemo(() => {
    const hexes = palette;
    const rgbs = hexes.map((h) => {
      const c = hexToRgb(h);
      return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
    });
    const hsls = hexes.map((h) => {
      const c = rgbToHsl(hexToRgb(h));
      return `hsl(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%)`;
    });
    return {
      hexes,
      rgbs,
      hsls,
      css: hexes.map((h, i) => `--color-${i + 1}: ${h};`).join(" "),
      tailwind: `colors: { ${hexes.map((h, i) => `'color-${i + 1}': '${h}'`).join(", ")} }`,
      scss: hexes.map((h, i) => `$color-${i + 1}: ${h};`).join(" "),
      swift: hexes
        .map((h) => {
          const c = hexToRgb(h);
          return `UIColor(red: ${(c.r / 255).toFixed(2)}, green: ${(c.g / 255).toFixed(2)}, blue: ${(c.b / 255).toFixed(2)}, alpha: 1.0)`;
        })
        .join("\n"),
      kotlin: hexes.map((h) => `Color(0xFF${h.slice(1)})`).join("  "),
    };
  }, [palette]);

  const gradientCss = `background: linear-gradient(135deg, ${gradientStops
    .map((s) => `${s.hex} ${Math.round(s.pos)}%`)
    .join(", ")});`;

  const svgPalette = () => {
    const w = 200, h = 320;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * palette.length}" height="${h}">${palette
      .map(
        (c, i) =>
          `<rect x="${i * w}" y="0" width="${w}" height="${h - 60}" fill="${c}"/><text x="${i * w + 16}" y="${h - 24}" font-family="monospace" font-size="18">${c}</text>`,
      )
      .join("")}</svg>`;
  };

  const exportPng = () => {
    const w = 240, h = 380;
    const canvas = document.createElement("canvas");
    canvas.width = w * palette.length;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, h);
    palette.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i * w, 0, w, h - 70);
      ctx.fillStyle = "#111111";
      ctx.font = "20px monospace";
      ctx.fillText(c, i * w + 18, h - 30);
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "colora-palette.png";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const files = [
    {
      icon: FileImage,
      title: "PNG",
      desc: "导出色板为 PNG",
      onClick: exportPng,
    },
    {
      icon: FileCode,
      title: "SVG",
      desc: "导出色板为 SVG 矢量无损",
      onClick: () => download("colora-palette.svg", svgPalette(), "image/svg+xml"),
    },
    {
      icon: FileJson,
      title: "JSON",
      desc: "导出配色数据 .json",
      onClick: () =>
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
        ),
    },
    {
      icon: PaletteIcon,
      title: "ASE",
      desc: "导出为 Adobe ASE .ase",
      onClick: () =>
        download(
          "colora-palette.ase.txt",
          palette.map((h) => `${h} ${hexToRgb(h).r},${hexToRgb(h).g},${hexToRgb(h).b}`).join("\n"),
          "text/plain",
        ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>导出中心</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="code">
          <TabsList>
            <TabsTrigger value="code">代码格式</TabsTrigger>
            <TabsTrigger value="file">文件格式</TabsTrigger>
            <TabsTrigger value="gradient">渐变导出</TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="mt-4">
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border">
              <CodeRow label="HEX" value={formats.hexes.join("  ")} />
              <CodeRow label="RGB" value={formats.rgbs.join("  ")} />
              <CodeRow label="HSL" value={formats.hsls.join("  ")} />
              <CodeRow label="CSS 变量" value={formats.css} />
              <CodeRow label="Tailwind 配置" value={formats.tailwind} />
              <CodeRow label="SCSS 变量" value={formats.scss} />
              <CodeRow label="Swift (UIColor)" value={formats.swift} />
              <CodeRow label="Kotlin (Color)" value={formats.kotlin} />
            </div>
          </TabsContent>

          <TabsContent value="file" className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              {files.map((f) => (
                <button
                  key={f.title}
                  type="button"
                  onClick={f.onClick}
                  className="flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
                >
                  <f.icon className="size-5" strokeWidth={1.6} />
                  <span className="text-sm font-medium">{f.title}</span>
                  <span className="text-xs text-muted-foreground">{f.desc}</span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="gradient" className="mt-4">
            <div className="rounded-lg border border-border">
              <CodeRow label="CSS" value={gradientCss} />
              <CodeRow
                label="Tailwind"
                value={`bg-linear-to-br from-[${gradientStops[0]?.hex}] to-[${gradientStops[gradientStops.length - 1]?.hex}]`}
              />
              <CodeRow
                label="SVG"
                value={`<linearGradient id="gradient">${gradientStops
                  .map((s) => `<stop offset="${Math.round(s.pos)}%" stop-color="${s.hex}"/>`)
                  .join("")}</linearGradient>`}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
