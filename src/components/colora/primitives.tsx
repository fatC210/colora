import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hexToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from "@/lib/color";

export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard blocked */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? `复制 ${value}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done && <span>已复制</span>}
    </button>
  );
}

export function Swatch({
  hex,
  className,
  onClick,
  title,
}: {
  hex: string;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title ?? hex}
      style={{ backgroundColor: hex }}
      className={cn(
        "rounded-md border border-border/60",
        onClick && "cursor-pointer transition-transform hover:scale-[1.03]",
        className,
      )}
    />
  );
}

/** Saturation/value square + hue slider + hex input. */
export function ColorPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (hex: string) => void;
  compact?: boolean;
}) {
  const hsv = rgbToHsv(hexToRgb(value));
  const [hex, setHex] = useState(value);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => setHex(value), [value]);

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const el = areaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100;
      const v = 100 - Math.min(1, Math.max(0, (clientY - r.top) / r.height)) * 100;
      onChange(rgbToHex(hsvToRgb({ h: hsv.h, s, v })));
    },
    [hsv.h, onChange],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && pick(e.clientX, e.clientY);
    const up = () => (dragging.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [pick]);

  const hueBase = rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 }));

  return (
    <div className="space-y-3">
      <div
        ref={areaRef}
        onPointerDown={(e) => {
          dragging.current = true;
          pick(e.clientX, e.clientY);
        }}
        className={cn(
          "relative w-full cursor-crosshair rounded-lg border border-border",
          compact ? "h-32" : "h-44",
        )}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueBase})`,
        }}
      >
        <span
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: value }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(hsv.h)}
        onChange={(e) => onChange(rgbToHex(hsvToRgb({ ...hsv, h: Number(e.target.value) })))}
        aria-label="色相"
        className="h-3 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{
          background:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
      />

      <div className="flex items-center gap-2">
        <Swatch hex={value} className="size-9" />
        <input
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            const n = normalizeHex(e.target.value);
            if (n) onChange(n);
          }}
          onBlur={() => setHex(value)}
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          aria-label="HEX 色值"
        />
        <CopyButton value={value} />
      </div>
    </div>
  );
}
