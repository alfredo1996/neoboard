import * as React from "react";
import { Loader2 } from "lucide-react";
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
    <div className={cn("relative", className)}>
      {children}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        {text && (
          <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        )}
      </div>
    </div>
  );
}

export { LoadingOverlay };
