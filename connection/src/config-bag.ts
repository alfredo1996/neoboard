/**
 * Reading the built-in connectors' values out of the one config bag they are
 * built from (#1897). The bag is validated against the descriptor before it
 * gets here; these readers still refuse a wrong type, because a driver option
 * is the wrong place to discover that it was not.
 */

import {
  AuthType,
  type AuthConfig,
  type ConnectorConfig,
  type ConnectorDescriptor,
} from "@neoboard/connector-sdk";

export const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

export const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * Username/password auth for a driver, from the bag. `authType` is not a
 * descriptor field: the app never stores one, so it is NATIVE unless a caller
 * passes it explicitly (connector SSO is a separate, unshipped feature).
 */
export function toAuthConfig(config: ConnectorConfig): AuthConfig {
  return {
    uri: optionalString(config.uri) ?? "",
    username: optionalString(config.username) ?? "",
    password: optionalString(config.password) ?? "",
    authType:
      "authType" in config ? (config.authType as AuthType) : AuthType.NATIVE,
  };
}

/** The schemes the descriptor's `uri` field accepts — the only list there is. */
export function uriProtocols(descriptor: ConnectorDescriptor): string[] {
  return descriptor.fields.find((f) => f.type === "uri")?.protocols ?? [];
}
