import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TooltipProvider } from "@/components/ui/tooltip";

const SCROLLBAR_AREA_HOVER_CLASS = "scrollbar-area-hover";

function canScrollWithOverflow(overflow: string) {
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

function getScrollbarSize(element: Element, axis: "x" | "y") {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  const size =
    axis === "y"
      ? element.offsetWidth - element.clientWidth
      : element.offsetHeight - element.clientHeight;

  return Math.max(size, 10);
}

function isPointInScrollbarArea(element: Element, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();

  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const hasVerticalScrollbar =
    canScrollWithOverflow(style.overflowY) && element.scrollHeight > element.clientHeight;
  const hasHorizontalScrollbar =
    canScrollWithOverflow(style.overflowX) && element.scrollWidth > element.clientWidth;

  if (hasVerticalScrollbar) {
    const width = getScrollbarSize(element, "y");
    const isRtl = style.direction === "rtl";
    const verticalStart = isRtl ? rect.left : rect.right - width;
    const verticalEnd = isRtl ? rect.left + width : rect.right;

    if (clientX >= verticalStart && clientX <= verticalEnd) {
      return true;
    }
  }

  if (hasHorizontalScrollbar) {
    const height = getScrollbarSize(element, "x");

    if (clientY >= rect.bottom - height && clientY <= rect.bottom) {
      return true;
    }
  }

  return false;
}

function getScrollbarHoverCandidates(clientX: number, clientY: number) {
  const candidates = new Set<Element>();

  for (const element of document.elementsFromPoint(clientX, clientY)) {
    let current: Element | null = element;

    while (current) {
      candidates.add(current);
      current = current.parentElement;
    }
  }

  if (document.scrollingElement) {
    candidates.add(document.scrollingElement);
  }

  return candidates;
}

function ScrollbarHoverController() {
  useEffect(() => {
    let hoveredElement: Element | null = null;

    const clearHover = () => {
      hoveredElement?.classList.remove(SCROLLBAR_AREA_HOVER_CLASS);
      hoveredElement = null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const nextHoveredElement = Array.from(
        getScrollbarHoverCandidates(event.clientX, event.clientY),
      ).find((element) => isPointInScrollbarArea(element, event.clientX, event.clientY));

      if (nextHoveredElement === hoveredElement) {
        return;
      }

      clearHover();
      nextHoveredElement?.classList.add(SCROLLBAR_AREA_HOVER_CLASS);
      hoveredElement = nextHoveredElement ?? null;
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", clearHover);
    window.addEventListener("blur", clearHover);

    return () => {
      clearHover();
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", clearHover);
      window.removeEventListener("blur", clearHover);
    };
  }, []);

  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Colora" },
      { name: "description", content: "配色方案、渐变、混色、取色、对比度与实时预览。" },
      { property: "og:title", content: "Colora — 色彩搭配平台" },
      { property: "og:description", content: "调配、混合、预览、导出，一站式完成配色工作。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ScrollbarHoverController />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
