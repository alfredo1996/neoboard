# Issue #35 — API Key Authentication for Programmatic Access

**Date:** 2026-03-14
**Milestone:** v0.7 — API & Developer Experience
**Branch:** `feat/issue-35-api-key-auth`
**Base:** `dev`
**PR target:** `dev`

---

## Summary

Add API key authentication so users can make programmatic requests without browser session cookies. Users generate named API keys via a REST endpoint; the plaintext key is shown once and never stored. All subsequent requests use `Authorization: Bearer <key>` to authenticate. Keys are SHA-256 hashed at rest, scoped to a user and tenant, support optional expiration, and can be revoked. A key management UI in a new user settings page allows listing and revoking keys.

---

## Architecture Decisions

### AD-1: SHA-256 hashing (not bcrypt) for key storage

The issue explicitly calls out SHA-256 as the hashing algorithm. Rationale: API key auth runs on every request in the middleware hot path. bcrypt's intentional slowness (100-300ms per verification) is unacceptable for programmatic API traffic that may fire dozens of requests per second. SHA-256 is appropriate here because API keys are high-entropy random tokens (not user-chosen passwords), making brute-force infeasible. We use `crypto.createHash('sha256')` from Node.js built-ins.

### AD-2: Key format — `nb_` prefix + 32 random bytes (hex)

Generated keys follow the pattern `nb_<64-hex-chars>` (32 bytes of `crypto.randomBytes` encoded as hex). The `nb_` prefix lets users and log scanners identify NeoBoard API keys at a glance. The prefix is NOT included in the hash — the full key string (including prefix) is hashed.

### AD-3: Dual auth path — middleware + route-level resolution

The Next.js middleware (`app/src/middleware.ts`) currently uses `getToken()` from `next-auth/jwt` to check for session JWTs. We extend it to also accept `Authorization: Bearer nb_...` headers. When a Bearer token is detected with the `nb_` prefix, middleware skips the JWT check and allows the request through. The actual user context resolution happens in the API route layer via an updated `requireSession()` / `requireUserId()` that checks for the API key header and resolves it to a user.

**Why not resolve in middleware?** Next.js Edge Middleware cannot use the `postgres` driver (Node.js APIs). We keep the middleware lightweight: it only checks "is there a valid JWT OR a Bearer key header?" and lets the route handler (running in Node.js) do the DB lookup.

### AD-4: Session resolution refactor — `resolveAuth()` helper

Create a new internal helper `resolveAuth()` in `app/src/lib/auth/api-key.ts` that:
1. Checks for `Authorization: Bearer nb_...` header
2. If present: SHA-256 hashes the key, looks up `api_keys` table, validates expiry, updates `lastUsedAt`, returns user context
3. If not present: falls back to `auth()` (next-auth session)

The existing `requireSession()` and `requireUserId()` in `session.ts` are updated to call `resolveAuth()` first, falling back to the existing session-based auth. This means **all existing API routes automatically support API key auth** with zero changes to individual route files.

### AD-5: `api_keys` table with tenant scoping

New Drizzle schema table with `tenant_id` column (matching the multi-tenancy pattern on `dashboards`, `dashboard_shares`, `widget_templates`). The tenant is stamped from the creating user's session at key creation time.

### AD-6: Settings page — new route group

Create `/settings/api-keys` as a new page under the dashboard layout. Add a "Settings" link (with a Cog icon) to the sidebar. The page renders inline (no separate component/ package changes needed) since it's a simple table + create dialog. Per CLAUDE.md, UI components in `app/` are tested via Playwright E2E, not Vitest render tests.

### AD-7: Request header access in route handlers

Next.js App Router route handlers receive the standard `Request` object. We use `request.headers.get("authorization")` to extract the Bearer token. For `requireSession()` / `requireUserId()` which don't receive the request object, we use `headers()` from `next/headers` (available in server components and route handlers).

---

## Affected Packages

| Package | Files Changed | Reason |
|---------|--------------|--------|
| `app/` | schema, migration, middleware, auth helpers, API routes, settings page, E2E tests | Core feature implementation |
| `component/` | None | No new reusable components needed; settings page uses existing shadcn primitives |
| `connection/` | None | No DB adapter changes |

---

## Ordered Tasks

### Phase 1: Database Schema & Migration — Size: S

