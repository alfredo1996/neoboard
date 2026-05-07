/**
 * @neoboard/enterprise — entry point.
 *
 * The NeoBoard core dynamically imports this module when
 * `NEOBOARD_EDITION=enterprise` is set. It expects a named `register`
 * export that populates the core's extension point registries.
 *
 * See `register.ts` for the implementation.
 */
export { register } from "./register";
export type { EnterpriseRegisterFn } from "./register";
