# Issue #72 — AST-based Code Completion for Query Editor

**Date:** 2026-03-17
**Milestone:** v0.8 -- UX & Charts
**Branch:** `feat/issue-72-code-completion`
**Base:** `dev`
**PR target:** `dev`

---

## Summary

Add context-aware code completion to the query editor (CodeMirror 6) for both Cypher and SQL, powered by the connection's schema. SQL completion uses the already-installed `@codemirror/lang-sql` with its built-in `schemaCompletionSource`. Cypher completion uses the official `@neo4j-cypher/codemirror` package, which replaces the current plain-text Cypher mode with full syntax highlighting and schema-aware autocompletion. The existing `schema-store.ts` and `useConnectionSchema()` hook provide the data pipeline; they need proper typing and a refresh action.

---

## Architecture Decisions

### AD-1: `@neo4j-cypher/codemirror` creates its own EditorView (Integration Pattern)

The `@neo4j-cypher/codemirror` package exposes `createCypherEditor(parentDOMElement, options)` which creates its **own** `EditorView` internally. This is architecturally different from the current approach where `QueryEditor` creates its own `EditorView` and plugs in language extensions.

**Decision:** For Cypher connections, replace the existing self-managed CM6 editor with one created by `createCypherEditor`. The returned `EditorApi` provides `setSchema()`, `setValue()`, `setReadOnly()`, `setTheme()`, `onValueChanged()`, etc. We keep the current self-managed CM6 approach for SQL only.

**Rationale:** Trying to extract individual CM6 extensions from `@neo4j-cypher/codemirror` to plug into our own `EditorView` is fragile and unsupported. The library is designed as a complete editor factory. Using it as intended gives us syntax highlighting, linting, autocompletion, bracket matching, and theme support with minimal glue code.

**Impact on `QueryEditor`:** The component must support two code paths:

- **SQL mode:** Current `EditorView` approach with `@codemirror/lang-sql` + `schemaCompletionSource`.
- **Cypher mode:** Delegate to `createCypherEditor` from `@neo4j-cypher/codemirror`.

Both paths mount into the same container div and expose the same external API (value, onChange, onRun, readOnly).

### AD-2: Schema flows as a prop through the component boundary

`QueryEditor` (in `component/`) receives schema as an optional prop. It does NOT fetch schema or access any store. The `app/` layer (`QueryEditorPanel`) reads from the Zustand schema store and passes it down. This respects the package boundary rule.

**Schema prop type:** A discriminated union `QueryEditorSchema`:

```ts
type QueryEditorSchema =
  | {
      type: "neo4j";
      labels?: string[];
      relationshipTypes?: string[];
      propertyKeys?: string[];
    }
  | { type: "postgresql"; tables: Record<string, string[]> };
```

This is a simplified, UI-focused projection of `DatabaseSchema` from `connection/`. The transformation happens in `app/` (in the `QueryEditorPanel`), not in `component/`.

### AD-3: Schema store gets proper types and `clearSchema` action

Replace `Record<string, any>` in `schema-store.ts` with `DatabaseSchema` from `connection/` (already exported). Add a `clearSchema(connectionId)` action that removes an entry from the Zustand store. The `useConnectionSchema` hook gets a `refreshSchema` helper that invalidates the TanStack Query cache and clears the Zustand entry.

### AD-4: SQL completion uses `PostgreSQL` dialect with `schemaCompletionSource`

The `@codemirror/lang-sql` `sql()` function accepts `{ dialect: PostgreSQL, schema: { tableName: ['col1', 'col2'] } }`. The schema transformer converts `DatabaseSchema.tables` (array of `TableDef`) to the `SQLNamespace` format (`Record<string, string[]>`). This is a pure function living in `component/src/lib/`.

### AD-5: CSS for Cypher editor imported via dynamic CSS loading

`@neo4j-cypher/codemirror` ships a CSS file (`css/cypher-codemirror.css`). It must be imported when the Cypher editor mounts. Since the component library uses dynamic imports for CM6, the CSS is imported in the same dynamic code path.

---

## Affected Packages

| Package       | Files Changed                                           | Reason                                                                         |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `component/`  | `query-editor.tsx`, `composed/index.ts`, `package.json` | New schema prop, Cypher editor integration, new dependency                     |
| `component/`  | NEW `lib/schema-transforms.ts`                          | Pure functions: `DatabaseSchema` -> SQL/Cypher completion format               |
| `app/`        | `schema-store.ts`, `use-schema.ts`                      | Proper typing, `clearSchema`, `refreshSchema`                                  |
| `app/`        | `query-editor-panel.tsx`                                | Read schema from store, transform, pass as prop, prefetch on connection select |
| `app/`        | `widget-editor-modal.tsx`                               | Wire `useConnectionSchema` prefetch on connection select                       |
| `connection/` | None                                                    | Types already exported; no changes needed                                      |

