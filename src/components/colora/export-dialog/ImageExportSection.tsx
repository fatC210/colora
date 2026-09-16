import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { ImageExportState } from "@/lib/colora-store";
import { useT } from "@/lib/i18n/use-t";
import { CodeRow, SectionShell } from "./components";
import { canvasToBlob, colorSvg, imageCompositePng } from "./exporters";
import { copy, download } from "./utils";

/**
 * 图片取色的导出区块。
 *
 * 单独成组件（而不是塞进 ExportDialog 里的 `sections` 字面量）是必须的：异步导出需要
 * `useState` 管 busy 态，而 `sections` 是渲染体内的普通对象字面量，不能调用 hook。
 */
export function ImageExportSection({ state }: { state: ImageExportState }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const hexes = state.points.map((p) => p.hex);

  const exportComposite = async () => {
    if (!state.src) return;
    setBusy(true);
    try {
      const canvas = await imageCompositePng({
        src: state.src,
        imageWidth: state.width,
        imageHeight: state.height,
        colors: hexes,
      });
      if (canvas) canvasToBlob(canvas, "colora-image.png");
      else toast.error(t("导出失败"));
    } catch {
      toast.error(t("导出失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionShell title={t("图片取色")} icon={ImageIcon}>
      <div className="rounded-lg border border-border">
        <CodeRow label={t("初始点位数量")} value={String(state.count)} />
        <CodeRow label={t("图片尺寸")} value={`${state.width} × ${state.height}`} />
        <CodeRow
          label={t("取色点位")}
          value={
            state.points
              .map((p) => `${p.hex} @ ${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%`)
              .join(" | ") || t("暂无结果")
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          onClick={() =>
            // 显式挑字段：state.src 是原图 dataURL，直接 stringify 会把几 MB base64 写进 JSON
            download(
              "colora-image-colors.json",
              JSON.stringify(
                { count: state.count, points: state.points, hasImage: state.hasImage },
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
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          onClick={() => download("colora-image-colors.svg", colorSvg(hexes), "image/svg+xml")}
        >
          SVG
        </button>
        <button
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          disabled={!state.src || busy}
          onClick={exportComposite}
        >
          {busy ? t("导出中…") : t("导出合成图")}
        </button>
        <button
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          onClick={() => copy(hexes.join(", "))}
        >
          {t("复制 HEX")}
        </button>
      </div>
    </SectionShell>
  );
}
