import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Hastings buttons (#2216): 13px at weight 500, a 6px radius, no shadow and
  // no press-shrink on any variant. Motion is paint-only (never
  // `transition-all`) on the design-system tokens. Focus is the azure 2px ring
  // with an offset so keyboard focus is unmissable.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent text-[13px] font-medium leading-none transition-[color,background-color,border-color] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The ink fill.
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Hairline on the card colour; replaces outline and the grey fill.
        secondary:
          "border-border-strong bg-card text-foreground hover:bg-active",
        ghost: "text-foreground hover:bg-active",
        link: "text-ring underline-offset-4 hover:underline",
        // Red text on a hairline: every delete trigger that is not the
        // confirm step.
        danger:
          "border-destructive/40 bg-card text-destructive hover:bg-destructive/10",
        // The red fill, only for the confirm button of a delete or revoke
        // dialog.
        "danger-confirm":
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        lg: "h-10 px-3.5",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0",
      },
    },
    compoundVariants: [
      // A link is inline text: its own padding and height at every size.
      { variant: "link", className: "h-auto px-0.5" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonBase = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Pick<VariantProps<typeof buttonVariants>, "variant"> & {
    asChild?: boolean;
  };

/** An icon-only button has no text, so it must carry an accessible name. */
type IconButtonProps = ButtonBase & {
  size: "icon" | "icon-sm";
} & (
    | { "aria-label": string; "aria-labelledby"?: string }
    | { "aria-labelledby": string; "aria-label"?: string }
  );

type TextButtonProps = ButtonBase & {
  size?: "default" | "sm" | "lg" | null;
};

export type ButtonProps = IconButtonProps | TextButtonProps;

/**
 * The action trigger; variants: primary (default), secondary, ghost, link,
 * danger, danger-confirm; sizes: default (36px), sm (32), lg (40), icon (36
 * square), icon-sm (32 square); asChild slots.
 * When to use: any one-shot action — Run Query, Save Dashboard, Add Widget;
 * `danger` for a delete trigger (menu item, toolbar, row action).
 * `danger-confirm` is the red fill and belongs only on the confirm button of
 * a delete or revoke dialog. Icon sizes require `aria-label` or
 * `aria-labelledby` (a type error without).
 * When not to: persistent on/off state — use Toggle or Switch; pure
 * navigation styled as text — use BreadcrumbLink or variant="link" sparingly.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
