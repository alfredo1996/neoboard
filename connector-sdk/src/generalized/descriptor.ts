/**
 * Connector descriptor — everything a connector IS, as plain data (#1897).
 *
 * The connector declares WHAT it needs (fields, their types and constraints);
 * NeoBoard decides HOW that looks. So a descriptor carries no layout, class
 * names, components or test ids, and it is JSON-serializable: the server can
 * hand it to the browser, which must never import a database driver.
 */

import { validateUri } from "./validate-uri";

/** One value a connector needs in its config bag. */
export interface ConnectorField {
  /** Key in the config bag. This is the STORED key — renaming it is a data migration. */
  key: string;
  /** Human-readable name. A unit belongs in `unit`, not here. */
  label: string;
  /**
   * `password` values are secrets — a descriptor may have several. They must
   * never be logged or sent back to a client.
   * `uri` values are validated against `protocols`.
   * `number` values are integers (no connector option needs a fraction yet).
   */
  type: "text" | "password" | "number" | "select" | "boolean" | "uri";
  /** `connection` = what it takes to connect; `advanced` = tuning with a sensible default. */
  group: "connection" | "advanced";
  required?: boolean;
  /** Example or default shown in an empty input. Never applied as a value. */
  placeholder?: string;
  description?: string;
  /** `select` only — required there. */
  options?: { label: string; value: string }[];
  /** `number` only — inclusive bounds. */
  min?: number;
  max?: number;
  /** `number` only — e.g. "ms". */
  unit?: string;
  /** `uri` only — required there. Accepted schemes WITH the colon, e.g. `["mydb:", "mydb+tls:"]`. */
  protocols?: string[];
}

/** A connector as pure data. `toDescriptor(plugin)` produces one from a plugin. */
export interface ConnectorDescriptor {
  /** Unique string identifier. Used in the database, URLs and API payloads. */
  type: string;
  /** Human-readable display name. */
  label: string;
  /** Grouping, and the fallback icon when `iconSvg` is absent. */
  category: "database" | "graph" | "api" | "file";
  /** Inline SVG markup, at most {@link MAX_ICON_SVG_BYTES}. Rendered as an image, never as DOM. */
  iconSvg?: string;
  /** Query-editor language key: "cypher", "sql", … Unknown or absent means plain text. */
  queryLanguage?: string;
  /** Does this connector return graph data (nodes and relationships)? */
  supportsGraphData?: boolean;
  /** Does this connector support write queries? */
  supportsWrite?: boolean;
  /** Every value the connector reads from its config bag. */
  fields: ConnectorField[];
}

/**
 * The one bag a connector is built from: `field.key → value`, as stored on the
 * connection. The connector reads its own keys and ignores the rest — NeoBoard
 * keeps settings of its own (the row cap) on the same stored config. By
 * contract it arrives validated against the descriptor ({@link validateConfig});
 * the API routes adopt that in #1901, so read it defensively until then.
 */
export type ConnectorConfig = Record<string, unknown>;

/** Largest `iconSvg` the registry accepts — it is inlined into every descriptor response. */
export const MAX_ICON_SVG_BYTES = 16 * 1024;

const DESCRIPTOR_KEYS = [
  "type",
  "label",
  "category",
  "iconSvg",
  "queryLanguage",
  "supportsGraphData",
  "supportsWrite",
] as const;

const FIELD_KEYS = [
  "key",
  "label",
  "type",
  "group",
  "required",
  "placeholder",
  "description",
  "min",
  "max",
  "unit",
] as const;

function pick<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * The plain-data half of a plugin: no functions, safe to serialize and send to
 * the browser. Copies only the keys the contract declares, so nothing else an
 * author hung on the plugin object can ride along.
 */
export function toDescriptor(plugin: ConnectorDescriptor): ConnectorDescriptor {
  return {
    ...pick(plugin, DESCRIPTOR_KEYS),
    fields: plugin.fields.map((field) => ({
      ...pick(field, FIELD_KEYS),
      ...(field.options && {
        options: field.options.map(({ label, value }) => ({ label, value })),
      }),
      ...(field.protocols && { protocols: [...field.protocols] }),
    })),
  };
}

export interface ConfigValidation {
  /** The declared, non-empty values. Unknown keys are gone. */
  config: ConnectorConfig;
  /** `field.key → message`. Empty when the config is valid. */
  errors: Record<string, string>;
}

function fieldError(field: ConnectorField, value: unknown): string | null {
  const { label } = field;
  switch (field.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${label} must be a number`;
      }
      if (!Number.isInteger(value)) return `${label} must be a whole number`;
      if (field.min !== undefined && value < field.min) {
        return `${label} must be at least ${field.min}`;
      }
      if (field.max !== undefined && value > field.max) {
        return `${label} must be at most ${field.max}`;
      }
      return null;
    }
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `${label} must be true or false`;
    case "select": {
      const allowed = (field.options ?? []).map((option) => option.value);
      return allowed.includes(value as string)
        ? null
        : `${label} must be one of: ${allowed.join(", ")}`;
    }
    case "uri": {
      if (typeof value !== "string") return `${label} must be text`;
      try {
        validateUri(value, field.protocols ?? []);
      } catch (error) {
        return (error as Error).message;
      }
      // Connectors take credentials from their own fields, so a password here
      // does nothing except sit in a text input, a cache key and any error
      // that quotes the URI. A bare username is a documented form and not a
      // secret, so it stays accepted (#1303).
      return new URL(value).password
        ? "Do not put a password in the URI — use the password field."
        : null;
    }
    default:
      return typeof value === "string" ? null : `${label} must be text`;
  }
}

/**
 * Validate a config bag against a descriptor. Pure: same input, same output,
 * nothing thrown, nothing logged, the input untouched. An error message names
 * the field and the rule, never the value — a value may be a secret.
 *
 * Unknown keys are stripped rather than rejected, so a config written by a
 * newer or older version of a connector still loads.
 */
export function validateConfig(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig,
): ConfigValidation {
  const out: ConfigValidation = { config: {}, errors: {} };
  for (const field of descriptor.fields) {
    const value = config[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.required) out.errors[field.key] = `${field.label} is required`;
      continue;
    }
    const error = fieldError(field, value);
    if (error) out.errors[field.key] = error;
    else out.config[field.key] = value;
  }
  return out;
}
