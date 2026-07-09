/**
 * Parse a "YYYY-MM-DD" string into a Date in local time.
 * Returns undefined if the string is empty, malformed, or produces an invalid date.
 */
export function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Reject overflow dates (e.g. 2024-02-30 → Mar 1): the Date constructor rolls
  // them over silently and getTime() is not NaN, so verify the fields survived.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
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
