/**
 * Config-time validation for the iframe widget URL (#1053).
 *
 * Rejects dangerous schemes (`javascript:`, `data:`, `vbscript:`), warns on
 * plain http (and that some sites refuse framing via X-Frame-Options/CSP), and
 * accepts https. Empty is allowed — the widget shows its own "enter a URL"
 * prompt. Returns null when fine, else a severity + message for inline display.
 */
export function validateIframeUrl(
  value: string,
): { level: "error" | "warning"; message: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { level: "error", message: "Enter a valid URL (e.g. https://…)." };
  }

  if (parsed.protocol === "https:") return null;

  if (parsed.protocol === "http:") {
    return {
      level: "warning",
      message:
        "http:// may be blocked in a secure page — prefer https://. Some sites also refuse framing (X-Frame-Options / CSP).",
    };
  }

  return {
    level: "error",
    message: `Only http(s) URLs can be embedded — "${parsed.protocol}" is not allowed.`,
  };
}
