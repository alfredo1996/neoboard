/**
 * Shared form-control size scale (Epic C #1127, #2217) — one map so Input,
 * SelectTrigger, and Textarea can't drift, and so fields line up with
 * buttons: sm 32, default 36, lg 40 (button.tsx).
 */
export const controlSizes = {
  sm: "h-8 px-2.5",
  default: "h-9 px-2.5",
  lg: "h-10 px-3",
} as const;

/** Textarea variant of the same scale — min-height instead of fixed height. */
export const textareaSizes = {
  sm: "min-h-[56px] px-2.5",
  default: "min-h-[72px] px-2.5",
  lg: "min-h-[88px] px-3",
} as const;

export type ControlSize = keyof typeof controlSizes;

/**
 * What every text-like field shares (#2217): flat, 6px radius, the 3:1
 * `--input` border that moves to `--input-hover` on hover (never to the
 * lighter `--border-strong`), an azure ring with a 1px offset, a 50% grey
 * disabled state (a `hover:` variant on error and focus keeps them ahead of the
 * hover border: a plain `:enabled:hover` out-ranked both), 14px text and 16px under a coarse pointer so iPadOS does
 * not zoom on focus.
 */
export const fieldBaseClasses =
  "w-full rounded-sm border border-input bg-field text-sm [@media(pointer:coarse)]:text-base transition-[color,background-color,border-color] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] placeholder:text-muted-foreground hover:border-input-hover disabled:hover:border-input focus-visible:outline-none focus-visible:border-ring focus-visible:hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-active";

/** A picker trigger (Combobox, MultiSelect) is a button that looks like a field (#2217). */
export const pickerTriggerClasses = `${fieldBaseClasses} justify-between px-2.5 font-normal hover:bg-field`;

/**
 * Shared invalid-state treatment (Epic C #1127), driven purely by the
 * `aria-invalid` attribute — the attribute is the API. Red border always;
 * the focus ring swaps to destructive so the 2px ring stays but signals error.
 */
export const invalidControlClasses =
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive aria-[invalid=true]:hover:border-destructive aria-[invalid=true]:focus-visible:hover:border-destructive";
