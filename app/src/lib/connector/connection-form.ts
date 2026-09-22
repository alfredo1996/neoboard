import {
  validateConfig,
  type ConnectorConfig,
  type ConnectorDescriptor,
  type ConnectorField,
} from "@neoboard/connector-sdk";
import type { DynamicConnectionField } from "@neoboard/components";

/**
 * The connection form's pure half (#1901): what a descriptor's fields look
 * like as form fields, how form state becomes a config bag and back, and the
 * inline errors. The connector declares WHAT it needs; everything here is the
 * app deciding HOW that is asked for. No connector is named, so a connector
 * nobody in `app/` has heard of gets its own complete form.
 *
 * Safe for the browser: `@neoboard/connector-sdk` depends on nothing, so
 * `validateConfig` — the same function the API routes call — runs here too.
 */

export type FormMode = "create" | "edit";

/** Form values keyed by field key. Text inputs hold strings, toggles booleans. */
export type ConfigFormValues = Record<string, string | boolean | undefined>;

/**
 * `name` and `maxRows` are the app's own and live beside the connector's
 * values, never among them: a connector may declare any key it likes.
 */
export interface ConnectionFormState {
  name: string;
  maxRows: string;
  config: ConfigFormValues;
}

export interface ConnectionFormErrors {
  /** The app's own fields: `name`, `maxRows`. */
  own: Record<string, string>;
  /** `field.key → message`, as `validateConfig` reports them. */
  config: Record<string, string>;
}

export const EMPTY_CONNECTION_FORM: ConnectionFormState = {
  name: "",
  maxRows: "",
  config: {},
};

/**
 * The one definition of a secret: a field whose descriptor type is
 * `password`. Redaction, "blank keeps the stored value" and the form all ask
 * this, so a connector's second or third secret is handled like its first.
 */
export const isSecretField = (field: Pick<ConnectorField, "type">): boolean =>
  field.type === "password";

/** Bounds of the app's row-limit policy — shared with the routes' zod schema. */
export const MAX_ROWS_BOUNDS = { min: 100, max: 100_000 };

export const NAME_FIELD: DynamicConnectionField = {
  name: "name",
  label: "Name",
  type: "text",
  required: true,
  placeholder: "My Database",
};

export const MAX_ROWS_FIELD: DynamicConnectionField = {
  name: "maxRows",
  id: "max-rows",
  label: "Max Rows per Query",
  type: "number",
  placeholder: "5000",
  ...MAX_ROWS_BOUNDS,
  description:
    "Results beyond this cap are truncated and a banner is shown on the widget. Default 5,000. Increase cautiously — higher limits raise per-query memory usage.",
};

/** `maxPoolSize` → `max-pool-size`: the stable id suffix (`conn-…`, `edit-…`). */
const kebab = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Copies the optional keys that are set, so none arrives as `undefined`. */
function defined<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * One group of a descriptor's fields, as the form renders them. A `uri` is a
 * text input. In edit a secret is never required and says so: the server
 * keeps the stored value of one left blank.
 */
export function toFormFields(
  fields: ConnectorField[],
  group: ConnectorField["group"],
  mode: FormMode,
): DynamicConnectionField[] {
  return fields
    .filter((field) => field.group === group)
    .map((field) => {
      const keepsStored = mode === "edit" && isSecretField(field);
      const { description, options, min, max, unit } = field;
      return {
        name: field.key,
        id: kebab(field.key),
        label: field.label,
        type: field.type === "uri" ? "text" : field.type,
        ...defined({
          required: keepsStored ? undefined : field.required,
          placeholder: keepsStored
            ? "Leave blank to keep existing"
            : field.placeholder,
          description,
          options,
          min,
          max,
          unit,
        }),
      };
    });
}

/** A number as typed. What cannot be read is left for validation to name. */
function toNumber(text: string): number | string {
  const parsed = Number(text);
  return Number.isNaN(parsed) ? text : parsed;
}

/**
 * Form values → the config bag the API takes, each value typed by its field.
 * Blank means absent. Text is trimmed; a secret is sent exactly as typed.
 */
export function formToConfig(
  fields: ConnectorField[],
  values: ConfigFormValues,
): ConnectorConfig {
  const config: ConnectorConfig = {};
  for (const field of fields) {
    const value = values[field.key];
    if (typeof value === "boolean") {
      config[field.key] = value;
      continue;
    }
    const text = isSecretField(field) ? value : value?.trim();
    if (!text?.trim()) continue;
    config[field.key] = field.type === "number" ? toNumber(text) : text;
  }
  return config;
}

/**
 * A stored config (as `GET /api/connections/[id]` returns it) → form state.
 * The server never sends a secret; this would not pre-fill one if it did.
 */
export function configToForm(
  fields: ConnectorField[],
  stored: ConnectorConfig,
): ConnectionFormState {
  const config: ConfigFormValues = {};
  for (const field of fields) {
    const value = stored[field.key];
    if (isSecretField(field) || value === undefined || value === null) continue;
    config[field.key] = typeof value === "boolean" ? value : String(value);
  }
  return {
    name: "",
    maxRows: stored.maxRows === undefined ? "" : String(stored.maxRows),
    config,
  };
}

/** The row cap as the API takes it; `undefined` when left blank. */
export function maxRowsOf(form: ConnectionFormState): number | undefined {
  return form.maxRows.trim() ? Number(form.maxRows) : undefined;
}

function maxRowsError(form: ConnectionFormState): string | undefined {
  const value = maxRowsOf(form);
  const { min, max } = MAX_ROWS_BOUNDS;
  const valid =
    value === undefined ||
    (Number.isInteger(value) && value >= min && value <= max);
  return valid
    ? undefined
    : `${MAX_ROWS_FIELD.label} must be between ${min} and ${max}`;
}

/**
 * Every problem with the form at once, keyed by field, so each shows under
 * its own input. The connector's half is `validateConfig` — the very check
 * the server repeats on save.
 */
export function connectionFormErrors(
  descriptor: ConnectorDescriptor,
  form: ConnectionFormState,
  mode: FormMode,
): ConnectionFormErrors {
  const config = formToConfig(descriptor.fields, form.config);
  const { errors } = validateConfig(descriptor, config);
  if (mode === "edit") {
    for (const field of descriptor.fields.filter(isSecretField)) {
      if (config[field.key] === undefined) delete errors[field.key];
    }
  }
  const own: Record<string, string> = {};
  if (!form.name.trim()) own.name = `${NAME_FIELD.label} is required`;
  const rowCap = maxRowsError(form);
  if (rowCap) own.maxRows = rowCap;
  return { own, config: errors };
}

export const hasFormErrors = (errors: ConnectionFormErrors): boolean =>
  Object.keys(errors.own).length + Object.keys(errors.config).length > 0;
