import { DEFAULT_CONNECTION_CONFIG } from "./interfaces";

/**
 * The timeout (ms) a connector enforces for one query: the caller's explicit
 * per-query override (`config.timeout`), else the connector's own configured
 * default — the timeout field IT declares, read from its config bag — else
 * `DEFAULT_CONNECTION_CONFIG.timeout`, read at call time.
 *
 * Only a positive finite number counts. Unset, zero or junk falls through to
 * the next source, so a query is never left unbounded (#1302).
 */
export function resolveQueryTimeout(
  override: unknown,
  configured?: unknown,
): number {
  const ms = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : undefined;
  return ms(override) ?? ms(configured) ?? DEFAULT_CONNECTION_CONFIG.timeout;
}
