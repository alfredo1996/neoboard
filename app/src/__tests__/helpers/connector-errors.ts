/**
 * An error as a connector raises it (#1903): a `ConnectorError` carrying the
 * verdict of that connector's own `classifyError` hook. The app reads the
 * verdict and nothing else, so the message here is opaque on purpose.
 *
 * Built by hand, matching by name as the app does, for the route tests that
 * deliberately do not load the driver-heavy `@neoboard/connection` package.
 * `type` is a `ConnectorErrorType` value.
 */
export function raisedByConnector(
  type: string,
  {
    message = "the driver's own words",
    ...flags
  }: { message?: string; [flag: string]: unknown } = {},
): Error {
  return Object.assign(new Error(message), {
    name: "ConnectorError",
    classification: { type, transient: false, ...flags },
  });
}
