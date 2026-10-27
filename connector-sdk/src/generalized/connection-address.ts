/**
 * A secret-free, one-line address for a connection (#2265): `scheme://host:port`,
 * plus ` / <database>`. Derived from descriptor DATA — the `uri`-type field and
 * the field keyed `database` (what {@link databaseField} builds) — so a connector
 * gets it for free and descriptors stay plain data.
 *
 * Userinfo and query are dropped by construction: only the parsed protocol and
 * host are read. The path yields at most one segment, as the database name. A descriptor without a `uri` field, or a config
 * whose URI is missing or unparsable, gives `undefined`.
 */

import type { ConnectorConfig, ConnectorDescriptor } from "./descriptor";

// The address is stored in plaintext, so a database part is shown only if it
// looks like a database name. An allowlist, not a blocklist: an encoded
// separator (`%2F`) decodes past any list of "secret-shaped" characters. A
// value that fails (a field the user typed, or a path segment) drops just the
// database part: the display is cosmetic, so dropping is safe.
const DB_NAME = /^[A-Za-z0-9_.$-]{1,63}$/;

export function connectionAddress(
  descriptor: Pick<ConnectorDescriptor, "fields">,
  config: ConnectorConfig,
): string | undefined {
  const uriKey = descriptor.fields.find((f) => f.type === "uri")?.key;
  const hasDatabase = descriptor.fields.some((f) => f.key === "database");
  const raw = uriKey ? config[uriKey] : undefined;
  if (typeof raw !== "string") return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (!url.host || url.pathname.includes("@")) return undefined;

  const field = config.database;
  const database = typeof field === "string" && field !== "" ? field : pathDb();
  const base = `${url.protocol}//${url.host}`;
  return DB_NAME.test(database) ? `${base} / ${database}` : base;

  // Only the first path segment, and only for a descriptor that has a database
  // field. The caller applies the name allowlist; a path with
  // `@` means a `/` in the password put userinfo there: the whole address goes.
  function pathDb(): string {
    if (!hasDatabase) return "";
    const [segment = ""] = url.pathname.replace(/^\//, "").split("/");
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return "";
    }
    return decoded;
  }
}