#### Task 1.1 — Add `api_keys` table to Drizzle schema

**Files to create/modify:**

| File | Change |
|------|--------|
| `app/src/lib/db/schema.ts` | Add `apiKeys` table definition |

**Schema definition:**
```typescript
export const apiKeys = pgTable("api_key", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("default"),
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});
```

Add inferred types:
```typescript
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
```

**Tests:** None at this layer (schema is declarative). Tested transitively by route tests and E2E.

#### Task 1.2 — Create database migration

**Files to create:**

| File | Change |
|------|--------|
| `app/drizzle/migrations/0010_api_keys.sql` | Idempotent migration SQL |
| `app/drizzle/migrations/meta/_journal.json` | Add entry for migration 0010 |
| `app/drizzle/migrations/meta/0010_snapshot.json` | Generated snapshot |

**Migration SQL pattern** (follows existing idempotent pattern):
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'api_key'
  ) THEN
    CREATE TABLE "api_key" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "tenant_id" text NOT NULL DEFAULT 'default',
      "key_hash" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "last_used_at" timestamp,
      "expires_at" timestamp,
      "created_at" timestamp DEFAULT now()
    );
    CREATE INDEX "api_key_key_hash_idx" ON "api_key" ("key_hash");
    CREATE INDEX "api_key_user_id_idx" ON "api_key" ("userId");
  END IF;
END $$;
```

Note: `key_hash` has both a UNIQUE constraint (for correctness) and a separate index (for lookup performance). The unique constraint implicitly creates an index in PostgreSQL, so the explicit index may be omitted — but it documents intent.

**Tests:** Migration tested by E2E global-setup (which runs all migrations) and by the existing `migrations.test.ts` pattern.

#### Task 1.3 — Update E2E seed data

**Files to modify:**

| File | Change |
|------|--------|
| `docker/postgres/seed-neoboard.sql` | No changes needed — api_keys table starts empty; keys are created via the API during tests |

---

### Phase 2: API Key Hashing & Auth Resolution — Size: M

#### Task 2.1 — Create API key utility module

**Files to create:**

| File | Purpose |
|------|---------|
| `app/src/lib/auth/api-key.ts` | Key generation, hashing, and auth resolution |
| `app/src/lib/auth/__tests__/api-key.test.ts` | Unit tests (Vitest) |

**`api-key.ts` exports:**

```typescript
/** Generate a new API key. Returns { plaintext, hash }. */
export function generateApiKey(): { plaintext: string; hash: string }

/** Hash a plaintext API key with SHA-256. */
export function hashApiKey(plaintext: string): string

/** Resolve an API key from the Authorization header to a user context.
 *  Returns null if no API key header is present.
 *  Throws if key is invalid, expired, or revoked. */
