/**
 * @neoboard/connector-sdk/sql — the pieces SQL connectors share above their
 * driver (#1698). Node-only (it uses `node:events`), which is why it is a
 * subpath rather than part of the package root.
 */
export { walkInformationSchema } from "./information-schema";
export type {
  InformationSchemaColumnRow,
  InformationSchemaRunner,
} from "./information-schema";
export { checkReadOnlyStatement } from "./read-only-statement";
export type { ReadOnlyStatementCheck } from "./read-only-statement";
export { bindNamedParams } from "./named-params";
export { iterateRows } from "./row-source";
export type { RowSourceOptions } from "./row-source";
export type { SqlDialect } from "./lexer";
