# Task 9: Query Result Harmonization — PostgreSQL & Neo4j

> **Status**: IMPLEMENTED
> **Source**: NOTES.md item #11
> **Priority**: Medium — data display bug
> **Dependencies**: None

### Implementation Notes

Fixed in `query-executor.ts` by adding `normalizeResult()` + `toPlainObjects()`:
- PostgreSQL `{ fields, records, summary }` wrapper → extracted to flat `records` array
- Neo4j `NeodashRecord[]` proxy objects → converted via `.toObject()` to plain objects
- Both adapters now return the same shape: `Record<string, unknown>[]`
- JSON viewer transform updated from `identity` to `transformToJsonData` (uses `toRecords` safety net)

---

## Problem Statement

When executing a PostgreSQL query, the connection module returns a result object with metadata:

```json
{
  "fields": [
    { "name": "search_query", "type": "jsonb" }
  ],
  "records": [ ... ],
  "summary": {
    "rowCount": 1,
    "executionTime": 42,
    "queryType": "read",
    "database": "postgresql"
  }
}
```

The user should only see the **records** (the actual data), not the metadata (`fields`, `summary`). Currently, for some chart types (especially Table and JSON Viewer), the full result object (including metadata) may be visible.

---

## Current Data Flow

1. `POST /api/query` → `executeQuery()` → connection module
2. Connection module returns: `{ data: result }` where `result` is the PostgreSQL module's full output
3. `query-executor.ts` wraps it: `{ data: result }`
4. `chart-registry.ts` transforms call `toRecords(data)` which checks:
   ```typescript
   if (data && typeof data === "object" && "records" in data) {
     return (data as { records: Record<string, unknown>[] }).records;
   }
   ```

### The Issue

The `toRecords` function correctly extracts `records` from the PostgreSQL response for charts that use it (bar, line, pie, table, etc.). But:

1. **JSON Viewer** uses `identity` transform — passes the full object including metadata
2. **Single Value** extracts from `records[0]` correctly, but if the query returns a complex JSONB result (like the search_query example in NOTES.md), the nested structure might confuse the user

### Specific Example from NOTES.md

The query:
```sql
SELECT jsonb_build_object('AND', jsonb_build_array(...)) AS search_query;
```

Returns from PostgreSQL:
```json
{
  "fields": [{ "name": "search_query", "type": "jsonb" }],
  "records": [{ "search_query": { "AND": [...] } }],
  "summary": { "rowCount": 1, "executionTime": 42, ... }
}
```

If displayed in JSON viewer with `identity` transform, the user sees the full metadata wrapper instead of just:
```json
[{ "search_query": { "AND": [...] } }]
```

---

## Proposed Fix

### Option 1: Fix at the Transform Level (Recommended)

Change the `identity` transform for JSON viewer to also use `toRecords`:

```typescript
// In chart-registry.ts:
json: {
  type: "json",
  label: "JSON Viewer",
  transform: (data: unknown) => {
    // For PostgreSQL responses, extract records
    // For Neo4j responses (already array), pass through
    return toRecords(data);
  },
},
```

This is the simplest fix and affects only the JSON viewer.

### Option 2: Fix at the Query Executor Level

Normalize the response in `query-executor.ts` before returning to the client:

```typescript
export async function executeQuery(...): Promise<{ data: unknown; fields?: unknown }> {
  // ... existing code ...
  return new Promise((resolve, reject) => {
    module.runQuery(
      queryParams,
      {
        onSuccess: (result: unknown) => {
          // Normalize: if PostgreSQL format with records, extract just the records
          if (result && typeof result === 'object' && 'records' in result) {
            const pgResult = result as { records: unknown[]; fields?: unknown; summary?: unknown };
            resolve({
              data: pgResult.records,
              fields: pgResult.fields,
            });
          } else {
            resolve({ data: result });
          }
        },
        onFail: (error: unknown) => reject(error),
        setFields: () => {},
        setSchema: () => {},
      },
      config,
    );
  });
}
```

This normalizes ALL chart types at once — PostgreSQL always returns a flat array of records, matching Neo4j's format. This is the cleaner architectural choice because:
- All chart transforms receive the same format regardless of database type
- The `toRecords` fallback in each transform becomes unnecessary
- JSON viewer automatically shows just the records

### Recommendation: Option 2

Fix it at the source (query executor) so all chart types benefit. Then simplify the `toRecords` helper since both formats will be arrays.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/lib/query-executor.ts` | Modify | Normalize PostgreSQL results to flat array |
| `app/src/lib/chart-registry.ts` | Modify | Simplify transforms after normalization |

---

## Acceptance Criteria

- [ ] PostgreSQL query results show only the data rows, not metadata
- [ ] JSON Viewer shows the records array, not the full response object
- [ ] Table chart renders correctly from PostgreSQL queries
- [ ] Bar/Line/Pie charts still work correctly with both Neo4j and PostgreSQL data
- [ ] The `summary` and `fields` metadata are not visible in any chart type
- [ ] Complex JSONB results (like the search_query example) display cleanly
