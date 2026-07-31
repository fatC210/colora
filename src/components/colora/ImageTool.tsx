import { useEffect, useRef, useState } from "react";
import { ImagePlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColora } from "@/lib/colora-store";
import { formatAll, hexToRgb, kmeans, simulateCB } from "@/lib/color";
import { CopyButton } from "./primitives";
import { ExportDialog } from "./ExportDialog";

export function ImageTool() {
  const { setColor, setPalette, cbMode, setImageExport } = useColora();
  const [src, setSrc] = useState<string | null>(null);
  const [count, setCount] = useState(6);
  const [colors, setColors] = useState<{ hex: string; share: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImageExport({ count, colors, hasImage: Boolean(src) });
  }, [count, colors, setImageExport, src]);

  const extract = (url: string, k: number) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 160 / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }
      setColors(kmeans(pixels, k));
    };
    img.src = url;
  };

  const onFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setSrc(url);
      extract(url, count);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <section
        className="panel p-5"
        onPaste={(e) => onFile(e.clipboardData.files?.[0])}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
      >
        {src ? (
          <img
            src={src}
            alt="用于取色的图片"
            className="mx-auto max-h-[360px] w-auto rounded-lg border border-border object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-[280px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <ImagePlus className="size-7" strokeWidth={1.4} />
            <span className="text-sm">拖拽上传 / 点击上传 / 粘贴图片</span>
            <span className="text-xs">支持 PNG、JPG、WEBP、SVG</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            {src ? "更换图片" : "选择图片"}
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">提取数量 {count}</span>
            <input
              type="range"
              min={3}
              max={20}
              value={count}
              onChange={(e) => {
                const k = Number(e.target.value);
                setCount(k);
                if (src) extract(src, k);
              }}
              className="w-40 accent-foreground"
            />
          </div>
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-2"
                onClick={() => setPalette(colors.slice(0, 10).map((c) => c.hex))}
              >
                <Save className="size-4" /> 保存为配色方案
              </Button>
              <ExportDialog
                module="image"
                trigger={
                  <Button variant="outline" className="gap-2">
                    <ImagePlus className="size-4" /> 导出当前图片
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </section>

      {colors.length > 0 && (
        <section className="panel p-5">
          <h3 className="mb-4 text-sm font-medium">提取结果</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colors.map((c) => {
              const f = formatAll(c.hex);
              const rgb = hexToRgb(c.hex);
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className="size-14 shrink-0 rounded-md border border-border/60"
                    style={{ backgroundColor: simulateCB(c.hex, cbMode) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-sm">{c.hex}</span>
                      <CopyButton value={c.hex} />
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      rgb({Math.round(rgb.r)}, {Math.round(rgb.g)}, {Math.round(rgb.b)})
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {f.hsl}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs">{(c.share * 100).toFixed(1)}%</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