export async function resolveApiKeyAuth(): Promise<{
  userId: string;
  role: UserRole;
  canWrite: boolean;
  tenantId: string;
} | null>
```

**Implementation details:**
- `generateApiKey()`: uses `crypto.randomBytes(32).toString('hex')`, prepends `nb_` prefix
- `hashApiKey()`: `crypto.createHash('sha256').update(plaintext).digest('hex')`
- `resolveApiKeyAuth()`: reads `headers()` from `next/headers`, extracts Bearer token, checks `nb_` prefix, hashes it, looks up in `api_keys` table joined with `users`, validates `expiresAt`, updates `lastUsedAt` (fire-and-forget), returns user context

**TDD tests (Vitest, mocked DB):**
1. `generateApiKey` returns key with `nb_` prefix and 64 hex chars after prefix
2. `generateApiKey` returns different keys on successive calls
3. `hashApiKey` returns consistent SHA-256 hex digest
4. `hashApiKey` produces different hashes for different keys
5. `resolveApiKeyAuth` returns null when no Authorization header present
6. `resolveApiKeyAuth` returns null when Authorization header is not Bearer
7. `resolveApiKeyAuth` returns null when Bearer token lacks `nb_` prefix (falls back to session auth)
8. `resolveApiKeyAuth` throws when key hash not found in DB
9. `resolveApiKeyAuth` throws when key is expired
10. `resolveApiKeyAuth` returns user context for valid non-expired key
11. `resolveApiKeyAuth` returns user context for key with no expiry (null expiresAt)
12. `resolveApiKeyAuth` updates lastUsedAt on successful resolution

#### Task 2.2 — Update session helpers to support API key auth

**Files to modify:**

| File | Change |
|------|--------|
| `app/src/lib/auth/session.ts` | Update `requireSession()` and `requireUserId()` to try API key auth first |

**Change in `requireSession()`:**
```typescript
export async function requireSession() {
  // Try API key auth first (returns null if no API key header)
  const apiKeyAuth = await resolveApiKeyAuth();
  if (apiKeyAuth) return apiKeyAuth;

  // Fall back to session-based auth
  const session = await auth();
  // ... existing logic
}
```

**Change in `requireUserId()`:**
```typescript
export async function requireUserId() {
  // Try API key auth first
  const apiKeyAuth = await resolveApiKeyAuth();
  if (apiKeyAuth) return apiKeyAuth.userId;

  // Fall back to session-based auth
  const session = await auth();
  // ... existing logic
}
```

**Tests:** Update existing session tests to verify API key auth integration. Add tests that mock `resolveApiKeyAuth` to return a user context and verify that `requireSession` / `requireUserId` use it.

#### Task 2.3 — Update Next.js middleware to allow API key Bearer tokens

**Files to modify:**

| File | Change |
|------|--------|
| `app/src/middleware.ts` | Allow requests with `Authorization: Bearer nb_...` header to pass through without JWT check |

**Updated middleware logic:**
```typescript
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Allow API key authenticated requests (actual validation happens in route handlers)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer nb_")) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
```

**Important:** The middleware only checks that the header **looks like** an API key (has `nb_` prefix). Actual validation (hash lookup, expiry check) happens in the route handler via `requireSession()` → `resolveApiKeyAuth()`. This keeps the Edge Middleware lightweight and avoids requiring Node.js crypto/DB drivers at the edge.

**Security note:** API key requests to non-API routes (e.g., page routes) are allowed through middleware but will fail at the page level since pages use session-based rendering. This is acceptable — programmatic clients only use API routes.

**Tests:** Middleware is tested via E2E (Playwright). No Vitest render tests for middleware per CLAUDE.md rules.

---

### Phase 3: API Key Management Routes — Size: M

#### Task 3.1 — POST /api/keys — Create API key

**Files to create:**

| File | Purpose |
|------|---------|
| `app/src/app/api/keys/route.ts` | GET (list) and POST (create) handlers |
| `app/src/app/api/keys/__tests__/route.test.ts` | Vitest unit tests |

**POST /api/keys request body:**
```json
{
  "name": "My CI Key",
  "expiresAt": "2027-01-01T00:00:00.000Z"  // optional
}
```

**POST /api/keys response (201):**
```json
{
  "id": "uuid",
  "name": "My CI Key",
  "key": "nb_abc123...",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "2026-03-14T..."
}
```

The `key` field contains the plaintext key. It is returned **only** in the creation response, never stored, and never retrievable again.

**Implementation:**
1. `requireSession()` — get userId, tenantId
2. Validate body with Zod schema (`name` required string, `expiresAt` optional ISO date string)
3. Call `generateApiKey()` to get plaintext + hash
4. Insert into `api_keys` table: `{ userId, tenantId, keyHash: hash, name, expiresAt }`
5. Return `{ id, name, key: plaintext, expiresAt, createdAt }`

**TDD tests:**
1. Returns 401 when unauthenticated
2. Returns 400 when name is missing
3. Returns 400 when name is empty string
4. Returns 201 with generated key on valid request
5. Returns 201 with null expiresAt when not provided
6. Returned key starts with `nb_` prefix
7. Stores SHA-256 hash in DB, not plaintext
8. Stores tenantId from session

#### Task 3.2 — GET /api/keys — List user's API keys

**In same file:** `app/src/app/api/keys/route.ts`

**GET /api/keys response (200):**
```json
[
  {
    "id": "uuid",
    "name": "My CI Key",
    "lastUsedAt": "2026-03-14T...",
    "expiresAt": "2027-01-01T...",
    "createdAt": "2026-03-14T..."
  }
]
```

Note: `keyHash` is NEVER returned in list responses. Users cannot retrieve or reconstruct the key after creation.

**Implementation:**
1. `requireSession()` — get userId, tenantId
2. Select from `api_keys` where `userId` and `tenantId` match
3. Return array of `{ id, name, lastUsedAt, expiresAt, createdAt }` (no keyHash)

**TDD tests:**
1. Returns 401 when unauthenticated
2. Returns empty array when user has no keys
3. Returns list of keys without hash field
4. Only returns keys for the authenticated user (tenant-scoped)

#### Task 3.3 — DELETE /api/keys/[id] — Revoke API key

**Files to create:**

| File | Purpose |
|------|---------|
| `app/src/app/api/keys/[id]/route.ts` | DELETE handler |
| `app/src/app/api/keys/[id]/__tests__/route.test.ts` | Vitest unit tests |

**DELETE /api/keys/:id response (200):**
```json
{ "success": true }
```

**Implementation:**
1. `requireSession()` — get userId, tenantId
2. Delete from `api_keys` where `id`, `userId`, AND `tenantId` match (prevents cross-tenant deletion)
3. Return 404 if no rows deleted
4. Return `{ success: true }`

**TDD tests:**
1. Returns 401 when unauthenticated
2. Returns 404 when key doesn't exist
3. Returns 404 when key belongs to different user (no cross-user deletion)
4. Returns 200 and deletes key on valid request
5. Deleted key can no longer authenticate (integration-level, tested in E2E)

---

### Phase 4: Settings UI — Size: M

#### Task 4.1 — Create Settings / API Keys page

**Files to create:**

| File | Purpose |
|------|---------|
| `app/src/app/(dashboard)/settings/api-keys/page.tsx` | API key management page |
| `app/src/hooks/use-api-keys.ts` | TanStack Query hook for API key CRUD |

**Page features:**
- Table listing all API keys: name, created date, last used date, expiry, revoke button
- "Create API Key" button opens a dialog
- Dialog: name input (required), optional expiry date picker, "Generate" button
- After generation: show the plaintext key in a read-only input with copy button
- Warning text: "This key will only be shown once. Copy it now."
- Revoke confirmation dialog before deletion

**Hook (`use-api-keys.ts`):**
```typescript
export function useApiKeys() {
  // GET /api/keys — list
  const query = useQuery({ queryKey: ["api-keys"], queryFn: ... });

  // POST /api/keys — create
  const createMutation = useMutation({ mutationFn: ..., onSuccess: invalidate });

  // DELETE /api/keys/:id — revoke
  const revokeMutation = useMutation({ mutationFn: ..., onSuccess: invalidate });

  return { keys: query.data, isLoading: query.isLoading, create, revoke };
}
```

#### Task 4.2 — Add Settings link to sidebar

**Files to modify:**

| File | Change |
|------|--------|
| `app/src/app/(dashboard)/layout.tsx` | Add Settings sidebar item with Cog icon, linking to `/settings/api-keys` |

**Sidebar addition** (after Widget Lab, before Sign Out):
```tsx
<SidebarItem
  icon={<Settings className="h-4 w-4" />}
  label="Settings"
  active={pathname.startsWith("/settings")}
  collapsed={collapsed}
  onClick={() => router.push("/settings/api-keys")}
