import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      // Canonical variant vocabulary (Epic B #1126), shared with Button/Badge:
      // default · secondary · tonal · destructive · success · warning · outline.
      variant: {
        default: "bg-background text-foreground",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        tonal:
          "bg-[hsl(var(--ring)/0.14)] text-accent-foreground border-[hsl(var(--ring)/0.30)]",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
        success:
          "border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))] [&>svg]:text-[hsl(var(--success))]",
        warning:
          "border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))] [&>svg]:text-[hsl(var(--warning))]",
        outline: "border-input bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * Static inline callout (role="alert") with AlertTitle/AlertDescription;
 * variants: default, secondary, tonal, destructive, success, warning, outline.
 * When to use: persistent contextual messaging — e.g. a query-failed error
 * above a widget, or the lost-ENCRYPTION_KEY warning on the connections page.
 * When not to: transient feedback after an action — use Toast; blocking
 * confirmations — use AlertDialog.
 */
const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
