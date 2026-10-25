"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { sanitizeSandbox } from "./chart-options/iframe-sandbox";

export interface IframeWidgetProps {
  /** URL to embed */
  url?: string;
  /** Custom title for accessibility (defaults to "Embedded content") */
  title?: string;
  /**
   * Sandbox attributes for security. Defaults to "allow-scripts allow-popups"
   * which is restrictive — embedded content can run scripts but cannot access
   * the parent page's DOM, cookies, or storage.
   *
   * WARNING: Adding "allow-same-origin" to a sandbox that also has
   * "allow-scripts" allows the embedded page to remove the sandbox attribute
   * entirely via JavaScript, bypassing all restrictions. Only use
   * "allow-same-origin" for trusted, known origins.
   */
  sandbox?: string;
  className?: string;
}

/**
 * Validates that a URL is safe to embed in an iframe.
 * Only allows http: and https: protocols.
 */
function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * The embedded page's domain as a link that opens it in a new tab, for the
 * card header's source line (#2232). Nothing for a URL the widget would not
 * embed (`undefined`, so the card keeps its reserved source line).
 */
function iframeSourceLink(url?: string): React.ReactNode {
  if (!url || !isValidUrl(url)) return undefined;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ring hover:underline"
    >
      {new URL(url.trim()).host} <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function IframeWidget({
  url,
  title = "Embedded content",
  sandbox = "allow-scripts allow-popups",
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
          description="The provided URL is not allowed. Use an http:// or https:// URL."
          className="py-6"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="iframe-widget"
      className={cn("flex h-full w-full flex-col p-3 pt-2", className)}
    >
      <div className="min-h-0 flex-1 overflow-hidden rounded-sm border border-rule">
        <iframe
          src={url}
          title={title}
          sandbox={sanitizeSandbox(sandbox)}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

export { IframeWidget, iframeSourceLink };
