import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Underline tabs (#2221). Centred; a row that overflows scrolls inside itself,
 * fades the edge that has more and shows a chevron button there. Arrows move
 * focus, Enter/Space select (manual activation), and the selected and focused
 * tabs scroll into view.
 */
const Tabs = ({
  activationMode = "manual",
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) => (
  <TabsPrimitive.Root activationMode={activationMode} {...props} />
);

/** Shared with callers that draw the same look without Radix (settings nav). */
export const tabTriggerClass =
  "inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-0.5 text-[13px] font-medium leading-none text-muted-foreground transition-colors [transition-duration:var(--duration-fast)] hover:text-foreground focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-ring data-[state=active]:text-foreground";

/** The row of tabs: centred, 18px apart, a hairline under. */
export const tabRowClass =
  "flex gap-[18px] border-b border-border [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto";

const FADE = 56; // px: clears the chevron button (28) plus a soft edge

interface TabsListProps extends React.ComponentPropsWithoutRef<
  typeof TabsPrimitive.List
> {
  /** Classes for the outer bar (width, margins). */
  barClassName?: string;
}

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, barClassName, style, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [more, setMore] = React.useState({ left: false, right: false });

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const measure = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    setMore((m) =>
      m.left === left && m.right === right ? m : { left, right },
    );
  }, []);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // ponytail: jsdom has no scrollIntoView; the optional call skips it there.
    const reveal = () =>
      el
        .querySelector<HTMLElement>("[data-state=active]")
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    reveal();
    measure();
    // The value can change from outside (a dashboard opening on page 12).
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.type === "attributes")) reveal();
      measure();
    });
    mo.observe(el, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, [measure]);

  const page = (dir: 1 | -1) =>
    listRef.current?.scrollBy({
      left: dir * listRef.current.clientWidth * 0.7,
      behavior: "smooth",
    });

  const chev =
    "absolute inset-y-0 z-10 grid w-7 place-items-center bg-background text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <div className={cn("relative min-w-0", barClassName)}>
      {more.left && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Scroll tabs left"
          className={cn(chev, "left-0")}
          onClick={() => page(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      )}
      <TabsPrimitive.List
        ref={setRefs}
        onFocus={(e) =>
          (e.target as HTMLElement).scrollIntoView?.({
            block: "nearest",
            inline: "nearest",
          })
        }
        onScroll={measure}
        style={
          {
            "--fl": more.left ? `${FADE}px` : "0px",
            "--fr": more.right ? `${FADE}px` : "0px",
            scrollPaddingInline: `${FADE}px`,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          tabRowClass,
          "overflow-x-auto overflow-y-hidden overscroll-x-contain px-[var(--tabs-gutter,12px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent_0,#000_var(--fl),#000_calc(100%-var(--fr)),transparent_100%)]",
          className,
        )}
        {...props}
      />
      {more.right && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Scroll tabs right"
          className={cn(chev, "right-0")}
          onClick={() => page(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabTriggerClass, className)}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
