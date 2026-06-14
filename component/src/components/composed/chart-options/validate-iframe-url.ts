/**
 * Config-time validation for the iframe widget URL (#1053).
 *
 * Only a secure (https) scheme passes cleanly. Dangerous schemes
 * (`javascript:`, `data:`, `vbscript:`) are rejected; any other non-secure
 * scheme (including clear-text transport) gets a warning that it may be blocked
 * and that some sites refuse framing (X-Frame-Options / CSP). Empty is allowed —
 * the widget shows its own "enter a URL" prompt. Returns null when fine, else a
 * severity + message for inline display.
 */
const SECURE_SCHEME = "https:";
const DANGEROUS_SCHEMES = new Set(["javascript:", "data:", "vbscript:"]);

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

  if (parsed.protocol === SECURE_SCHEME) return null;

  if (DANGEROUS_SCHEMES.has(parsed.protocol)) {
    return {
      level: "error",
      message: `Only secure (https) URLs can be embedded — "${parsed.protocol}" is not allowed.`,
    };
  }

  // Any other scheme (clear-text transport, ftp, …) — allowed but discouraged.
  return {
    level: "warning",
    message:
      "Prefer an https:// URL — non-secure schemes may be blocked in a secure page, and some sites refuse framing (X-Frame-Options / CSP).",
  };
}