---

## Ordered Tasks

### Phase 1: Schema Store & Types (S -- foundation, no UI changes)

#### Task 1.1 -- Type the Schema Store (Size: S)

**Files to modify:**

| File                                            | Change                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `app/src/stores/schema-store.ts`                | Replace `Record<string, any>` with `DatabaseSchema` from `connection`. Add `clearSchema(connectionId)` action.         |
| `app/src/stores/__tests__/schema-store.test.ts` | Add tests for `clearSchema` action and typed schema.                                                                   |
| `app/src/hooks/use-schema.ts`                   | Replace `Record<string, any>` with `DatabaseSchema`. Add `refreshSchema` to invalidate TanStack Query + clear Zustand. |
| `app/src/hooks/__tests__/use-schema.test.ts`    | NEW: Test `useConnectionSchema` query key, enabled flag, and `refreshSchema` invalidation.                             |

**TDD sequence:**

1. RED: Write test for `clearSchema` -- call it and verify `getSchema` returns `undefined`.
2. GREEN: Add `clearSchema` to the store.
3. RED: Write test for typed schema (store accepts `DatabaseSchema` type).
4. GREEN: Update type from `Record<string, any>` to `DatabaseSchema`.
5. RED: Write test for `use-schema.ts` `refreshSchema` -- mock `useQueryClient` and verify `invalidateQueries` is called.
6. GREEN: Implement `refreshSchema`.

**Acceptance criteria:**

- `schema-store.ts` uses `DatabaseSchema` from `connection/src/schema/types`.
- `clearSchema(connectionId)` removes the entry.
- `useConnectionSchema` returns typed `DatabaseSchema`.
- `refreshSchema(connectionId)` invalidates TanStack Query + clears Zustand.

---

### Phase 2: SQL Completion (S -- already installed, wiring only)

#### Task 2.1 -- Schema Transform for SQL (Size: S)

**Files to modify:**

| File                                                    | Change                                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `component/src/lib/schema-transforms.ts`                | NEW: `toSqlSchema(schema): Record<string, string[]>` -- converts `{tables: [{name, columns: [{name}]}]}` to `{tableName: ['col1', 'col2']}`. |
| `component/src/lib/__tests__/schema-transforms.test.ts` | NEW: Unit tests for `toSqlSchema`.                                                                                                           |

**TDD sequence:**

1. RED: Write test -- given `{type:'postgresql', tables:[{name:'users', columns:[{name:'id',type:'integer',nullable:false},{name:'email',type:'text',nullable:false}]}]}`, expect `{users: ['id', 'email']}`.
2. GREEN: Implement `toSqlSchema`.
3. RED: Test empty tables array returns `{}`.
4. GREEN: Handle edge case.
5. RED: Test 500+ tables performance (< 10ms).
6. GREEN: Verify (should be trivially fast).

#### Task 2.2 -- Wire SQL Schema into QueryEditor (Size: S)

**Files to modify:**

