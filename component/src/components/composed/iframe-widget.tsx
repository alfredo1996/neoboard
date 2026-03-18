"use client";

import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

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
