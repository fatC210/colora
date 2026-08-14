export function ColorSlider({
  label,
  value,
  max,
  unit,
  track,
  markerColor,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  track: string;
  markerColor?: string;
  onChange: (value: number) => void;
}) {
  const pct = (value / max) * 100;
  return (
    <label className="grid grid-cols-[18px_minmax(0,1fr)_48px] items-center gap-2 text-[11px] text-neutral-500">
      <span className="font-mono">{label}:</span>
      <div className="relative h-3">
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full"
          style={{ background: track }}
        />
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
        />
        {/* 自定义手柄：色标作为其居中子元素，永远处于手柄正中心、无位移 */}
        <span
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-neutral-100 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${pct}%` }}
        >
          {markerColor && (
            <span
              className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: markerColor }}
            />
          )}
        </span>
      </div>
      <span className="flex items-baseline justify-end gap-0.5 font-mono">
        <span className="text-neutral-200">{value}</span>
        <span className="text-[9px] text-neutral-500">{unit}</span>
      </span>
    </label>
  );
}
