/**
 * Parse a "YYYY-MM-DD" string into a Date in local time.
 * Returns undefined if the string is empty, malformed, or produces an invalid date.
 */
export function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Format a Date as "YYYY-MM-DD" using local time.
 * Avoids UTC midnight shift that Date.toISOString() can cause in west-of-UTC timezones.
 */
export function formatIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
