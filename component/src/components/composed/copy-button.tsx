import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  value: string;
  onCopy?: () => void;
}

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ value, onCopy, className, children, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        onCopy?.();
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        onClick={handleCopy}
        {...props}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
        {children}
      </Button>
    );
  }
);
CopyButton.displayName = "CopyButton";

export { CopyButton };
