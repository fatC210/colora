import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  activeValue: string | undefined;
};

type TabsIndicatorStyle = {
  width: number;
  height: number;
  x: number;
  y: number;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function getActiveTrigger(list: HTMLElement) {
  return list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
}

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue);
  const activeValue = value ?? internalValue;

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      setInternalValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ activeValue }}>
      <TabsPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...props}
      />
    </TabsContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const listRef = React.useRef<React.ElementRef<typeof TabsPrimitive.List> | null>(null);
  const [indicatorStyle, setIndicatorStyle] = React.useState<TabsIndicatorStyle | null>(null);

  const setRefs = React.useCallback(
    (node: React.ElementRef<typeof TabsPrimitive.List> | null) => {
      listRef.current = node;

      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const updateIndicator = React.useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const activeTrigger = getActiveTrigger(list);
    if (!activeTrigger) {
      setIndicatorStyle(null);
      return;
    }

    const listRect = list.getBoundingClientRect();
    const triggerRect = activeTrigger.getBoundingClientRect();

    setIndicatorStyle({
      width: triggerRect.width,
      height: triggerRect.height,
      x: triggerRect.left - listRect.left + list.scrollLeft,
      y: triggerRect.top - listRect.top + list.scrollTop,
    });
  }, []);

  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    updateIndicator();

    const activeTrigger = getActiveTrigger(list);
    const frame = window.requestAnimationFrame(updateIndicator);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateIndicator);

    observer?.observe(list);
    if (activeTrigger) observer?.observe(activeTrigger);
    window.addEventListener("resize", updateIndicator);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [context?.activeValue, children, updateIndicator]);

  return (
    <TabsPrimitive.List
      ref={setRefs}
      className={cn(
        "relative isolate inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="colora-tabs-indicator"
        style={
          indicatorStyle
            ? {
                width: indicatorStyle.width,
                height: indicatorStyle.height,
                opacity: 1,
                transform: `translate3d(${indicatorStyle.x}px, ${indicatorStyle.y}px, 0)`,
              }
            : undefined
        }
      />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1 data-[state=active]:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
