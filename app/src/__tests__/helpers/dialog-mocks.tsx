/**
 * Stand-ins for a dialog's close, for page tests that mock the component
 * library. Radix runs `onCloseAutoFocus` once a dialog has closed, and a
 * dialog with no Trigger hands focus back to its opener from there (#2146).
 */
import React from "react";

/** Whether the mocked Dialog around a MockDialogContent is open. */
export const MockDialogOpen = React.createContext(true);

/** Runs `onCloseAutoFocus` when `open` turns false, or on unmount while open. */
export function useCloseAutoFocus(
  onCloseAutoFocus: ((event: Event) => void) | undefined,
  open = true,
): void {
  const latest = React.useRef(onCloseAutoFocus);
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    latest.current = onCloseAutoFocus;
    if (wasOpen.current && !open) latest.current?.(new Event("close"));
    wasOpen.current = open;
  });
  React.useEffect(
    () => () => {
      if (wasOpen.current) latest.current?.(new Event("close"));
    },
    [],
  );
}

/**
 * A Dialog that keeps its content mounted, hidden while closed, so the close
 * runs the `onCloseAutoFocus` of the render that closed it, as Radix's
 * Presence does. One that unmounts at once would run a stale one.
 */
export function MockDialog({
  open,
  children,
}: Readonly<{ open: boolean; children?: React.ReactNode }>) {
  return (
    <MockDialogOpen.Provider value={open}>
      <div role="dialog" hidden={!open}>
        {children}
      </div>
    </MockDialogOpen.Provider>
  );
}

export function MockDialogContent({
  children,
  onCloseAutoFocus,
}: Readonly<{
  children?: React.ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}>) {
  useCloseAutoFocus(onCloseAutoFocus, React.useContext(MockDialogOpen));
  return <div>{children}</div>;
}

/** A dialog component reduced to its Cancel, closing as Radix does. */
export function MockClosingDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}>) {
  useCloseAutoFocus(onCloseAutoFocus, open);
  return open ? (
    <div role="dialog">
      <button onClick={() => onOpenChange(false)}>Cancel</button>
    </div>
  ) : null;
}
