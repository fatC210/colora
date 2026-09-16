import { memo } from "react";
import { Trash2 } from "lucide-react";
import { formatAll, hexToRgb, simulateCB, type CBMode } from "@/lib/color";
import type { SamplePoint } from "@/lib/image-sample";
import { useT } from "@/lib/i18n/use-t";
import { CopyButton } from "../primitives";

type RowProps = {
  point: SamplePoint;
  index: number;
  cbMode: CBMode;
  onPick: (hex: string) => void;
  onRemove: (id: string) => void;
};

/**
 * 单行点位。memo 化是必要的：`formatAll` 内部要算 lab/lch/最近 CSS 色名，是热点，
 * 拖动时每帧只应重算被拖的那一行。
 */
const PointRow = memo(
  function PointRow({ point, index, cbMode, onPick, onRemove }: RowProps) {
    const t = useT();
    const f = formatAll(point.hex);
    const rgb = hexToRgb(point.hex);
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-accent">
        <button
          type="button"
          onClick={() => onPick(point.hex)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="size-14 shrink-0 rounded-md border border-border/60"
            style={{ backgroundColor: simulateCB(point.hex, cbMode) }}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="font-mono text-sm">{point.hex}</span>
              <CopyButton value={point.hex} />
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              rgb({Math.round(rgb.r)}, {Math.round(rgb.g)}, {Math.round(rgb.b)})
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {f.hsl}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {Math.round(point.x * 100)}%, {Math.round(point.y * 100)}%
              {point.share != null ? ` · ${(point.share * 100).toFixed(1)}%` : ""}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={t("删除取色点")}
          onClick={() => onRemove(point.id)}
          className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    );
  },
  (a, b) =>
    a.point === b.point &&
    a.index === b.index &&
    a.cbMode === b.cbMode &&
    a.onPick === b.onPick &&
    a.onRemove === b.onRemove,
);

export function PointList({
  points,
  cbMode,
  onPick,
  onRemove,
}: {
  points: SamplePoint[];
  cbMode: CBMode;
  onPick: (hex: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  return (
    <section className="panel p-5">
      <h3 className="mb-4 text-sm font-medium">{t("点位列表")}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((point, index) => (
          <PointRow
            key={point.id}
            point={point}
            index={index}
            cbMode={cbMode}
            onPick={onPick}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  );
}
