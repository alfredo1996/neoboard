import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A panel is the BI card (#2247): a white surface with a visible 1 px edge, a
 * light two-layer shadow, on a grey page. Hover and focus darken the edge; the
 * fill never changes.
 */
const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-md border border-card-edge bg-card text-card-foreground shadow-card transition-colors hover:border-card-edge-hover focus-within:border-card-edge-hover motion-reduce:transition-none",
      className,
    )}
    {...props}
  />
));
Panel.displayName = "Panel";

const PanelHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
PanelHeader.displayName = "PanelHeader";

const PanelTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
PanelTitle.displayName = "PanelTitle";

const PanelDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
PanelDescription.displayName = "PanelDescription";

const PanelContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
PanelContent.displayName = "PanelContent";

const PanelFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
PanelFooter.displayName = "PanelFooter";

export {
  Panel,
  PanelHeader,
  PanelFooter,
  PanelTitle,
  PanelDescription,
  PanelContent,
};
