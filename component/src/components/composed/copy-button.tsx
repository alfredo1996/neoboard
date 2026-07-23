import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  /** The text value to copy to the clipboard. */
  value: string;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  /** Label shown on the button. Defaults to "Copy". */
  label?: string;
}

function CopyButton({
  value,
  className,
  variant = "outline",
  size = "sm",
  label = "Copy",
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
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (insecure/non-HTTPS context) or permission
      // denied — leave the button unchanged rather than falsely flashing
      // "Copied!". (#component-review)
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {/* aria-live so screen-reader users hear the copy confirmation. */}
      <span aria-live="polite">{copied ? "Copied!" : label}</span>
    </Button>
  );
}

export { CopyButton };