| File                                                                | Change                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component/src/components/composed/query-editor.tsx`                | Add optional `schema` prop (`QueryEditorSchema`). When language is SQL and schema is provided, pass to `sql({ dialect: PostgreSQL, schema: toSqlSchema(schema) })`. Use a new Compartment for schema reconfiguration. |
| `component/src/components/composed/__tests__/query-editor.test.tsx` | Add test: schema prop is passed to `sql()` mock.                                                                                                                                                                      |

**TDD sequence:**

1. RED: Write test -- render `QueryEditor` with `language="sql"` and `schema={type:'postgresql', tables:...}`. Verify the `sql()` mock is called with a schema object.
2. GREEN: Add schema prop handling to `loadLanguageExt` and wire via Compartment.
3. RED: Test schema update reconfigures without remount.
4. GREEN: Add Compartment-based reconfiguration for schema changes.

**Key implementation detail:** The `loadLanguageExt` function changes signature to accept an optional schema. When schema changes, the language compartment is reconfigured (same pattern as the existing language switching). The SQL extension is created as `sql({ dialect: PostgreSQL, schema: transformedSchema })`.

---

### Phase 3: Cypher Completion (M -- new dependency, new code path)

#### Task 3.1 -- Install and Integrate `@neo4j-cypher/codemirror` (Size: M)

**Files to modify:**

| File                                                                | Change                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `component/package.json`                                            | Add `@neo4j-cypher/codemirror: ^1.0.3` and `@neo4j-cypher/editor-support: ^1.0.2` (transitive, but explicit for types).        |
| `component/src/lib/schema-transforms.ts`                            | Add `toCypherSchema(schema): EditorSupportSchema` -- converts `DatabaseSchema` to `{labels, relationshipTypes, propertyKeys}`. |
| `component/src/lib/__tests__/schema-transforms.test.ts`             | Add tests for `toCypherSchema`.                                                                                                |
| `component/src/components/composed/query-editor.tsx`                | Major refactor: add Cypher code path using `createCypherEditor`.                                                               |
| `component/src/components/composed/__tests__/query-editor.test.tsx` | Mock `@neo4j-cypher/codemirror`, verify `createCypherEditor` is called for Cypher language.                                    |

**TDD sequence:**

1. RED: Write test for `toCypherSchema` -- given `{type:'neo4j', labels:['Person','Movie'], relationshipTypes:['ACTED_IN'], nodeProperties:{Person:[{name:'name',type:'String'}]}}`, expect `{labels:['Person','Movie'], relationshipTypes:['ACTED_IN'], propertyKeys:['name']}`.
2. GREEN: Implement `toCypherSchema`. Property keys are flattened from all `nodeProperties` + `relProperties` and deduplicated.
3. RED: Write test -- `QueryEditor` with `language="cypher"` calls `createCypherEditor` instead of building its own CM6 view.
4. GREEN: Implement the dual code path.
5. RED: Test schema update calls `editorApi.setSchema()`.
6. GREEN: Wire schema updates via `useEffect`.
7. RED: Test `onRun` keyboard shortcut is wired via `preExtensions`.
8. GREEN: Pass Ctrl+Enter keymap as `preExtensions` to `createCypherEditor`.

**Implementation design for `QueryEditor` Cypher path:**

```
initEditor (Cypher path):
  1. dynamic import('@neo4j-cypher/codemirror')
  2. import('@neo4j-cypher/codemirror/css/cypher-codemirror.css')
  3. createCypherEditor(containerRef.current, {
       value: docValue,
       readOnly: readOnlyRef.current,
       theme: 'dark',  // match oneDark
       autocomplete: true,
       lint: false,
       lineNumbers: false,
       schema: cypherSchema,
       preExtensions: [runKeymap, baseTheme, updateListener],
     })
  4. Store editorApi in a ref (replacing viewRef)
  5. Wire onValueChanged -> onChange
  6. Wire Ctrl+Enter -> onRun
```

**Sync effects (Cypher path):**

- `value` changes: `editorApi.setValue(value)`
- `readOnly` changes: `editorApi.setReadOnly(readOnly)`
- `schema` changes: `editorApi.setSchema(toCypherSchema(schema))`
- Cleanup: `editorApi.destroy()`

**CSS handling:** Import the CSS file dynamically alongside the module. Since this is a `component/` package concern, the CSS is loaded client-side only.

---

### Phase 4: App Layer Wiring (S -- connect the dots)

#### Task 4.1 -- Wire Schema into QueryEditorPanel (Size: S)

**Files to modify:**

| File                                                      | Change                                                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/components/widget-editor/query-editor-panel.tsx` | Import `useConnectionSchema`. Read schema from hook. Transform to `QueryEditorSchema`. Pass as `schema` prop to `QueryEditor`.                                   |
| `app/src/components/widget-editor-modal.tsx`              | Call `useConnectionSchema(connectionId)` at the top level to prefetch schema when connection is selected. No UI change -- just the hook call triggers the fetch. |

**TDD sequence:**

1. This is an integration/wiring task. Unit test is for the schema transform (already done in component/). The wiring is verified via E2E.
2. RED (E2E): Write Playwright test -- open widget editor, select a PostgreSQL connection, type `SELECT ` in the editor, verify autocompletion popup shows table names.
3. GREEN: Wire the props.

**Data flow:**

```
WidgetEditorModal
  -> useConnectionSchema(connectionId)  // prefetch
  -> QueryEditorPanel receives connectionId
    -> useConnectionSchema(connectionId)  // reads cached
    -> transforms DatabaseSchema -> QueryEditorSchema
    -> passes schema prop to QueryEditor
      -> QueryEditor feeds to CM6 completion source
```

