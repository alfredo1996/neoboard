/**
 * Built-in connector form fields — the single, client-safe source of truth
 * for what the connection form renders (#1118).
 *
 * This module imports NO database drivers (only a type from the SDK), so the
 * browser bundle can pull it via `@neoboard/connection/form-fields` without
 * dragging neo4j-driver / pg in. The plugins re-export these as their
 * `formFields`, so the data lives in exactly one place.
 */

import type { ConnectorFormField } from "@neoboard/connector-sdk";

export const neo4jFormFields: ConnectorFormField[] = [
  {
    key: "uri",
    label: "URI",
    type: "text",
    required: true,
    placeholder: "bolt://localhost:7687",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "neo4j",
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    required: true,
  },
  {
    key: "database",
    label: "Database",
    type: "text",
    placeholder: "neo4j (default)",
    description: "Database name (leave empty for default).",
  },
];

export const postgresFormFields: ConnectorFormField[] = [
  {
    key: "uri",
    label: "URI",
    type: "text",
    required: true,
    placeholder: "postgresql://localhost:5432",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "postgres",
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    required: true,
  },
  {
    key: "database",
    label: "Database",
    type: "text",
    placeholder: "postgres",
    description: "Database name (optional).",
  },
];

/** Built-in connector form fields, keyed by connector type. */
export const CONNECTOR_FORM_FIELDS: Record<string, ConnectorFormField[]> = {
  neo4j: neo4jFormFields,
  postgresql: postgresFormFields,
};