/>
```

---

### Phase 5: E2E Tests — Size: M

#### Task 5.1 — API key E2E tests

**Files to create:**

| File | Purpose |
|------|---------|
| `app/e2e/api-keys.spec.ts` | E2E tests for API key flow |
| `app/e2e/pages/settings.ts` | Page object for settings page |

**E2E test scenarios:**
1. Navigate to Settings > API Keys page
2. Create a new API key with a name — verify key is displayed once
3. Copy key and verify it appears in the key list
4. Use the API key to authenticate a programmatic request (e.g., GET /api/dashboards with Bearer header)
5. Revoke the key — verify it disappears from the list
6. Verify revoked key returns 401 on subsequent API request
7. Create a key with expiry — verify it appears with expiry date
8. Verify expired key returns 401 (would need time manipulation or very short expiry — may skip in E2E)

---

## Migration Needed?

**Yes.** One forward-only, idempotent migration (`0010_api_keys.sql`) to create the `api_key` table. Pattern matches existing migrations (advisory lock, IF NOT EXISTS guard).

---

## Security Checklist

- [x] **Plaintext key never stored:** Only SHA-256 hash persisted in `key_hash` column
- [x] **Plaintext key shown once:** Returned only in POST /api/keys response body, never in GET
- [x] **Key hash never exposed:** GET /api/keys excludes `keyHash` from response
- [x] **High-entropy keys:** 32 bytes of `crypto.randomBytes` = 256 bits of entropy
- [x] **SHA-256 appropriate:** API keys are random (not user-chosen), so SHA-256 is sufficient against brute force
- [x] **Tenant isolation:** `tenant_id` on `api_keys` table; all queries filter by tenantId
- [x] **User isolation:** DELETE and SELECT filter by userId — no cross-user access
- [x] **Expiry enforcement:** `resolveApiKeyAuth()` checks `expiresAt` before resolving
- [x] **Revocation immediate:** DELETE removes the row; next auth check fails
- [x] **lastUsedAt updated:** Audit trail for key usage (fire-and-forget update)
- [x] **Middleware bypass limited:** Only `nb_` prefixed tokens skip JWT check; actual validation still happens in route handler
- [x] **No credential logging:** Key plaintext never logged; hash never logged
- [x] **Cascade delete:** `onDelete: cascade` on `userId` FK means deleting a user revokes all their keys

---

## Testing Strategy

| Layer | What | Tool | Location |
|-------|------|------|----------|
| Key generation & hashing | Pure functions | Vitest | `app/src/lib/auth/__tests__/api-key.test.ts` |
| Auth resolution | `resolveApiKeyAuth()` with mocked DB | Vitest | `app/src/lib/auth/__tests__/api-key.test.ts` |
| Session integration | `requireSession()` API key path | Vitest | `app/src/lib/auth/__tests__/session.test.ts` |
| POST /api/keys | Route handler with mocked DB/auth | Vitest | `app/src/app/api/keys/__tests__/route.test.ts` |
| GET /api/keys | Route handler with mocked DB/auth | Vitest | `app/src/app/api/keys/__tests__/route.test.ts` |
| DELETE /api/keys/[id] | Route handler with mocked DB/auth | Vitest | `app/src/app/api/keys/[id]/__tests__/route.test.ts` |
| Settings UI | Page rendering, create/revoke flow | Playwright E2E | `app/e2e/api-keys.spec.ts` |
| Full auth flow | Create key → use key → revoke key | Playwright E2E | `app/e2e/api-keys.spec.ts` |

**Coverage impact:** This feature adds 3 new API route files, 1 utility module, 1 hook, 1 page, and 1 middleware update. All have corresponding Vitest or E2E tests. Estimated +3-5% coverage for `app/` package.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Edge Middleware cannot validate API keys (no DB access) | Medium | Middleware only checks header format; real validation in route handlers. Well-documented in code comments. |
| `lastUsedAt` fire-and-forget update could fail silently | Low | Acceptable — this is audit data, not security-critical. Wrap in try/catch. |
| API key in response body could be logged by proxy/CDN | Medium | Document that API key creation should use HTTPS. Response includes `Cache-Control: no-store` header. |
| SHA-256 vs bcrypt debate | Low | SHA-256 is standard for high-entropy tokens. Documented in AD-1. |
| Settings page adds a new sidebar item | Low | Minimal UI change. Follows existing SidebarItem pattern. |
| `headers()` from `next/headers` is async in Next.js 15 | Medium | Use `await headers()` — Next.js 15 made this async. Test confirms behavior. |

---

## Suggested GitHub Issues

This is a single issue (#35) with a clear scope. No sub-issues are needed. The implementation can be done as one PR with clear commit boundaries:

1. `feat(app): add api_keys schema and migration` (Task 1.1, 1.2)
2. `feat(app): add API key generation and auth resolution` (Task 2.1, 2.2, 2.3)
3. `feat(app): add API key management routes` (Task 3.1, 3.2, 3.3)
4. `feat(app): add settings page with API key management UI` (Task 4.1, 4.2)
5. `test(app): add API key E2E tests` (Task 5.1)

---

## Dependencies

- No new npm packages required. Uses Node.js built-in `crypto` module for SHA-256 and random key generation.
- Existing dependencies: `drizzle-orm`, `zod`, `@tanstack/react-query`, `next-auth`, shadcn/ui components (already installed).
- No changes to `component/` or `connection/` packages.
