"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@neoboard/components";

interface DashboardErrorBoundaryState {
  error: Error | null;
}

export class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  DashboardErrorBoundaryState
> {
  state: DashboardErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[DashboardErrorBoundary] crashed:",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div className="space-y-1">
            <p className="text-lg font-semibold">Something went wrong</p>
            <p className="text-sm text-muted-foreground max-w-md">
              An unexpected error occurred while rendering this dashboard. Try
              refreshing the page.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
