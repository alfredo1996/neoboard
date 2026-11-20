import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonBase {
  /** The text value to copy to the clipboard. */
  value: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  /** Called once the clipboard has taken the text. */
  onCopied?: () => void;
  /** Called when the browser refuses the write, so the caller can offer the
   *  text another way (it was swallowed silently before, #2515). */
  onBlocked?: () => void;
}

export type CopyButtonProps = CopyButtonBase &
  (
    | {
        size?: "default" | "sm" | "lg";
        /** Label shown on the button. Defaults to "Copy". */
        label?: string;
        "aria-label"?: string;
      }
    | {
        /** Icon only: no visible text, so a name is required. */
        size: "icon" | "icon-sm";
        label?: never;
        "aria-label": string;
      }
  );

function CopyButton({
  value,
  className,
  variant = "secondary",
  size = "sm",
  label = "Copy",
  onCopied,
  onBlocked,
  "aria-label": ariaLabel,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending reset on unmount so we never setState on an unmounted
  // component (and don't leak the timer). (#component-review)
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      // Called inside the click handler, so the write keeps the user's gesture.
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (insecure/non-HTTPS context) or permission
      // denied — leave the button unchanged rather than falsely flashing
      // "Copied!", and tell the caller. (#component-review)
      onBlocked?.();
      return;
    }
    onCopied?.();
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const icon = copied ? (
    <Check className="h-4 w-4" />
  ) : (
    <Copy className="h-4 w-4" />
  );

  if (size === "icon" || size === "icon-sm") {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={ariaLabel ?? "Copy"}
        className={className}
        onClick={() => void handleCopy()}
      >
        {icon}
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={ariaLabel}
      className={cn("gap-1.5", className)}
      onClick={() => void handleCopy()}
    >
      {icon}
      {/* aria-live so screen-reader users hear the copy confirmation. */}
      <span aria-live="polite">{copied ? "Copied!" : label}</span>
    </Button>
  );
}

export { CopyButton };
