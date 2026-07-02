/**
 * Shared form-control size scale (Epic C #1127) — one map so Input,
 * SelectTrigger, and Textarea can't drift. `default` carries geometry only;
 * each control keeps its own text/py baseline so default rendering is
 * unchanged. `lg` pins text-base at all widths (base classes use the
 * responsive `text-base md:text-sm` pattern, merged away by tailwind-merge).
 */
export const controlSizes = {
  sm: "h-8 px-2.5 text-sm",
  default: "h-10 px-3",
  lg: "h-12 px-3.5 text-base md:text-base",
} as const;

/** Textarea variant of the same scale — min-height instead of fixed height. */
export const textareaSizes = {
  sm: "min-h-[48px] px-2.5 text-sm",
  default: "min-h-[60px] px-3",
  lg: "min-h-[80px] px-3.5 text-base md:text-base",
} as const;

export type ControlSize = keyof typeof controlSizes;

/**
 * Shared invalid-state treatment (Epic C #1127), driven purely by the
 * `aria-invalid` attribute — the attribute is the API. Red border always;
 * the focus ring swaps to destructive so the 2px ring stays but signals error.
 */
export const invalidControlClasses =
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive";
