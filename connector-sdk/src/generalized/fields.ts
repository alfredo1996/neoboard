/**
 * Builders for the fields most connectors share (#1897).
 *
 * Entirely optional: each returns the plain {@link ConnectorField} literal you
 * would otherwise write by hand, under NeoBoard's conventional key, and a
 * descriptor can mix them with hand-written fields or adjust one by spreading
 * it (`{ ...databaseField(), required: true }`). They exist so that two
 * connectors that both need a URI, a username and a pool size each say so in a
 * line — with their OWN protocols and placeholders — instead of copying a
 * forty-line block from one another.
 *
 * Pure data in, pure data out: no driver, nothing connector-specific.
 */

import type { ConnectorField } from "./descriptor";

/** Drops `undefined` values, so an option left out leaves no key behind. */
function defined(field: ConnectorField): ConnectorField {
  return Object.fromEntries(
    Object.entries(field).filter(([, value]) => value !== undefined),
  ) as ConnectorField;
}

/** `uri` — required. `protocols` are the schemes you accept, colon included. */
export function uriField(options: {
  protocols: string[];
  placeholder?: string;
}): ConnectorField {
  return defined({
    key: "uri",
    label: "URI",
    type: "uri",
    group: "connection",
    required: true,
    placeholder: options.placeholder,
    protocols: [...options.protocols],
  });
}

/** `username` — required text. */
export function usernameField(placeholder?: string): ConnectorField {
  return defined({
    key: "username",
    label: "Username",
    type: "text",
    group: "connection",
    required: true,
    placeholder,
  });
}

/** `password` — a required secret. */
export function passwordField(): ConnectorField {
  return {
    key: "password",
    label: "Password",
    type: "password",
    group: "connection",
    required: true,
  };
}

/** `database` — optional text; empty means the server's default. */
export function databaseField(
  options: { placeholder?: string; description?: string } = {},
): ConnectorField {
  return defined({
    key: "database",
    label: "Database",
    type: "text",
    group: "connection",
    placeholder: options.placeholder,
    description: options.description,
  });
}

/** An advanced timeout in milliseconds, 1 s to 5 min, under your own key and label. */
export function timeoutField(
  key: string,
  label: string,
  placeholder?: string,
): ConnectorField {
  return defined({
    key,
    label,
    type: "number",
    group: "advanced",
    placeholder,
    min: 1000,
    max: 300_000,
    unit: "ms",
  });
}

/** `maxPoolSize` — advanced, 1 to 100 connections. */
export function poolSizeField(placeholder?: string): ConnectorField {
  return defined({
    key: "maxPoolSize",
    label: "Max Pool Size",
    type: "number",
    group: "advanced",
    placeholder,
    min: 1,
    max: 100,
  });
}
