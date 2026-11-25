import type { ConnectorDescriptor } from "@neoboard/connection";

/**
 * The CodeMirror editor language for a connector type (#1120): whatever
 * `queryLanguage` its descriptor declares. `connectors` is the list from
 * `useConnectors()` (#1899). Returns "" — plain text, no highlighting — for a
 * connector that declares none or is not installed, and while the list loads.
 */
export function editorLanguageForConnector(
  connectors:
    readonly Pick<ConnectorDescriptor, "type" | "queryLanguage">[] | undefined,
  type?: string | null,
): string {
  return connectors?.find((c) => c.type === type)?.queryLanguage ?? "";
}

// ponytail: the words the SQL standard reserves; a name here is
// quoted, since `SELECT order` fails and `SELECT user` returns current_user.
// A dialect with more can be added; over-quoting is harmless.
const SQL_RESERVED = new Set(
  `all analyse analyze and any array as asc between both case cast check collate
  column constraint create cross current_date current_time current_timestamp
  current_user default desc distinct do else end except false fetch for foreign
  from full grant group having in inner intersect into is join leading left
  like limit natural not null offset on only or order outer placing primary
  references returning right select session_user some symmetric table then to
  trailing true union unique user using variadic when where window with`.split(
    /\s+/,
  ),
);

/**
 * A term's key as the editor's language wants it written (#1693): quoted only
 * when it is not a plain identifier. Decided by the language, never the
 * connector. An unknown language gets the bare key.
 */
export function quoteTerm(name: string, language: string): string {
  if (language === "cypher") {
    return /^[A-Za-z_]\w*$/.test(name)
      ? name
      : "`" + name.replaceAll("`", "``") + "`";
  }
  if (language === "sql") {
    return /^[a-z_][a-z0-9_]*$/.test(name) && !SQL_RESERVED.has(name)
      ? name
      : '"' + name.replaceAll('"', '""') + '"';
  }
  return name;
}
