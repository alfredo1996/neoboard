/**
 * For a dialog's `onCloseAutoFocus` when it has no Trigger (#2146): Radix
 * hands focus back to the Trigger, so without one it falls to <body>. Back to
 * the control that opened it, or to `fallback` (the page heading) once a
 * create has taken that control off the page.
 */
export function returnFocus(
  opener: HTMLElement | null,
  fallback: HTMLElement | null,
): void {
  (opener?.isConnected ? opener : fallback)?.focus();
}
