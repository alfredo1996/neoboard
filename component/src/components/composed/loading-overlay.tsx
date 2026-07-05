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
    <div className={cn("relative", className)}>
      {children}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
        <Spinner size="lg" label={text ?? "Loading"} />
        {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
      </div>
    </div>
  );
}

export { LoadingOverlay };
