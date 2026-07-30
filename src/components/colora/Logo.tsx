import { cn } from "@/lib/utils";

/**
 * Colora 标志：一个大写 “C”，内部两只眼睛，
 * 下方的微笑刚好覆盖在 C 的笔画上（使用不同的颜色）。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-7", className)}
      role="img"
      aria-label="Colora"
    >
      <title>Colora</title>
      {/* C 主体 */}
      <path
        d="M35 13.5A16 16 0 1 0 35 34.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* 两只眼睛 */}
      <circle cx="19" cy="19.5" r="2.4" fill="currentColor" />
      <circle cx="29.5" cy="19.5" r="2.4" fill="currentColor" />
      {/* 微笑：与 C 的左下笔画连成一体，再向右上扬起，颜色不同 */}
      <path
        d="M8.4 28.2A16 16 0 0 0 19.6 39.4C25.2 40.4 30.2 37.4 33 32.6"
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth="4"
        strokeLinecap="round"
      />

    </svg>
  );
}
