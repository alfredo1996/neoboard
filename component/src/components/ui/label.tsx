import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-[13px] font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

/**
 * Accessible form label that dims when its peer control is disabled.
 * When to use: labeling any form control — connection name inputs, widget option checkboxes, radio groups.
 * When not to: a form field with a control under it — use Field, which wires the id, help and error for you.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
