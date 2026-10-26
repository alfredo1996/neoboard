import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface LoadingOverlayProps {
  loading?: boolean;
  text?: string;
  className?: string;
  children?: React.ReactNode;
}

function LoadingOverlay({
  loading = true,
  text,
  className,
  children,
}: LoadingOverlayProps) {
  if (!loading) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative min-h-40", className)}>
      {children}
      <output className="absolute inset-0 flex flex-col items-center justify-center bg-background/[0.72]">
        <Spinner role="presentation" aria-hidden="true" />
        <span className="mt-2 text-[13px] text-muted-foreground">
          {text ?? "Loading…"}
        </span>
      </output>
    </div>
  );
}

export { LoadingOverlay };
