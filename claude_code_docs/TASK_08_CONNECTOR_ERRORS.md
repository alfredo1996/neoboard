# Task 8: Connector Error Visibility

> **Source**: NOTES.md item #9
> **Priority**: Medium — improves debugging experience
> **Dependencies**: None (standalone improvement)

---

## Problem Statement

When a database connection fails (wrong credentials, network issue, database down), the error is not visible to the user. The connection simply shows as "error" (red dot) with no details. Users have to check server logs to understand what went wrong.

---

## Current State

In `app/src/app/(dashboard)/connections/page.tsx`, the `handleTest` function:

```typescript
async function handleTest(id: string) {
  setTestResults((prev) => ({ ...prev, [id]: "connecting" }));
  const result = await testConnection.mutateAsync(id);
  setTestResults((prev) => ({
    ...prev,
    [id]: result.success ? "connected" : "error",
  }));
}
```

The `testConnection` hook returns `{ success: boolean; error?: string }` — the `error` message is available but never displayed.

The `ConnectionCard` composed component renders a `ConnectionStatus` indicator (the colored dot) but doesn't show error details.

---

## Proposed Solution

### Option A: Error Tooltip on Hover (Recommended)

Show the error message in a tooltip when hovering over the error status indicator:

```tsx
<ConnectionCard
  key={c.id}
  name={c.name}
  host={c.type}
  status={getConnectionStatus(c.id)}
  errorMessage={testResults[c.id] === "error" ? errorMessages[c.id] : undefined}
  onTest={() => handleTest(c.id)}
  onDelete={() => setDeleteTarget(c.id)}
/>
```

The `ConnectionCard` (or `ConnectionStatus`) component would wrap the status dot in a Tooltip:

```tsx
// When status is "error" and errorMessage is provided:
<Tooltip>
  <TooltipTrigger>
    <StatusDot variant="error" />
  </TooltipTrigger>
  <TooltipContent side="right" className="max-w-xs">
    <p className="text-sm font-medium">Connection Error</p>
    <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
  </TooltipContent>
</Tooltip>
```

### Option B: Expandable Error Section

Below the connection card, show an expandable error details section:

```
┌──────────────────────────────────────────────────────┐
│ 🔴 Movies Graph (Neo4j)           [Test] [Delete]   │
│ ⚠ Connection failed: Could not connect to           │
│   bolt://localhost:7687 - Connection refused          │
└──────────────────────────────────────────────────────┘
```

### Implementation Changes

1. **Store error messages** alongside status:

```typescript
const [testResults, setTestResults] = useState<Record<string, {
  status: string;
  error?: string;
}>>({});

async function handleTest(id: string) {
  setTestResults((prev) => ({
    ...prev,
    [id]: { status: "connecting" },
  }));
  const result = await testConnection.mutateAsync(id);
  setTestResults((prev) => ({
    ...prev,
    [id]: {
      status: result.success ? "connected" : "error",
      error: result.error,
    },
  }));
}
```

2. **Update ConnectionCard props**:

Add `errorMessage?: string` to `ConnectionCardProps`. When present and status is "error", show the tooltip.

3. **Widget query errors** should also be more visible:

In `CardContainer`, the error alert already shows `widgetQuery.error.message`. But it could be improved with:
- The connection name (not just the error)
- A "Retry" button
- A link to the connection settings if the connection is down

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/app/(dashboard)/connections/page.tsx` | Modify | Store error messages, pass to ConnectionCard |
| `component/src/components/composed/connection-card.tsx` | Modify | Add `errorMessage` prop, tooltip on error |
| `component/src/components/composed/connection-status.tsx` | Modify | Add tooltip support for error details |

---

## Acceptance Criteria

- [ ] When a connection test fails, the error message is visible to the user
- [ ] Hovering/clicking on the error indicator shows the full error message
- [ ] Error messages include useful details (host, port, specific error)
- [ ] Auto-test errors on page load also show error messages
- [ ] The error display doesn't clutter the UI when connections are healthy
