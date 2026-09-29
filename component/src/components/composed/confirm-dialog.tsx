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

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Dialog body. Accepts either a plain string (rendered inside the
   * AlertDialogDescription as before) or a React node for richer layouts
   * like bulleted lists, tables, or warning banners. Used e.g. by the
   * delete-connection flow to render a usage breakdown of affected
   * dashboards and widgets.
   */
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
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
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  confirmDisabled = false,
  onConfirm,
  onCancel,
  returnFocusTo,
}: Readonly<ConfirmDialogProps>) {
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo?.isConnected) return;
          event.preventDefault();
          returnFocusTo.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description !== undefined &&
            (typeof description === "string" ? (
              <AlertDialogDescription>{description}</AlertDialogDescription>
            ) : (
              // When description is a node, we wrap it in a div rather than
              // AlertDialogDescription so block-level children (lists,
              // headings) don't trigger a hydration warning about invalid
              // DOM nesting inside a <p>.
              <div className="text-sm text-muted-foreground">{description}</div>
            ))}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={cn(
              variant === "destructive" &&
                buttonVariants({ variant: "destructive" }),
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
