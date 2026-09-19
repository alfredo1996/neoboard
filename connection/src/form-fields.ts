/**
 * Built-in connector form fields, in the shape the connection dialog reads
 * today (#1118). Since #1897 this is a projection of each connector's
 * descriptor — its `group: "connection"` fields — so the data lives in exactly
 * one place. #1899 deletes this file once the dialog reads descriptors from
 * GET /api/connectors.
 *
 * Imports NO database drivers (the descriptors are pure data), so the browser
 * bundle can pull it via `@neoboard/connection/form-fields`.
 */

import type { ConnectorDescriptor } from "@neoboard/connector-sdk";
import { neo4jDescriptor } from "./neo4j/descriptor";
import { postgresDescriptor } from "./postgresql/descriptor";

/** The dialog's field shape: a descriptor field without `group`, and no `uri` type. */
export interface ConnectorFormField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "boolean";
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  description?: string;
}

function formFields(descriptor: ConnectorDescriptor): ConnectorFormField[] {
  return descriptor.fields
    .filter((field) => field.group === "connection")
    .map(({ group: _group, protocols: _protocols, ...rest }) => ({
      ...rest,
      // The dialog renders a URI as a plain text input. Overriding in place
      // keeps `type` where it was, so the output is identical key for key.
      type: rest.type === "uri" ? "text" : rest.type,
    }));
}

export const neo4jFormFields = formFields(neo4jDescriptor);
export const postgresFormFields = formFields(postgresDescriptor);

/** Built-in connector form fields, keyed by connector type. */
export const CONNECTOR_FORM_FIELDS: Record<string, ConnectorFormField[]> = {
  [neo4jDescriptor.type]: neo4jFormFields,
  [postgresDescriptor.type]: postgresFormFields,
};
