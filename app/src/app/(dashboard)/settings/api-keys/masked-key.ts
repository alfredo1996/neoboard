/** Masked token display, e.g. "nb_1a2b3c4d…****" — never the full secret (#1038). */
export function maskedKey(prefix: string | null): string {
  if (!prefix) return "—";
  return `${prefix}…****`;
}
