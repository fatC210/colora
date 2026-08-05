import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { hexToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv } from "@/lib/color";

/** 把多个同名事件处理器合并为一个，依次调用（用于 cloneElement 时不覆盖原 handler）。 */
function composeEventHandlers<E>(...handlers: (((e: E) => void) | undefined)[]): (e: E) => void {
  return (e) => {
    for (const h of handlers) {
      if (h) h(e);
    }
  };
}

const LONG_PRESS_MS = 450;

/**
 * 把任意单个元素包一层主题自适应的 tooltip。asChild 透传，不引入额外 DOM。
 * 桌面端：hover/focus 显示（Radix 原生行为，通过受控 open 同步）。
 * 移动端：长按约 450ms 显示，松手/离开隐藏；长按触发后吞掉随之而来的 click 与原生右键菜单。
 */
export function Tip({
  label,
  side = "top",
  children,
}: {
  label: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const longPressedRef = useRef(false);
  const touchHoldingRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  let trigger = children;
  if (isValidElement(children)) {
    const props = children.props as {
      title?: string;
      onPointerDown?: (e: ReactPointerEvent) => void;
      onPointerUp?: (e: ReactPointerEvent) => void;
      onPointerEnter?: (e: ReactPointerEvent) => void;
      onPointerLeave?: (e: ReactPointerEvent) => void;
      onPointerCancel?: (e: ReactPointerEvent) => void;
      onContextMenu?: (e: ReactMouseEvent) => void;
      onClickCapture?: (e: ReactMouseEvent) => void;
    };

    trigger = cloneElement(children, {
      title: undefined,
      onPointerDown: composeEventHandlers<ReactPointerEvent>(props.onPointerDown, (e) => {
        if (e.pointerType !== "touch") return;
        longPressedRef.current = false;
        touchHoldingRef.current = true;
        clearLongPress();
        timerRef.current = window.setTimeout(() => {
          longPressedRef.current = true;
          setOpen(true);
        }, LONG_PRESS_MS);
      }),
      onPointerUp: composeEventHandlers<ReactPointerEvent>(props.onPointerUp, (e) => {
        if (e.pointerType !== "touch") return;
        touchHoldingRef.current = false;
        clearLongPress();
        setOpen(false);
      }),
      onPointerLeave: composeEventHandlers<ReactPointerEvent>(props.onPointerLeave, (e) => {
        if (e.pointerType !== "touch") return;
        touchHoldingRef.current = false;
        clearLongPress();
        setOpen(false);
      }),
      onPointerCancel: composeEventHandlers<ReactPointerEvent>(props.onPointerCancel, () => {
        touchHoldingRef.current = false;
        clearLongPress();
        setOpen(false);
      }),
      onContextMenu: composeEventHandlers<ReactMouseEvent>(props.onContextMenu, (e) => {
        // 长按期间抑制移动端原生右键/选择菜单
        if (touchHoldingRef.current) e.preventDefault();
      }),
      onClickCapture: composeEventHandlers<ReactMouseEvent>(props.onClickCapture, (e) => {
        // 长按刚触发后，吞掉随之而来的 click，避免误激活按钮
        if (longPressedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressedRef.current = false;
        }
      }),
    });
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={300}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

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
    <Tip label="复制">
      <button
        type="button"
        onClick={copy}
        aria-label={label ?? `复制 ${value}`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        {done ? (
          <Check className="size-3.5 animate-pop text-green-500" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </Tip>
  );
}

export function CopyText({
  value,
  className,
  label,
  children,
}: {
  value: string;
  className?: string;
  label?: string;
  children?: ReactNode;
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
        "inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="truncate">{children ?? value}</span>
      {done ? (
        <Check className="size-3.5 shrink-0 animate-pop text-green-500" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

export function InlineRename({
  value,
  editing,
  onEditingChange,
  onSave,
  className,
  textClassName,
  inputClassName,
  ariaLabel,
}: {
  value: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (value: string) => void;
  className?: string;
  textClassName?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    onEditingChange(false);
    setDraft(value);
    if (next && next !== value) onSave(next);
  };

  const cancel = () => {
    setDraft(value);
    onEditingChange(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        aria-label={ariaLabel ?? "重命名"}
        className={cn(
          "h-6 min-w-0 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring",
          className,
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => onEditingChange(true)}
      aria-label={ariaLabel ?? `重命名 ${value}`}
      className={cn(
        "min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className={cn("block truncate", textClassName)}>{value}</span>
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
  const label = title ?? hex;
  if (!onClick) {
    return (
      <div
        title={label}
        style={{ backgroundColor: hex }}
        className={cn("rounded-md border border-border/60", className)}
      />
    );
  }
  return (
    <Tip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        style={{ backgroundColor: hex }}
        className={cn(
          "rounded-md border border-border/60 cursor-pointer transition-transform hover:scale-[1.03]",
          className,
        )}
      />
    </Tip>
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
          compact ? "h-28 sm:h-32" : "h-36 sm:h-44",
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

      <div className="flex min-w-0 items-center gap-2">
        <Swatch hex={value} className="size-9" />
        <input
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            const n = normalizeHex(e.target.value);
            if (n) onChange(n);
          }}
          onBlur={() => setHex(value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          aria-label="HEX 色值"
        />
        <CopyButton value={value} className="self-stretch px-2" />
      </div>
    </div>
  );
}
