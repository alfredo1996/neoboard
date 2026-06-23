/**
 * Required-field check for the connection create form (#1043).
 *
 * Returns the labels of all missing required fields so the dialog can show
 * them together in one styled inline alert, instead of the native browser
 * tooltip surfacing them one at a time.
 */
export interface RequiredConnectionFields {
  name: string;
  uri: string;
  username: string;
  password: string;
}

export function missingRequiredConnectionFields(
  fields: RequiredConnectionFields,
): string[] {
  const missing: string[] = [];
  if (!fields.name.trim()) missing.push("Name");
  if (!fields.uri.trim()) missing.push("URI");
  if (!fields.username.trim()) missing.push("Username");
  if (!fields.password.trim()) missing.push("Password");
  return missing;
}
