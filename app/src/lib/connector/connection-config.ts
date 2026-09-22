import {
  validateConfig,
  type ConnectorConfig,
  type ConnectorDescriptor,
} from "@neoboard/connector-sdk";
import { apiError } from "@/lib/api/api-response";
import { getConnector } from "./connection-adapter";
import { isSecretField } from "./connection-form";

/**
 * What the connections routes do to a connection config, all of it read off
 * the connector's descriptor (#1901). Server-side only: `getConnector` reaches
 * the registry, which pulls in the database drivers.
 *
 * The app owns exactly one key on the stored config, `maxRows` (its row-limit
 * policy); every other key belongs to the connector and is declared by it.
 */

type Descriptor = Pick<ConnectorDescriptor, "fields">;

const isBlank = (value: unknown) =>
  value === undefined || value === null || value === "";

/**
 * A stored config as it may leave the server: the declared, non-secret values
 * plus `maxRows`. A whitelist, not a blacklist — a stored key the descriptor
 * does not declare may be a secret from another version of the connector, so
 * it stays here. With no descriptor (the connector was uninstalled) nothing
 * can be told apart, and nothing is returned.
 */
export function redactConfig(
  descriptor: Descriptor | undefined,
  stored: ConnectorConfig,
): ConnectorConfig | undefined {
  if (!descriptor) return undefined;
  const safe: ConnectorConfig = {};
  for (const field of descriptor.fields) {
    if (!isSecretField(field) && stored[field.key] !== undefined) {
      safe[field.key] = stored[field.key];
    }
  }
  if (stored.maxRows !== undefined) safe.maxRows = stored.maxRows;
  return safe;
}

/**
 * An update replaces the config, except that a secret left blank or out keeps
 * its stored value — the client never had it to send back. Nothing else is
 * carried over, so a stored key the descriptor no longer declares is gone
 * after the next save.
 */
export function keepStoredSecrets(
  descriptor: Descriptor,
  incoming: ConnectorConfig,
  stored: ConnectorConfig,
): ConnectorConfig {
  const merged = { ...incoming };
  for (const { key } of descriptor.fields.filter(isSecretField)) {
    if (isBlank(merged[key])) merged[key] = stored[key];
  }
  return merged;
}

/**
 * Validate a config against its connector's descriptor. On success the config
 * holds the declared values and `maxRows` — unknown keys are gone, so nothing
 * undeclared is ever encrypted. On failure, a 400 whose `details.fields` maps
 * each offending field to its message; `validateConfig` names the field and
 * the rule, never the value, because a value may be a secret.
 *
 * An update passes the `stored` config, and validation then runs on the
 * merged result ({@link keepStoredSecrets}) — so a kept secret is validated
 * like a typed one and an error about it still cannot quote it. With no
 * `stored` (a create, or an old config that could not be decrypted) there is
 * nothing to keep, and a required secret left blank fails.
 *
 * `maxRows` is checked by the route's zod schema before this runs.
 */
export function validateConnectionConfig(
  type: string,
  config: ConnectorConfig,
  stored?: ConnectorConfig,
):
  | { success: true; config: ConnectorConfig }
  | { success: false; response: ReturnType<typeof apiError> } {
  const descriptor = getConnector(type);
  if (!descriptor) {
    return {
      success: false,
      response: apiError("VALIDATION_ERROR", "Unknown connector type"),
    };
  }
  const { maxRows, ...bag } = config;
  const { config: declared, errors } = validateConfig(
    descriptor,
    stored ? keepStoredSecrets(descriptor, bag, stored) : bag,
  );
  const [firstMessage] = Object.values(errors);
  if (firstMessage) {
    return {
      success: false,
      response: apiError("VALIDATION_ERROR", firstMessage, { fields: errors }),
    };
  }
  return {
    success: true,
    config: maxRows === undefined ? declared : { ...declared, maxRows },
  };
}
