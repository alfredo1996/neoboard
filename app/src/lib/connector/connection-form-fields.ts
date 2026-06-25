/**
 * Adapts a connector's `formFields` (SDK `ConnectorFormField`, keyed by
 * `key`) into the `DynamicConnectionField` shape the UI renderer expects
 * (keyed by `name`). The connection form is generated from this — no
 * hardcoded per-connector field arrays in the app (#1118).
 *
 * Imports the client-safe `/form-fields` subpath, which pulls in no DB
 * drivers, so this is safe in the client connections page.
 */
import { CONNECTOR_FORM_FIELDS } from "@neoboard/connection/form-fields";
import type { DynamicConnectionField } from "@neoboard/components";
import type { ConnectorType } from "./connector-types";

export function connectionFieldsFor(
  type: ConnectorType,
): DynamicConnectionField[] {
  return (CONNECTOR_FORM_FIELDS[type] ?? []).map((f) => ({
    name: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder,
    description: f.description,
    options: f.options,
  }));
}
