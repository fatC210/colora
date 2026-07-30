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
      {/* C 的上半段 */}
      <path
        d="M35 13.5A16 16 0 0 0 9 29.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* 两只眼睛 */}
      <circle cx="19" cy="19.5" r="2.4" fill="currentColor" />
      <circle cx="29.5" cy="19.5" r="2.4" fill="currentColor" />
      {/* C 的下半段，同时就是微笑，颜色不同 */}
      <path
        d="M9 29.5A16 16 0 0 0 35 34.5"
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth="4"
        strokeLinecap="round"
      />


    </svg>
  );
}