---

### Phase 5: UX Polish (S -- small improvements)

#### Task 5.1 -- Refresh Schema Button (Size: S)

**Files to modify:**

| File                                                      | Change                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/components/widget-editor/query-editor-panel.tsx` | Add a small "Refresh schema" icon button next to the Query label. On click, calls `refreshSchema(connectionId)`. Shows a loading spinner while refetching. |

**TDD sequence:**

1. RED (E2E): Test -- click refresh schema button, verify loading state, verify schema is refetched.
2. GREEN: Implement button with loading state.

#### Task 5.2 -- Loading Indicator During Schema Fetch (Size: S)

**Files to modify:**

| File                                                      | Change                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `app/src/components/widget-editor/query-editor-panel.tsx` | Show a subtle loading indicator (small spinner or text) below the query label while `useConnectionSchema.isLoading` is true. |

**TDD sequence:**

1. E2E verification only (loading state is transient).

---

## Migration Needed?

**No.** No database schema changes. Schema data is fetched at runtime and cached in-memory only. The new `schema` prop on `QueryEditor` is optional and backwards-compatible.

---

## Security Checklist

| Item                                        | Status | Notes                                                                                                                        |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| No credentials exposed to client            | OK     | Schema API route already requires auth + tenant filter. Only metadata (table/column names) flows to the browser, never data. |
| No query modification                       | OK     | Autocompletion only suggests text. The user's query is never modified by the completion system.                              |
| Schema API uses read-only access            | OK     | `Neo4jSchemaManager` uses `session.READ` mode. `PostgresSchemaManager` queries `information_schema` (read-only).             |
| `@neo4j-cypher/codemirror` dependency audit | REVIEW | New dependency from npm. Maintained by Neo4j (official). Check for known vulnerabilities before merging. Run `npm audit`.    |
| No XSS via schema data                      | OK     | Schema metadata (labels, table names) is rendered as CM6 completion items, not raw HTML. CodeMirror sanitizes display.       |

---

## Testing Strategy

### Unit Tests (Vitest)

| Package      | Test File                                  | What                                                                        |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| `app/`       | `stores/__tests__/schema-store.test.ts`    | `clearSchema`, typed `DatabaseSchema`                                       |
| `app/`       | `hooks/__tests__/use-schema.test.ts`       | NEW: query key, enabled flag, `refreshSchema` invalidation                  |
| `component/` | `lib/__tests__/schema-transforms.test.ts`  | NEW: `toSqlSchema`, `toCypherSchema`, edge cases, large schema performance  |
| `component/` | `composed/__tests__/query-editor.test.tsx` | Schema prop passes to SQL mock, Cypher path calls `createCypherEditor` mock |

### E2E Tests (Playwright)

| Test                                      | What                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Widget editor: SQL autocompletion         | Select PG connection, type `SELECT `, verify completion popup with table names |
| Widget editor: Cypher autocompletion      | Select Neo4j connection, type `MATCH (n:`, verify completion popup with labels |
| Widget editor: Cypher syntax highlighting | Verify Cypher keywords are highlighted (not plain text)                        |
| Widget editor: Schema refresh             | Click refresh button, verify schema is re-fetched                              |
| Widget editor: Connection switching       | Switch from PG to Neo4j, verify editor language and completion change          |

### Test Approach Rationale

- **Schema transforms** are pure functions -- perfect for Vitest unit tests.
- **Schema store** is a Zustand store -- tested with Vitest (no mocks needed).
- **`useConnectionSchema` hook** is tested with Vitest mocking `fetch` and `@tanstack/react-query`.
- **QueryEditor integration with CM6** is tested via Playwright E2E (real browser, real CM6 rendering). Unit tests mock CM6 modules and verify wiring only.
- **Autocompletion behavior** (popup appears, correct suggestions) can only be verified in a real browser -- Playwright E2E.

---

## Risks

| Risk                                                                                                 | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neo4j-cypher/codemirror` creates its own `EditorView`, conflicting with our CM6 theme/keymap setup | Medium     | High   | Use `preExtensions`/`postExtensions` options to inject our keymap and theme. Verify dark mode compatibility. Fall back to custom CM6 extensions if the factory approach breaks.                                                               |
| `@neo4j-cypher/codemirror` CSS conflicts with existing oneDark theme                                 | Medium     | Medium | The library ships its own theme (`light`/`dark`/`auto`). Use `theme: 'dark'` to match oneDark. If styles conflict, scope the CSS with a container class.                                                                                      |
| `@neo4j-cypher/codemirror` bundle size bloat (ANTLR4 parser)                                         | Medium     | Medium | The `@neo4j-cypher/editor-support` package includes an ANTLR4 Cypher grammar (~200KB gzipped). This is only loaded for Cypher editors via dynamic import. Verify with `next/bundle-analyzer`.                                                 |
| `EditorSupportSchema.propertyKeys` is a flat list (no per-label context)                             | Low        | Low    | The `@neo4j-cypher/editor-support` schema format uses a flat `propertyKeys` list, not per-label maps. After typing `n.`, ALL property keys are suggested regardless of the `n` label. This is a known limitation of the library. Document it. |
| Large schemas (500+ tables) cause completion lag                                                     | Low        | Medium | `@codemirror/lang-sql` uses fuzzy matching internally and limits displayed results. Test with a 500-table schema. If slow, implement client-side truncation (top 200 tables by name).                                                         |
| Race condition: schema fetch completes after editor remount                                          | Low        | Low    | Use the existing abort signal pattern. Schema is stored in Zustand (survives remounts). Editor reads latest schema from store on mount.                                                                                                       |
| `@neo4j-cypher/codemirror` peer dependency conflicts with our CM6 versions                           | Medium     | High   | Check that `@codemirror/view@^6.9.0`, `@codemirror/state@^6.2.0` (required by neo4j) are compatible with our `^6.39.15` and `^6.5.4`. Should be fine (minor semver). Run `npm ls @codemirror/view` to verify single version.                  |

---

## Suggested GitHub Sub-Issues

If the team prefers smaller PRs, the work can be split into 3 PRs matching the phases:

| #   | Title                                                                     | Phase   | Size | Depends On |
| --- | ------------------------------------------------------------------------- | ------- | ---- | ---------- |
| 1   | `feat(app): type schema store and add refreshSchema`                      | Phase 1 | S    | --         |
| 2   | `feat(component): SQL schema-aware code completion`                       | Phase 2 | S    | #1         |
| 3   | `feat(component): Cypher syntax highlighting and schema-aware completion` | Phase 3 | M    | #2         |
| 4   | `feat(app): wire schema into query editor panel`                          | Phase 4 | S    | #2, #3     |
| 5   | `feat(app): refresh schema button and loading indicator`                  | Phase 5 | S    | #4         |

**Recommended approach:** Ship as a single PR (Phases 1-5) since total scope is M and the phases are tightly coupled. The feature is not useful until the wiring (Phase 4) is done.

---

## Key Files Reference

| File                                                      | Role                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| `component/src/components/composed/query-editor.tsx`      | Main editor component -- dual SQL/Cypher paths |
| `component/src/lib/schema-transforms.ts`                  | NEW: Pure transform functions                  |
| `app/src/stores/schema-store.ts`                          | Zustand store for cached schemas               |
| `app/src/hooks/use-schema.ts`                             | TanStack Query hook for schema fetching        |
| `app/src/components/widget-editor/query-editor-panel.tsx` | Wiring layer -- reads schema, passes prop      |
| `app/src/components/widget-editor-modal.tsx`              | Prefetch trigger on connection select          |
| `connection/src/schema/types.ts`                          | Source of truth for `DatabaseSchema` type      |
| `app/src/app/api/connections/[id]/schema/route.ts`        | API route serving schema data                  |
| `app/src/lib/schema-prefetch.ts`                          | Server-side schema fetch utility               |

---

## Dependency Graph

```
connection/src/schema/types.ts (DatabaseSchema)
    |
    +--> app/src/stores/schema-store.ts (stores DatabaseSchema)
    |       |
    |       +--> app/src/hooks/use-schema.ts (fetches + caches)
    |               |
    |               +--> app/src/components/widget-editor-modal.tsx (prefetch)
    |               |
    |               +--> app/src/components/widget-editor/query-editor-panel.tsx
    |                       |
    |                       +--> transforms DatabaseSchema -> QueryEditorSchema
    |                       |
    |                       +--> passes schema prop to QueryEditor
    |
    +--> component/src/lib/schema-transforms.ts (toSqlSchema, toCypherSchema)
            |
            +--> component/src/components/composed/query-editor.tsx
                    |
                    +--[SQL]--> @codemirror/lang-sql sql({ schema })
                    |
                    +--[Cypher]--> @neo4j-cypher/codemirror createCypherEditor({ schema })
```
