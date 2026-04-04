/** Parse numeric string to integer, or return undefined if empty/invalid. */
export function parseOptionalInt(val: string): number | undefined {
  if (!val.trim()) return undefined;
  const n = Number(val);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

/**
 * Map a decrypted connection config (from the API) into form field strings.
 * Numeric fields are stringified; missing values default to "".
 */
export function mapConfigToEditForm(config: Record<string, unknown>): {
  uri: string;
  username: string;
  database: string;
  connectionTimeout: string;
  queryTimeout: string;
  maxPoolSize: string;
  connectionAcquisitionTimeout: string;
  idleTimeout: string;
  statementTimeout: string;
  sslRejectUnauthorized: boolean | undefined;
} {
  return {
    uri: (config.uri as string) ?? "",
    username: (config.username as string) ?? "",
    database: (config.database as string) ?? "",
    connectionTimeout: config.connectionTimeout?.toString() ?? "",
    queryTimeout: config.queryTimeout?.toString() ?? "",
    maxPoolSize: config.maxPoolSize?.toString() ?? "",
    connectionAcquisitionTimeout:
      config.connectionAcquisitionTimeout?.toString() ?? "",
    idleTimeout: config.idleTimeout?.toString() ?? "",
    statementTimeout: config.statementTimeout?.toString() ?? "",
    sslRejectUnauthorized: config.sslRejectUnauthorized as boolean | undefined,
  };
}
