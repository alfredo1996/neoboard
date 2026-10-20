"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Binary form control (Radix Checkbox) that stays inert until the enclosing
 * form is submitted; pair with Label via the `peer` class.
 * When to use: opt-in form fields and multi-select lists — e.g. "Enable click
 * action" in the widget editor, or picking columns in the field picker.
 * When not to: settings that apply immediately on toggle — use Switch;
 * mutually exclusive choices — use RadioGroup.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "group relative grid place-content-center peer h-4 w-4 shrink-0 rounded-checkbox border border-input bg-field transition-[color,background-color,border-color,box-shadow,transform] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:enabled:hover:border-input-hover data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground aria-[invalid=true]:!border-destructive",
      // Hit area (#2218): 24px (WCAG 2.5.8), 44px on a coarse pointer, from a
      // pseudo-element so the layout does not move.
      "after:absolute after:-inset-1 after:content-[''] [@media(pointer:coarse)]:after:-inset-3.5",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("grid place-content-center text-current")}
    >
      <Check className="h-3 w-3 group-data-[state=indeterminate]:hidden" />
      <Minus className="hidden h-3 w-3 group-data-[state=indeterminate]:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
