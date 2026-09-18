/**
 * PostgreSQL connector descriptor — everything the PostgreSQL connector IS, as
 * data.
 *
 * Type-only imports, on purpose: this file must stay safe to bundle for the
 * browser, so it may never pull in pg. `plugin.ts` adds the factories that do.
 *
 * Field keys are the STORED config keys. Renaming one is a data migration.
 * Placeholders are the connection form's own, carried over unchanged; they are
 * never applied as values — the defaults live in PostgresAuthenticationModule.
 */

import type { ConnectorDescriptor } from "@neoboard/connector-sdk";

export const postgresDescriptor: ConnectorDescriptor = {
  type: "postgresql",
  label: "PostgreSQL",
  category: "database",
  queryLanguage: "sql",
  supportsGraphData: false,
  supportsWrite: true,
  fields: [
    {
      key: "uri",
      label: "URI",
      type: "uri",
      group: "connection",
      required: true,
      placeholder: "postgresql://localhost:5432",
      protocols: ["postgresql:", "postgres:"],
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      group: "connection",
      required: true,
      placeholder: "postgres",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      group: "connection",
      required: true,
    },
    {
      key: "database",
      label: "Database",
      type: "text",
      group: "connection",
      placeholder: "postgres",
      description: "Database name (optional).",
    },
    {
      key: "connectionTimeout",
      label: "Connection Timeout",
      type: "number",
      group: "advanced",
      placeholder: "10000",
      min: 1000,
      max: 300_000,
      unit: "ms",
    },
    {
      key: "idleTimeout",
      label: "Idle Timeout",
      type: "number",
      group: "advanced",
      placeholder: "10000",
      min: 1000,
      max: 300_000,
      unit: "ms",
    },
    {
      key: "maxPoolSize",
      label: "Max Pool Size",
      type: "number",
      group: "advanced",
      placeholder: "10",
      min: 1,
      max: 100,
    },
    {
      key: "statementTimeout",
      label: "Statement Timeout",
      type: "number",
      group: "advanced",
      placeholder: "30000",
      min: 1000,
      max: 300_000,
      unit: "ms",
    },
    {
      key: "sslRejectUnauthorized",
      label: "Reject Unauthorized SSL",
      type: "boolean",
      group: "advanced",
    },
  ],
};
