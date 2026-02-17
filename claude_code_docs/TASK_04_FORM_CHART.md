# Task 4: Form Chart Type — Data Push to Database

> **Source**: NOTES.md item #4
> **Priority**: Medium — new chart type enabling write operations
> **Dependencies**: Parameter Selectors (TASK_01) for parameter fields backing form inputs

---

## Problem Statement

NeoBoard is currently read-only — widgets can only query and display data. There's no way to push data back to the database. A "form chart" would allow users to create input forms within the dashboard that execute write queries (INSERT/CREATE) against a connection.

---

## Design

### Concept

A form chart is a special widget type (`chartType: 'form'`) that:
1. Renders a set of input fields (text, number, date, select, etc.)
2. Collects user input into parameter values
3. Executes a write query using those parameters when the user clicks "Submit"
4. Shows success/error feedback

### Widget Settings

```typescript
interface FormWidgetSettings {
  title?: string;
  /** The write query to execute on submit. Uses $param_name syntax. */
  submitQuery: string;
  /** Success message after submission */
  successMessage?: string;
  /** Whether to clear fields after successful submission */
  clearOnSubmit?: boolean;

  /** Form field definitions */
  fields: FormFieldDef[];
}

interface FormFieldDef {
  /** Parameter name — used as $name in the query */
  name: string;
  /** Display label */
  label: string;
  /** Input type */
  type: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'textarea' | 'checkbox';
  /** Default value */
  defaultValue?: unknown;
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** For select type: static options or a query to fetch options */
  options?: { label: string; value: string }[];
  /** For select type: query to fetch options dynamically */
  optionsQuery?: string;
  /** Validation pattern (regex) */
  pattern?: string;
}
```

### Example: Add Movie Form (Neo4j)

Settings:
```json
{
  "title": "Add New Movie",
  "submitQuery": "CREATE (m:Movie {title: $title, released: toInteger($released), tagline: $tagline})",
  "successMessage": "Movie created successfully!",
  "clearOnSubmit": true,
  "fields": [
    { "name": "title", "label": "Title", "type": "text", "required": true, "placeholder": "Movie title" },
    { "name": "released", "label": "Year Released", "type": "number", "required": true },
    { "name": "tagline", "label": "Tagline", "type": "textarea", "placeholder": "A catchy tagline..." }
  ]
}
```

### Example: Insert Record (PostgreSQL)

```json
{
  "title": "Add Employee",
  "submitQuery": "INSERT INTO employees (name, department, salary) VALUES ($1, $2, $3)",
  "fields": [
    { "name": "name", "label": "Name", "type": "text", "required": true },
    { "name": "department", "label": "Department", "type": "select", "optionsQuery": "SELECT DISTINCT department FROM employees" },
    { "name": "salary", "label": "Salary", "type": "number" }
  ]
}
```

---

## Architecture

### 1. Form Renderer Component

Create in the component library:

```tsx
// component/src/components/composed/form-chart.tsx
export interface FormChartProps {
  fields: FormFieldDef[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting?: boolean;
  successMessage?: string;
  showSuccess?: boolean;
  clearOnSubmit?: boolean;
}
```

The component uses shadcn `Input`, `Select`, `Textarea`, `Checkbox`, `DatePicker` from the existing UI library.

### 2. Query Execution for Write Operations

The current `query-executor.ts` passes all queries through the connection module. For Neo4j, the access mode needs to be `WRITE` instead of `READ`. For PostgreSQL, write transactions need `BEGIN` (not `BEGIN TRANSACTION READ ONLY`).

Add a `mode` parameter to the query API:

```typescript
// In POST /api/query body:
{
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
  mode?: 'read' | 'write';  // NEW — defaults to 'read'
}
```

In `query-executor.ts`, pass the access mode to the connection config:
```typescript
const config = {
  ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
  connectionType,
  database: credentials.database,
  accessMode: mode === 'write' ? 'WRITE' : 'READ',
};
```

### 3. CardContainer Integration

In `card-container.tsx`, add a `form` case to `ChartRenderer`:

```tsx
case "form": {
  const formSettings = widget.settings as FormWidgetSettings;
  return (
    <FormChart
      fields={formSettings.fields}
      onSubmit={async (values) => {
        await fetch('/api/query', {
          method: 'POST',
          body: JSON.stringify({
            connectionId: widget.connectionId,
            query: formSettings.submitQuery,
            params: values,
            mode: 'write',
          }),
        });
      }}
      successMessage={formSettings.successMessage}
      clearOnSubmit={formSettings.clearOnSubmit}
    />
  );
}
```

### 4. Form Editor in WidgetEditorModal

When `chartType === 'form'`, the editor step 2 should show:
- A field definition builder (add/remove fields, configure type/label/required)
- The submit query textarea
- A "Test Submit" button (with a dry-run flag?)

### 5. Parameter Integration

Form fields should integrate with the parameter store (TASK_01):
- Form field values can be pre-filled from dashboard parameters
- Form field values can optionally be pushed to the parameter store (so other widgets react)
- The submit query can reference both form field values AND dashboard parameters

---

## Security Considerations

- **Write queries are dangerous**. The form chart allows arbitrary INSERT/CREATE/UPDATE/DELETE.
- The current architecture trusts that the dashboard editor knows what they're doing — the same as NeoDash.
- Consider adding a confirmation dialog before form submission.
- Consider a `readOnly` flag on connections to prevent write operations.
- SQL injection is prevented by parameterized queries (already handled by the connection module).

---

## Chart Registry Addition

```typescript
// In chart-registry.ts:
form: {
  type: 'form',
  label: 'Form',
  transform: identity,  // No data transform needed — form doesn't display query results
},
```

Chart type picker addition:
```tsx
{ value: 'form', label: 'Form', icon: FileInput }  // lucide-react FileInput icon
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `component/src/components/composed/form-chart.tsx` | Create | Form renderer component |
| `component/src/components/composed/form-chart.test.tsx` | Create | Tests |
| `component/src/components/composed/index.ts` | Modify | Export FormChart |
| `app/src/lib/chart-registry.ts` | Modify | Add `form` type |
| `app/src/components/card-container.tsx` | Modify | Add form case to ChartRenderer |
| `app/src/components/widget-editor-modal.tsx` | Modify | Add form field definition builder |
| `app/src/app/api/query/route.ts` | Modify | Accept `mode` parameter |
| `app/src/lib/query-executor.ts` | Modify | Pass access mode to connection config |

---

## Acceptance Criteria

- [ ] "Form" appears in chart type picker
- [ ] Form fields render correctly (text, number, date, select, textarea, checkbox)
- [ ] Submit executes the write query with parameterized values
- [ ] Success/error feedback shown after submission
- [ ] Form clears on success (when configured)
- [ ] Form field definition builder works in the widget editor
- [ ] Write queries work for both Neo4j (CREATE/SET) and PostgreSQL (INSERT/UPDATE)
- [ ] Dynamic select options (fetched from a query) work
