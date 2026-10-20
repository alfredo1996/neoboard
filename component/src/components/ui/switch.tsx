"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

export interface SwitchProps extends React.ComponentPropsWithoutRef<
  typeof SwitchPrimitives.Root
> {
  /**
   * Say the state in a word, "On" or "Off", beside the switch (#2218). Use it in
   * every form and settings row; leave it off where a column header already
   * names the switch. The word is `aria-hidden`: a screen reader gets the state
   * from `aria-checked`, and the word stays out of the switch's accessible name.
   */
  readonly stateLabel?: boolean;
}

/**
 * On/off toggle that applies its effect immediately, styled on the Radix Switch primitive.
 * When to use: instant-effect settings — enabling auto-refresh on a dashboard, toggling a widget's legend or click actions.
 * When not to: for choices submitted with a form use Checkbox; for picking one of several options use RadioGroup or Select.
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(
  (
    {
      className,
      stateLabel,
      checked,
      defaultChecked,
      onCheckedChange,
      ...props
    },
    ref,
  ) => {
    // The word follows `checked` when controlled, and its own copy when not.
    const [inner, setInner] = React.useState(defaultChecked ?? false);
    const isOn = checked ?? inner;

    const control = (
      <SwitchPrimitives.Root
        className={cn(
          "peer relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-[color,background-color,border-color,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
          // Hit area (#2218): 24px (WCAG 2.5.8), 44px on a coarse pointer,
          // from a pseudo-element so the layout does not move.
          "after:absolute after:-inset-x-1 after:-inset-y-[3px] after:content-[''] [@media(pointer:coarse)]:after:-inset-x-1.5 [@media(pointer:coarse)]:after:-inset-y-[13px]",
          className,
        )}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => {
          setInner(next);
          onCheckedChange?.(next);
        }}
        {...props}
        ref={ref}
      >
        <SwitchPrimitives.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-switch-thumb transition-transform [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitives.Root>
    );

    if (!stateLabel) return control;
    return (
      <span className="inline-flex shrink-0 items-center gap-2">
        {control}
        <span aria-hidden="true" className="w-6 text-xs text-muted-foreground">
          {isOn ? "On" : "Off"}
        </span>
      </span>
    );
  },
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
