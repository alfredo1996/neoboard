"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DynamicConnectionFields,
  type DynamicConnectionFieldsProps,
} from "@neoboard/components";
import type { ConnectorDescriptor } from "@neoboard/connection";
import {
  MAX_ROWS_FIELD,
  NAME_FIELD,
  toFormFields,
  type ConnectionFormErrors,
  type ConnectionFormState,
  type FormMode,
} from "@/lib/connector/connection-form";

/** Numbers and text sit two to a row; toggles take a full row below them. */
const GRID = "grid gap-4 space-y-0 sm:grid-cols-2";

interface ConnectorConfigFormProps {
  /** The connector's descriptor, from `useConnector()`. Its `fields` ARE the form. */
  readonly connector: Pick<ConnectorDescriptor, "fields">;
  /** `create` renders `conn-…` ids; `edit` renders `edit-…` and never requires a secret. */
  readonly mode: FormMode;
  readonly value: ConnectionFormState;
  readonly onChange: (next: ConnectionFormState) => void;
  readonly errors?: ConnectionFormErrors;
}

/** A field group, or nothing when the connector declares none for it. */
function FieldGroup(props: Readonly<DynamicConnectionFieldsProps>) {
  return props.fields.length > 0 ? (
    <DynamicConnectionFields {...props} />
  ) : null;
}

/**
 * The connection form, for create AND edit (#1901). The connector declares
 * WHAT it needs — this renders whatever `connector.fields` says, so a
 * connector nobody in `app/` has heard of gets its complete form. HOW it looks
 * is decided here: `connection` fields in the main section, `advanced` ones
 * inside the "Advanced Settings" collapsible, a two-column grid, ids derived
 * from the field keys.
 *
 * Two fields are the app's own and frame the connector's: the connection's
 * name, and `maxRows`, the app's row-limit policy.
 */
export function ConnectorConfigForm({
  connector,
  mode,
  value,
  onChange,
  errors,
}: ConnectorConfigFormProps) {
  const [advancedToggled, setAdvancedToggled] = useState(mode === "edit");
  const advanced = toFormFields(connector.fields, "advanced", mode);
  // An error nobody can see is no error message: a problem inside the section
  // opens it.
  const advancedOpen =
    advancedToggled ||
    Boolean(errors?.own.maxRows) ||
    advanced.some((field) => errors?.config[field.name]);

  const own = {
    idPrefix: mode === "create" ? "conn-" : "edit-",
    values: { name: value.name, maxRows: value.maxRows },
    errors: errors?.own,
    onChange: (name: string, next: string | boolean) =>
      onChange({ ...value, [name]: next }),
  };
  const config = {
    idPrefix: own.idPrefix,
    values: value.config,
    errors: errors?.config,
    onChange: (name: string, next: string | boolean) =>
      onChange({ ...value, config: { ...value.config, [name]: next } }),
  };

  return (
    <>
      <DynamicConnectionFields {...own} fields={[NAME_FIELD]} />
      <FieldGroup
        {...config}
        fields={toFormFields(connector.fields, "connection", mode)}
      />

      <div className="border-t pt-2">
        <button
          type="button"
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setAdvancedToggled(!advancedOpen)}
        >
          Advanced Settings
          <ChevronDown
            className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
          />
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-4">
            <FieldGroup
              {...config}
              className={GRID}
              fields={advanced.filter((field) => field.type !== "boolean")}
            />
            <FieldGroup
              {...config}
              fields={advanced.filter((field) => field.type === "boolean")}
            />
            <DynamicConnectionFields {...own} fields={[MAX_ROWS_FIELD]} />
          </div>
        )}
      </div>
    </>
  );
}
