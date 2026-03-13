---
name: harden
description: Strengthen NeoBoard UI against edge cases, error states, text overflow, large datasets, connector failures, and real-world usage scenarios.
user-invokable: true
args:
  - name: target
    description: The page, component, or feature to harden (optional)
    required: false
---

Harden interfaces against the edge cases and failure modes that break idealized designs. Designs that only work with perfect data aren't production-ready.

## Assess Hardening Needs

Test with extreme inputs by reading code and identifying vulnerabilities:

### 1. Query & Data Edge Cases (NeoBoard-Specific)
- **Long Cypher/SQL**: Queries with 50+ lines in query editor — does it scroll properly?
- **Large result sets**: 10,000+ rows returned — virtual scrolling or pagination in data-grid?
- **Empty results**: Query returns 0 rows — does widget show `EmptyState` or blank?
- **Type mismatches**: Query returns strings where chart expects numbers — graceful fallback?
- **Null/undefined values**: Sparse data with missing fields — chart handles gaps?
- **Mixed types**: Neo4j returns both nodes and scalars — `CardContainer` shows "Incompatible data format"?
- **Preview limit**: `wrapWithPreviewLimit` appends LIMIT 25 — tested with queries that already have LIMIT?

### 2. Connector Failures
- **Connection timeout**: 30s timeout hit — clear error message with retry?
- **Auth failure**: Invalid credentials — redirect to connection settings, not cryptic error?
- **Connection lost mid-query**: WebSocket/driver disconnect — widget error state with retry?
- **Rate limiting**: p-queue saturation — queued indicator or backpressure feedback?
- **Encryption errors**: Lost ENCRYPTION_KEY — clear "unrecoverable" message, not stack trace?

### 3. Widget Error States
- **Chart render failure**: ECharts throws — caught by error boundary, shows fallback?
- **NVL/Leaflet load failure**: Dynamic import fails — error boundary, not white screen?
- **Widget type change**: Switching chart type with incompatible data — validated before render?
- **Parameter dependency**: Widget depends on parameter that has no value yet — loading or empty state?
- **Stale cache**: Cached query results outdated — refresh mechanism works?

### 4. Text Overflow & Layout
- **Long dashboard names**: 100+ character title — truncated with ellipsis?
- **Long connector names**: Overflow in sidebar, connection cards, dropdowns?
- **Long query text**: In widget header subtitle, tooltips?
- **Long form values**: In field-picker selections, parameter display?
- **Narrow viewports**: Widget grid at xs breakpoint (480px, 4 columns) — content readable?

Apply these patterns:
```css
/* Single line truncation */
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Flex item overflow prevention */
.flex-item { min-width: 0; overflow: hidden; }

/* Grid item overflow prevention */
.grid-item { min-width: 0; min-height: 0; }
```

### 5. Form Widget Validation
- **Required fields empty**: Form widget submitted with empty required fields — inline error?
- **Type coercion**: String input for integer parameter — validated before query execution?
- **Concurrent submissions**: Double-click submit — button disabled during loading?
- **Form reset**: After successful submission — form cleared or preserved?

### 6. Multi-Tenancy Edge Cases
- **Tenant mismatch**: API request with wrong tenantId — rejected server-side, not data leak?
- **Permission downgrade**: User role changed mid-session — next request enforces new role?
- **Cross-tenant URLs**: Direct URL to another tenant's dashboard — 403, not 404?
- **`can_write` enforcement**: Write operations checked server-side in API route, not just UI?

### 7. Dashboard Operations
- **Import malformed JSON**: Dashboard import with invalid structure — validated with clear error?
- **Export large dashboard**: 50+ widgets — export completes, file size reasonable?
- **Concurrent edits**: Two tabs editing same dashboard — last-write-wins or conflict detection?
- **Delete with dependencies**: Dashboard with shared parameters — cascade handled?

### 8. Loading States
Every async operation needs feedback:
- **Initial page load**: Skeleton or spinner (not blank page)
- **Query execution**: Widget loading indicator
- **Connection test**: `LoadingButton` with spinner
- **Dashboard save**: Save button disabled + spinner
- **Import/export**: Progress indication for large operations

### 9. Error Recovery
- **Network offline**: Clear "No connection" message, auto-retry when back online?
- **Session expired**: Redirect to login, preserve attempted URL for post-login redirect?
- **API 500**: Generic error with "try again" — never expose stack traces to user
- **Partial failure**: 3 of 5 widgets fail to load — show errors per-widget, not page-level crash

## Hardening Workflow

1. **Read the code** for the target area
2. **List vulnerabilities** from the categories above
3. **Prioritize** by impact (data loss/security > UX > cosmetic)
4. **Fix** each issue with minimal, targeted changes
5. **Test** each fix — write tests for critical paths (API validation, auth checks)
6. **Run existing tests** to confirm no regressions

## Verify Hardening

After fixes:
- [ ] Long text doesn't break layouts (test with 100+ char strings)
- [ ] Empty states show `EmptyState` component with action guidance
- [ ] Error states show clear messages with retry options
- [ ] Loading states visible for all async operations
- [ ] Form validation prevents invalid submissions
- [ ] `can_write` enforced server-side for all write API routes
- [ ] `tenant_id` filter present in all DB queries
- [ ] No console errors in any state (empty, error, loading, full)
- [ ] `npm run build` passes
- [ ] Relevant test suite passes

**NEVER**:
- Assume perfect input
- Leave error messages generic ("Error occurred")
- Trust client-side validation alone (always validate server-side)
- Block entire interface when one widget errors (isolate failures)
- Expose stack traces, SQL, or Cypher to users
- Skip the multi-tenancy checks — data leaks are critical bugs
