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
}: ConfirmDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
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
