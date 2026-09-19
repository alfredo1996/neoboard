import { ConnectorError, ConnectorErrorType } from "./ConnectorError";

/** Typed where it is rejected, so no one has to recognise the message later (#1903). */
const badUri = (message: string) =>
  new ConnectorError(message, ConnectorErrorType.BAD_URI);

/**
 * Validates a URI has a valid hostname and port.
 * @param uri - The URI to validate
 * @param allowedProtocols - List of allowed protocol prefixes (e.g., ['postgresql:', 'postgres:'])
 * @throws ConnectorError (`BAD_URI`) if the URI is malformed, missing hostname, or has invalid port
 */
export function validateUri(uri: string, allowedProtocols: string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    // Report the expected shape, never the input. A URI may legitimately
    // carry userinfo (`scheme://user:pass@host`), and this is the one branch
    // that echoed the whole string — so a password could ride the thrown
    // message outward. `redactString` on the API boundary masks it today,
    // but that makes one downstream call site the only thing standing
    // between a credential and a response body. The caller already has the
    // string it submitted; echoing it back adds nothing actionable (#1303).
    throw badUri(
      "Invalid URI format — expected scheme://host[:port][/database]",
    );
  }

  if (!parsed.hostname) {
    throw badUri("URI must contain a hostname");
  }

  if (
    allowedProtocols.length > 0 &&
    !allowedProtocols.includes(parsed.protocol)
  ) {
    throw badUri(
      `Invalid URI protocol "${parsed.protocol}". Expected one of: ${allowedProtocols.join(", ")}`,
    );
  }

  if (parsed.port) {
    const port = Number.parseInt(parsed.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      throw badUri(`Invalid port in URI: "${parsed.port}"`);
    }
  }
}
