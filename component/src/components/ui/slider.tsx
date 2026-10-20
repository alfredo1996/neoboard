import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * Track-and-thumb slider that renders one thumb per value entry, so array values give a range slider automatically.
 * When to use: bounded numeric dashboard parameters — a [min, max] number-range filter, chart opacity, refresh interval.
 * When not to: when the user needs to type an exact or unbounded value, use Input type="number"; for on/off use Switch.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(
  (
    {
      className,
      // #1283: Radix puts role="slider" on the THUMB, not the Root, so a label
      // passed to the Root is silently dropped from the a11y tree. Pull it out
      // and forward it to each thumb instead.
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    // Radix renders one thumb per value entry. Render a thumb for each value so
    // range sliders (e.g. the number-range parameter's [min, max]) get both
    // knobs, not just one (#1161). Falls back to a single thumb when uncontrolled
    // with no defaultValue.
    const thumbCount = Array.isArray(props.value)
      ? props.value.length
      : Array.isArray(props.defaultValue)
        ? props.defaultValue.length
        : 1;

    // Stable ids for the per-thumb qualifier spans used with aria-labelledby.
    const qualifierBaseId = React.useId();

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
          className,
        )}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-0.5 w-full grow overflow-hidden rounded-full bg-switch-off">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }, (_, i) => {
          // A range slider needs its two knobs distinguishable. With aria-label
          // the qualifier can be appended directly. With aria-labelledby the
          // caller's id is shared by BOTH thumbs, so they would read
          // identically — append a per-thumb qualifier id instead, since
          // aria-labelledby concatenates an id list.
          const qualifier =
            thumbCount > 1 ? (i === 0 ? "minimum" : "maximum") : null;
          const qualifierId = `${qualifierBaseId}-${i}`;
          const useQualifierSpan = !ariaLabel && ariaLabelledBy && qualifier;
          return (
            <React.Fragment key={i}>
              {useQualifierSpan && (
                <span id={qualifierId} className="sr-only">
                  {qualifier}
                </span>
              )}
              <SliderPrimitive.Thumb
                aria-label={
                  ariaLabel && qualifier
                    ? `${ariaLabel} ${qualifier}`
                    : ariaLabel
                }
                aria-labelledby={
                  ariaLabel
                    ? undefined
                    : useQualifierSpan
                      ? `${ariaLabelledBy} ${qualifierId}`
                      : ariaLabelledBy
                }
                className="relative block h-4 w-4 rounded-full border-2 border-primary bg-card after:absolute after:-inset-1 after:content-[''] [@media(pointer:coarse)]:after:-inset-3.5 transition-[color,background-color,border-color,box-shadow,transform] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[disabled]:pointer-events-none"
              />
            </React.Fragment>
          );
        })}
      </SliderPrimitive.Root>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
