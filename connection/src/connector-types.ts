/**
 * Canonical connector type constants now live in @neoboard/connector-sdk.
 * This re-export keeps the `@neoboard/connection/connector-types` subpath
 * working for existing app consumers — do not add new declarations here.
 */
export { CONNECTOR_TYPES, CONNECTOR_LABELS } from "@neoboard/connector-sdk";
export type { ConnectorType } from "@neoboard/connector-sdk";
