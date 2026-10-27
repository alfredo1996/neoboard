/**
 * A secret-free, one-line address for a connection (#2265): `scheme://host:port`,
 * plus ` / <database>`. Derived from descriptor DATA — the `uri`-type field and
 * the field keyed `database` (what {@link databaseField} builds) — so a connector
 * gets it for free and descriptors stay plain data.
 *
 * Userinfo, path and query are dropped by construction: only the parsed
 * protocol and host are read. A descriptor without a `uri` field, or a config
 * whose URI is missing or unparsable, gives `undefined`.
 */

import type { ConnectorConfig, ConnectorDescriptor } from "./descriptor";

export function connectionAddress(
  descriptor: Pick<ConnectorDescriptor, "fields">,
  config: ConnectorConfig,
): string | undefined {
  const uriKey = descriptor.fields.find((f) => f.type === "uri")?.key;
  const raw = uriKey ? config[uriKey] : undefined;
  if (typeof raw !== "string") return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (!url.host) return undefined;

  const field = config.database;
  const fromPath = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const database = typeof field === "string" && field !== "" ? field : fromPath;
  const base = `${url.protocol}//${url.host}`;
  return database ? `${base} / ${database}` : base;
}
