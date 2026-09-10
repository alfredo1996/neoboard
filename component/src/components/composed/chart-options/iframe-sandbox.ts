/**
 * Iframe sandbox policy (#1413): one allow-list shared by the widget, which
 * strips everything else at render, and by the editor, which says what was
 * stripped and why instead of discarding it silently.
 */
const SAFE_SANDBOX_TOKENS = new Set([
  "allow-scripts",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-forms",
  "allow-modals",
  "allow-downloads",
  "allow-presentation",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-top-navigation-by-user-activation",
]);

/** Real sandbox tokens the widget deliberately refuses, with the reason. */
const REFUSED_SANDBOX_TOKENS: Record<string, string> = {
  "allow-same-origin":
    "with allow-scripts the frame could remove its own sandbox",
  "allow-top-navigation":
    "the frame could navigate the dashboard away without a click (allow-top-navigation-by-user-activation is allowed)",
  "allow-top-navigation-to-custom-protocols":
    "the frame could launch external apps via custom protocols",
  "allow-storage-access-by-user-activation":
    "the frame could ask for access to its unpartitioned cookies and storage",
};

/**
 * Keep only allow-listed tokens. This stops persisted widget config from
 * injecting "allow-same-origin", which together with "allow-scripts" lets the
 * embedded page remove the sandbox entirely.
 */
export function sanitizeSandbox(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((token) => SAFE_SANDBOX_TOKENS.has(token))
    .join(" ");
}

/** Config-time check: null when every token is applied, else a warning. */
export function validateIframeSandbox(
  value: string,
): { level: "warning"; message: string } | null {
  const discarded = [...new Set(value.split(/\s+/).filter(Boolean))].filter(
    (token) => !SAFE_SANDBOX_TOKENS.has(token),
  );
  if (discarded.length === 0) return null;

  const reasons = discarded.map((token) =>
    Object.hasOwn(REFUSED_SANDBOX_TOKENS, token)
      ? `"${token}" is refused: ${REFUSED_SANDBOX_TOKENS[token]}.`
      : `"${token}" is not a recognised sandbox token and is ignored.`,
  );
  const applied = sanitizeSandbox(value);
  const appliedText = applied ? `"${applied}"` : "none (fully sandboxed)";
  return {
    level: "warning",
    message: `${reasons.join(" ")} Applied: ${appliedText}.`,
  };
}
