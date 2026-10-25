import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Verbs whose button is the red fill: what they do cannot be taken back by Cancel. */
const DESTRUCTIVE_ACTION = /^(delete|remove|revoke|disable|discard|leave)\b/i;

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The verb: "Delete". It opens the title and the button. */
  action: string;
  /** What the verb acts on: "dashboard". The button reads "{action} {object}". */
  object?: string;
  /**
   * The thing's own name. The title reads "{action} {name}?", or
   * "{action} this {object}?" without one, so no confirm can drift back to
   * "Are you sure?" (#2223).
   */
  name?: string;
  /**
   * What goes with it, as a sentence. A node renders as is, for a list of
   * affected dashboards and widgets (the delete-connection flow).
   */
  consequences?: React.ReactNode;
  cancelText?: string;
  /** Disable the confirm button (e.g. while usage is loading). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  /**
   * Where focus goes when the dialog closes. It has no Trigger, so without
   * this Radix returns focus to nothing and it falls to <body>. Asked from a
   * menu item, pass `focusedMenuTrigger()` read in the item's handler. Skipped
   * when the element has left the page (the thing it belonged to was deleted).
   */
  returnFocusTo?: HTMLElement | null;
  /** Where focus goes instead when `returnFocusTo` has left the page. */
  returnFocusFallback?: HTMLElement | null;
  /**
   * Overrides the verb-based red fill. A lossy action whose verb is not on the
   * list ("Sync": the template replaces the widget's query) passes true.
   */
  destructive?: boolean;
}

function ConfirmDialog({
  open,
  onOpenChange,
  action,
  object,
  name,
  consequences,
  cancelText = "Cancel",
  confirmDisabled = false,
  onConfirm,
  onCancel,
  returnFocusTo,
  returnFocusFallback,
  destructive: destructiveOverride,
}: Readonly<ConfirmDialogProps>) {
  let subject = "";
  if (name) subject = ` ${name}`;
  else if (object) subject = ` this ${object}`;
  const title = `${action}${subject}?`;
  const confirmText = object ? `${action} ${object}` : action;
  const destructive = destructiveOverride ?? DESTRUCTIVE_ACTION.test(action);
  const bodyId = React.useId();
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    // Closed but still fading out, the button takes a second click (a
    // double-click, or Enter twice). Confirm once (#2055).
    if (!open) return;
    onConfirm();
    onOpenChange(false);
  };

  let describedBy: { "aria-describedby": string | undefined } | undefined;
  if (typeof consequences !== "string") {
    describedBy = {
      "aria-describedby": consequences === undefined ? undefined : bodyId,
    };
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // Radix wires a string's AlertDialogDescription itself; a node is
        // described through its id, and none means no description at all.
        {...describedBy}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.isConnected
            ? returnFocusTo
            : returnFocusFallback;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        {consequences !== undefined &&
          (typeof consequences === "string" ? (
            <AlertDialogDescription className="text-[13.5px]">
              {consequences}
            </AlertDialogDescription>
          ) : (
            // A node goes in a div, not AlertDialogDescription, so block-level
            // children (lists) don't nest inside a <p>.
            <div id={bodyId} className="text-[13.5px] text-muted-foreground">
              {consequences}
            </div>
          ))}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={cn(
              destructive && buttonVariants({ variant: "danger-confirm" }),
              confirmDisabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
