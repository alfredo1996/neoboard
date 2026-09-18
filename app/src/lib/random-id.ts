/**
 * A v4 UUID that also works outside a secure context (#1886).
 *
 * `crypto.randomUUID` exists only on HTTPS and on localhost. A self-hosted
 * install reached over plain HTTP by LAN IP is neither, and there a
 * module-scope `crypto.randomUUID()` in the dashboard store crashed every page
 * that imported it. `crypto.getRandomValues` has no such restriction, so the
 * fallback is built on it and is just as random.
 *
 * Client code calls this, never `crypto.randomUUID` directly. Server code may:
 * Node always has it.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
