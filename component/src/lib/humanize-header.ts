/**
 * Humanize a raw column id into a display label (#1055).
 *
 * Splits snake_case (and spaces) into words and Capitalizes each, so a column
 * like `Total_spend` reads "Total Spend", consistent with "Customer"/"City".
 * Already-spaced or single words pass through Capitalized.
 */
export function humanizeHeader(id: string): string {
  return id
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
