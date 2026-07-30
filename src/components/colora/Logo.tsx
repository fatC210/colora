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
      {/* 微笑，覆盖在 C 的笔画上，颜色不同 */}
      <path
        d="M12.5 26.5C15.5 34 24 37.5 32 31.5"
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
