"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

interface ChartErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors from any chart component so one broken widget
 * doesn't crash the entire dashboard.
 */
export class ChartErrorBoundary extends React.Component<
  { chartType: string; children: React.ReactNode },
  ChartErrorBoundaryState
> {
  state: ChartErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ChartErrorBoundary] ${this.props.chartType} crashed:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Chart failed to render</p>
          <p className="text-xs text-muted-foreground max-w-[300px] truncate">
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
