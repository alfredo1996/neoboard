# `@neoboard/connection`

The database connector library. It holds NeoBoard's two built-in connectors —
Neo4j (Bolt, via `neo4j-driver`) and PostgreSQL (via `node-pg`) — the connector
registry that resolves a connector by type, and the schema introspection each
one exposes to the query editor.

## What is in here

- `neo4j/`, `postgresql/` — the built-in connectors. Each is a
  `descriptor.ts` — pure data, no driver import: type, label, query language
  and every config field with its key, range and accepted URI protocols, written
  with the SDK's field builders and owned entirely by that connector — and a
  `plugin.ts` that adds the factories (`createModule(config)`,
  `createSchemaManager()`). The modules read their own unprefixed keys
  (`maxPoolSize`, `connectionTimeout`, `database`, …) from that one config bag.
  Around them: authentication, query
  execution in a read-only or write transaction, and record parsing into plain
  JavaScript values (`NeodashRecord`). Neo4j temporal, spatial and `Integer`
  values are mapped; nodes, relationships and paths are returned as the driver
  gives them, so consumers keep `.labels` and `.properties`.
- `connector-registry.ts` — `createConnectionModule(type, config)` plus the registry
  (`registerConnector`, `getConnector`, `getSchemaManager`). External connector
  plugins register here; `external-connectors.generated.ts` is the generated
  import list for the ones a build includes.
- `schema/` — `Neo4jSchemaManager` and `PostgresSchemaManager`, which introspect
  labels and properties, or tables and columns.
- `<name>/descriptor.ts` — everything a connector is, as plain data: label,
  category, icon, query language and fields. The app serves these to the browser
  from `GET /api/connectors`, so no client code imports this package for a
  connector fact.
- `connector-types.ts` — the closed `ConnectorType` union, on its way out
  (#1900).

The shared contracts — `AuthConfig`, `ConnectionConfig`, `QueryStatus`,
`ConnectorError`, `SchemaManager`, `DatabaseSchema` — come from
[`@neoboard/connector-sdk`](../connector-sdk/README.md) and are re-exported from
`src/index.ts`.

## Boundary

No UI, no React, and no imports from `app/` or `component/`. Query safety lives
here and at the driver level: parameterized queries only, read-only transactions
for everything but form widgets, driver-level timeouts, and the `MAX_ROWS + 1`
row-limit pattern. User query text is never modified or wrapped.

## Testing

```bash
npm -w connection run test
```

Jest, with Testcontainers for the integration suites, so **Docker must be
running**.

## Further reading

- [Architecture](https://alfredo1996.github.io/neoboard/extend/architecture) —
  how the three packages fit together
- [Write a connector plugin](https://alfredo1996.github.io/neoboard/extend/new-connector-plugin)
  — the external-package path
- [`../connector-sdk/README.md`](../connector-sdk/README.md) — the published
  contract
