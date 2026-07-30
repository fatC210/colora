import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Colora 标志：一个大写 “C”，内部两只眼睛，
 * 下方的微笑与 C 的下半段笔画连成一体。
 * 眼睛和微笑使用彩色渐变，可通过 gradient 属性控制。
 */
export function Logo({
  className,
  gradient,
}: {
  className?: string;
  gradient?: [string, string];
}) {
  const gradId = useId();
  const [start, end] = gradient ?? ["currentColor", "currentColor"];

  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-7", className)}
      role="img"
      aria-label="Colora"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={start} />
          <stop offset="100%" stopColor={end} />
        </linearGradient>
      </defs>
      {/* C 的上半段 */}
      <path
        d="M35 13.5A16 16 0 0 0 9 29.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* 两只眼睛 — 在 C 内部居中，与下方微笑组成笑脸 */}
      <circle cx="20" cy="21" r="2.4" fill={`url(#${gradId})`} />
      <circle cx="28" cy="21" r="2.4" fill={`url(#${gradId})`} />
      {/* C 的下半段，同时就是微笑，使用彩色渐变 */}
      <path
        d="M9 29.5A16 16 0 0 0 35 34.5"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
