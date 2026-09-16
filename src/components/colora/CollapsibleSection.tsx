import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 可折叠分区：`grid-rows-[0fr|1fr]` 过渡 + ChevronDown 旋转 + `inert` 无障碍处理。
 *
 * 从 InfoPanel 的 `Section` 抽出 —— 同一套逻辑此前在 InfoPanel / MixerTool /
 * ContrastTool / GradientTool 里各写了一遍。
 *
 * 展开时会把自己滚进视口：面板常是固定高度的滚动容器，展开后内容若落在视口外，
 * 用户会以为点击没反应。
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon?: typeof ChevronDown;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const scrollSectionIntoView = () => {
      sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    const animationFrame = requestAnimationFrame(scrollSectionIntoView);
    const timeout = window.setTimeout(scrollSectionIntoView, 320);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [open]);

  return (
    <div ref={sectionRef} className="colora-section shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="group flex w-full items-center justify-between px-3 py-3 text-left text-sm outline-none transition-colors hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
      >
        <span className="flex items-center gap-2 font-medium">
          {Icon && (
            <Icon
              className="size-4 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
              strokeWidth={1.6}
            />
          )}
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-300 ease-out group-hover:text-foreground group-focus-visible:text-foreground",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={contentId}
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "border-t border-border px-3 py-3 text-sm transition-[opacity,transform] duration-200 ease-out",
              open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
