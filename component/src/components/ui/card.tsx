import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Card density (#825): padding contract shared by header/content/footer.
 * "default" keeps the historical p-6; "compact" (p-4) suits packed grids;
 * "tight" (p-3) is for dense KPI strips. Communicated via context so the
 * existing compositional API is unchanged.
 */
type CardDensity = "default" | "compact" | "tight";

const CardDensityContext = React.createContext<CardDensity>("default");

const DENSITY_PADDING: Record<CardDensity, string> = {
  default: "p-6",
  compact: "p-4",
  tight: "p-3",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  density?: CardDensity;
  /**
   * Hover lift for clickable cards (#833) — static display cards must NOT
   * set this. Subtle translate + deeper shadow on the standard ease.
   */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, density = "default", interactive = false, ...props }, ref) => (
    <CardDensityContext.Provider value={density}>
      <div
        ref={ref}
        className={cn(
          "rounded-lg border bg-card text-card-foreground shadow-md",
          interactive &&
            "transition-[transform,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] hover:-translate-y-px hover:shadow-lg",
          className,
        )}
        {...props}
      />
    </CardDensityContext.Provider>
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const density = React.useContext(CardDensityContext);
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col space-y-1.5",
        DENSITY_PADDING[density],
        className,
      )}
      {...props}
    />
  );
});
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const density = React.useContext(CardDensityContext);
  return (
    <div
      ref={ref}
      className={cn(DENSITY_PADDING[density], "pt-0", className)}
      {...props}
    />
  );
});
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const density = React.useContext(CardDensityContext);
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center",
        DENSITY_PADDING[density],
        "pt-0",
        className,
      )}
      {...props}
    />
  );
});
CardFooter.displayName = "CardFooter";

export interface CardKpiProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Small uppercase-ish label above the value (e.g. "Revenue"). */
  label: string;
  /** The metric itself — rendered large, left-aligned, tabular. */
  value: React.ReactNode;
  /** Optional trend: positive renders up/green, negative down/red. */
  trend?: number;
  /** Optional unit/suffix rendered after the trend (e.g. "vs last week"). */
  trendLabel?: string;
}

/**
 * Purpose-built KPI card body (#825): left-aligned, compact, tabular
 * digits — deliberately NOT the centered jumbo-number pattern. Compose it
 * inside <Card density="compact"> or use it standalone in a grid cell.
 */
const CardKpi = React.forwardRef<HTMLDivElement, CardKpiProps>(
  ({ className, label, value, trend, trendLabel, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1 p-4", className)}
      {...props}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-display text-h1 leading-none tabular-nums">
        {value}
      </span>
      {trend !== undefined && (
        <span
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs font-medium tabular-nums",
            trend >= 0 ? "text-success" : "text-destructive",
          )}
        >
          {trend >= 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {Math.abs(trend).toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}
          %
          {trendLabel ? (
            <span className="text-muted-foreground"> {trendLabel}</span>
          ) : null}
        </span>
      )}
    </div>
  ),
);
CardKpi.displayName = "CardKpi";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardKpi,
};
