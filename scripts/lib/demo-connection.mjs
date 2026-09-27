/**
 * The `connection` columns `scripts/seed-demo.mjs` writes (#2048).
 *
 * Demo connections are shared with the workspace, the state "Share with
 * workspace" sets from the UI, so every demo persona can build widgets on
 * them. The column default is `private` (owner + admins only), which left
 * creator@ with no connection to pick. Writes on the "(demo, write)"
 * connection stay gated by `can_write`, as on any shared connection.
 *
 * Keys are the table's column names, for postgres.js `sql(row)`.
 */

/** @param {string} configEncrypted */
export function demoConnectionUpdate(configEncrypted) {
  return { configEncrypted, visibility: "shared" };
}

/**
 * @param {{ id: string, userId: string, name: string, type: string, configEncrypted: string }} row
 */
export function demoConnectionInsert({
  id,
  userId,
  name,
  type,
  configEncrypted,
}) {
  return { id, userId, name, type, ...demoConnectionUpdate(configEncrypted) };
}
