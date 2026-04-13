/**
 * NeoBoard extension points.
 *
 * Enterprise modules register handlers into these points via
 * `bootstrapExtensions()` at app startup. The core app reads
 * registered handlers at runtime to invoke enterprise behavior.
 *
 * Adding a new extension point:
 * 1. Define the handler type in `types.ts`
 * 2. Add a `createExtensionPoint<NewType>()` entry below
 * 3. Core code reads `extensions.newPoint.getAll()` where needed
 */

import { createExtensionPoint } from "./registry";
import type {
  AuthProviderExtension,
  PermissionExtension,
  ResourceFilterExtension,
  RoleProviderExtension,
} from "./types";

export const extensions = {
  /** NextAuth providers contributed by enterprise (SSO). */
  authProviders: createExtensionPoint<AuthProviderExtension>(),
  /** Chain-of-responsibility permission checkers (custom roles, groups). */
  permissionCheckers: createExtensionPoint<PermissionExtension>(),
  /** Resource list filters (e.g. group-scoped dashboards). */
  resourceFilters: createExtensionPoint<ResourceFilterExtension>(),
  /** Custom role definitions beyond admin/creator/reader. */
  roleProviders: createExtensionPoint<RoleProviderExtension>(),
} as const;

export type Extensions = typeof extensions;

export { createExtensionPoint, type ExtensionPoint } from "./registry";

export type {
  AuthProviderExtension,
  PermissionExtension,
  PermissionContext,
  PermissionDecision,
  ResourceFilterExtension,
  RoleDefinition,
  RoleProviderExtension,
} from "./types";
