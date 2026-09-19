# @neoboard/connector-sdk

Stable contract for building [NeoBoard](https://alfredo1996.github.io/neoboard/) connectors.

A connector teaches NeoBoard how to talk to a database or service: how to
connect, run queries safely, and describe its schema. This package is the
seam — implement the contract here and register your plugin, and the
connector works everywhere in NeoBoard without forking the app.

## What's in here

- **`ConnectorDescriptor` / `ConnectorField`** — what a connector is, as
  pure JSON-serializable data: type, label, category, query language, and the
  `fields` it needs in its config (text, password, number, select, boolean,
  uri — with ranges, options and accepted URI protocols).
- **Field builders** — `uriField`, `usernameField`, `passwordField`,
  `databaseField`, `timeoutField`, `poolSizeField`: optional one-line
  shorthands for the fields most connectors share. Each returns the plain
  literal; a descriptor can mix them with hand-written fields.
- **`ConnectorPlugin`** — a descriptor plus `createModule(config)` and an
  optional `createSchemaManager()`. `createModule` takes **one config bag**
  keyed by the fields' keys; the connector builds its own driver auth from it.
- **`validateConfig(descriptor, config)`** — pure validation of a config bag
  against a descriptor (required, integer ranges, select membership, URI
  rules; unknown keys stripped), returning per-field errors.
  **`toDescriptor(plugin)`** strips the functions, leaving what is safe to
  send to a browser.
- **`ConnectionModule` / `AuthenticationModule`** — base classes a connector
  implements for connect / query / schema.
- **Query-safety helpers** — the invariants every connector must uphold:
  read-only access modes, the `MAX_ROWS + 1` row-limit pattern, statement
  timeouts, and cancellation.
- **The row value contract** — `RowValue` / `Row`: what a result row may
  hold, so nothing downstream asks which connector produced a value. Tagged
  graph values (`GraphNode`, `GraphRelationship`, `GraphPath`, with the
  `isGraphNode` / `isGraphRelationship` / `isGraphPath` guards), and the
  `toIsoDuration` and `integerToRowValue` helpers.
- **Result-shape conformance** — `buildShapeConformanceCases`: proves a
  record parser emits the contract's forms, with no database.
- **Schema types** — `DatabaseSchema`, `TableDef`, `ColumnDef`,
  `PropertyDef`.
- **Error classification** — the optional `classifyError(err)` plugin hook says
  what one of your errors IS (`{ type, transient, constraint?, blockedWrite? }`);
  NeoBoard reads no driver's codes or messages itself. `createErrorClassifier`
  builds the hook from tables, `wrapError(err, classify)` attaches its verdict
  to a `ConnectorError`, and `defaultClassifyError` is what applies without one.
- **Connector registry** — `createConnectorRegistry()`. `register()` throws on
  a malformed descriptor (a field missing key/label/type, duplicate keys, a
  `select` without options, a `uri` without protocols, an invalid category, an
  `iconSvg` over 16 KB).

## Quick start

```ts
import {
  passwordField,
  poolSizeField,
  uriField,
  usernameField,
  type ConnectorPlugin,
} from "@neoboard/connector-sdk";

const mysqlPlugin: ConnectorPlugin = {
  type: "mysql",
  label: "MySQL",
  category: "database",
  queryLanguage: "sql",
  supportsWrite: true,
  fields: [
    uriField({ protocols: ["mysql:"] }),
    usernameField(),
    passwordField(),
    poolSizeField("10"),
    // …or any field as a plain literal:
    { key: "charset", label: "Charset", type: "text", group: "advanced" },
  ],
  // ONE config bag: { uri, username, password, maxPoolSize, charset }
  createModule(config) {
    return new MysqlConnectionModule(config);
  },
};

export default mysqlPlugin;
```

NeoBoard loads the package through `neoboard-connectors.json` (`neoboard plugin
add <package>` from a checkout) and registers the default export at startup.
The full walkthrough — connection module, query-safety invariants, conformance
harness — is the [connector plugin guide](https://alfredo1996.github.io/neoboard/extend/new-connector-plugin/).

The built-in `neo4j` and `postgresql` connectors in `@neoboard/connection`
are themselves built on this SDK — see them for complete reference
implementations.

## License

[Elastic License 2.0 (ELv2)](./LICENSE).
