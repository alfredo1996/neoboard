/**
 * Enterprise bootstrap — called by the core's `bootstrapExtensions()`
 * when the NeoBoard instance is running in enterprise edition.
 *
 * The `extensions` argument is the core's extension registry singleton.
 * Each enterprise feature should register its handlers here without
 * modifying any core files.
 *
 * The type is intentionally loose (`Record<string, unknown>`) because the
 * core's `Extensions` type is defined in `alfredo1996/neoboard` and we
 * don't want a hard dependency on the core sources at type-check time.
 * Cast inside each feature's register function if you need the specific
 * extension point type.
 */
export type Extensions = Record<string, unknown>;

export type EnterpriseRegisterFn = (extensions: Extensions) => void;

export const register: EnterpriseRegisterFn = () => {
  // No features registered yet. Each enterprise feature adds a line here
  // that calls into its own register function. Example (future):
  //
  //   import { registerSsoProviders } from "./auth/sso";
  //   import { registerCustomRoles } from "./auth/custom-roles";
  //   registerSsoProviders(extensions);
  //   registerCustomRoles(extensions);
};
