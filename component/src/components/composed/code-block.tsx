import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  showCopyButton?: boolean;
  className?: string;
}

function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  showCopyButton = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const lines = code.split("\n");

  return (
    <div className={cn("relative rounded-lg bg-muted", className)}>
      {(language || showCopyButton) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          {language && (
            <span className="text-xs text-muted-foreground">{language}</span>
          )}
          {showCopyButton && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span className="sr-only">{copied ? "Copied" : "Copy code"}</span>
            </Button>
          )}
        </div>
      )}
      <pre className="overflow-x-auto p-4">
        <code className="text-sm">
          {showLineNumbers ? (
            <table className="border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className="pr-4 text-right text-muted-foreground select-none">
                      {i + 1}
                    </td>
                    <td className="whitespace-pre">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            code
          )}
        </code>
      </pre>
    </div>
  );
}

export { CodeBlock };
