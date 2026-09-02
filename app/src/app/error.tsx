"use client";

import { useEffect } from "react";

// Not `Error`: that name shadowed the global inside this component's own
// type annotation (`error: Error & …` below), which is the confusion
// SonarCloud S2137 flags and the one MAJOR bug that kept dev's gate red
// (#1561). Next.js needs the default export, not the name.
export default function ErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">
          An unexpected error occurred. Please try again or return to the
          dashboard.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/dashboards"
            className="px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            Go to dashboards
          </a>
        </div>
      </div>
    </div>
  );
}
