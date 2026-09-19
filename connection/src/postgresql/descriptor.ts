/**
 * PostgreSQL connector descriptor — everything the PostgreSQL connector IS, as
 * data.
 *
 * Imports only the SDK (its pure field builders; the SDK depends on nothing),
 * on purpose: this file must stay safe to bundle for the browser, so it may
 * never pull in pg. `plugin.ts` adds the factories that do.
 *
 * Field keys are the STORED config keys. Renaming one is a data migration.
 * Placeholders are the connection form's own, carried over unchanged; they are
 * never applied as values — the defaults live in PostgresAuthenticationModule.
 */

import {
  databaseField,
  passwordField,
  poolSizeField,
  timeoutField,
  uriField,
  usernameField,
  type ConnectorDescriptor,
} from "@neoboard/connector-sdk";

export const postgresDescriptor: ConnectorDescriptor = {
  type: "postgresql",
  label: "PostgreSQL",
  category: "database",
  queryLanguage: "sql",
  supportsGraphData: false,
  supportsWrite: true,
  fields: [
    uriField({
      placeholder: "postgresql://localhost:5432",
      protocols: ["postgresql:", "postgres:"],
    }),
    usernameField("postgres"),
    passwordField(),
    databaseField({
      placeholder: "postgres",
      description: "Database name (optional).",
    }),
    timeoutField("connectionTimeout", "Connection Timeout", "10000"),
    timeoutField("idleTimeout", "Idle Timeout", "10000"),
    poolSizeField("10"),
    timeoutField("statementTimeout", "Statement Timeout", "30000"),
    {
      key: "sslRejectUnauthorized",
      label: "Reject Unauthorized SSL",
      type: "boolean",
      group: "advanced",
    },
  ],
};
