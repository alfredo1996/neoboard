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
- **Result records & schema types** — `NeodashRecord`, `DatabaseSchema`,
  `TableDef`, `ColumnDef`, `PropertyDef`.
- **Error types** — `ConnectorError` / `ConnectorErrorType` for classified,
  user-actionable failures.
- **Connector registry** — `createConnectorRegistry()`. `register()` throws on
  a malformed descriptor (a field missing key/label/type, duplicate keys, a
  `select` without options, a `uri` without protocols, an invalid category, an
  `iconSvg` over 16 KB).

## Quick start

```ts
import type { ConnectorPlugin } from "@neoboard/connector-sdk";

const mysqlPlugin: ConnectorPlugin = {
  type: "mysql",
  label: "MySQL",
  category: "database",
  queryLanguage: "sql",
  supportsWrite: true,
  fields: [
    {
      key: "uri",
      label: "URI",
      type: "uri",
      group: "connection",
      required: true,
      protocols: ["mysql:"],
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      group: "connection",
      required: true,
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      group: "connection",
      required: true,
    },
    {
      key: "maxPoolSize",
      label: "Max Pool Size",
      type: "number",
      group: "advanced",
      min: 1,
      max: 100,
    },
  ],
  // ONE config bag: { uri, username, password, maxPoolSize }
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
