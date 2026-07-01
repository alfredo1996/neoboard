# @neoboard/connector-sdk

Stable contract for building [NeoBoard](https://neoboard.app) connectors.

A connector teaches NeoBoard how to talk to a database or service: how to
connect, run queries safely, and describe its schema. This package is the
seam — implement the contract here and register your plugin, and the
connector works everywhere in NeoBoard without forking the app.

## What's in here

- **`ConnectorPlugin`** — the plugin contract (type, label, category,
  `createModule`, optional `formFields` for the connection UI, query
  language, allowed protocols).
- **`ConnectionModule` / `AuthenticationModule`** — base classes a connector
  implements for connect / query / cancel.
- **Query-safety helpers** — the invariants every connector must uphold:
  read-only access modes, the `MAX_ROWS + 1` row-limit pattern, statement
  timeouts, and cancellation.
- **Result records & schema types** — `NeodashRecord`, `DatabaseSchema`,
  `TableDef`, `ColumnDef`, `PropertyDef`.
- **Error types** — `ConnectorError` / `ConnectorErrorType` for classified,
  user-actionable failures.
- **Connector registry** — `createConnectorRegistry()` / `registerConnector()`.

## Quick start

```ts
import {
  type ConnectorPlugin,
  registerConnector,
} from "@neoboard/connector-sdk";

const mysqlPlugin: ConnectorPlugin = {
  type: "mysql",
  label: "MySQL",
  category: "database",
  queryLanguage: "sql",
  supportsWrite: true,
  formFields: [
    { key: "uri", label: "URI", type: "text", required: true },
    { key: "username", label: "Username", type: "text", required: true },
    { key: "password", label: "Password", type: "password", required: true },
  ],
  createModule(auth, opts) {
    return new MysqlConnectionModule(auth, opts);
  },
};

registerConnector(mysqlPlugin);
```

The built-in `neo4j` and `postgresql` connectors in `@neoboard/connection`
are themselves built on this SDK — see them for complete reference
implementations.

## License

[Elastic License 2.0 (ELv2)](./LICENSE).
