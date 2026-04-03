/** Parse numeric string to integer, or return undefined if empty/invalid. */
export function parseOptionalInt(val: string): number | undefined {
  if (!val.trim()) return undefined;
  const n = Number(val);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}
