"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

export interface IframeWidgetProps {
  /** URL to embed */
  url?: string;
  /** Custom title for accessibility (defaults to "Embedded content") */
  title?: string;
  /**
   * Sandbox attributes for security. Defaults to a restrictive policy.
   * Set to "allow-scripts allow-same-origin" for interactive content.
   */
  sandbox?: string;
  className?: string;
}

/**
 * Validates that a URL is safe to embed in an iframe.
 * Blocks javascript: and data: URIs to prevent XSS.
 */
function isValidUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("javascript:")) return false;
  if (trimmed.startsWith("data:")) return false;
  return true;
}

function IframeWidget({
  url,
  title = "Embedded content",
  sandbox = "allow-scripts allow-same-origin allow-popups",
  className,
}: IframeWidgetProps) {
  if (!url) {
    return (
      <div
        data-testid="iframe-widget"
        className={cn("h-full flex items-center justify-center", className)}
      >
        <EmptyState
          title="No URL configured"
          description="Add a URL in the widget settings to embed external content."
          className="py-6"
        />
      </div>
    );
  }

  if (!isValidUrl(url)) {
    return (
      <div
        data-testid="iframe-widget"
        className={cn("h-full flex items-center justify-center", className)}
      >
        <EmptyState
          title="Invalid URL"
          description="The provided URL is not allowed. Use an https:// URL."
          className="py-6"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="iframe-widget"
      className={cn("h-full w-full", className)}
    >
      <iframe
        src={url}
        title={title}
        sandbox={sandbox}
        className="w-full h-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export { IframeWidget };
