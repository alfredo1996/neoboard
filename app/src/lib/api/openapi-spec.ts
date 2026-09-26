/**
 * NeoBoard OpenAPI 3.0 Specification
 *
 * Static spec covering all public API routes. Kept in sync manually.
 * Served at GET /api/openapi.json.
 */

import { PRODUCT_NAME, PRODUCT_PITCH } from "@/lib/branding";
import { DEFAULT_MAX_ROWS } from "@/lib/query/query-executor";
import { API_ERROR_CODES } from "./api-response";
import { MAX_ROWS_BOUNDS } from "@/lib/connector/connection-form";
import { DEAD_CONNECTOR_TTL_MS } from "@/lib/query/middleware/dead-connector";
import { SCHEDULER_DEFAULTS } from "@/lib/query/scheduler-config";
import { PROXY_BODY_LIMIT_BYTES } from "./api-utils";

// ---------------------------------------------------------------------------
// Helpers to reduce structural repetition in path definitions
// ---------------------------------------------------------------------------

/** JSON request body pointing to a $ref schema */
function jsonBody(schemaRef: string) {
  return {
    required: true as const,
    content: { "application/json": { schema: { $ref: schemaRef } } },
  };
}

/**
 * The body every handler sends (#1961): `apiSuccess` and `apiList` wrap each
 * payload as `{ data, error: null, meta }`. `data` is a schema, or a $ref to one.
 */
const NULLABLE_META = { type: "object", nullable: true } as const;

function envelope(data: string | object, meta: object = NULLABLE_META) {
  return {
    type: "object" as const,
    required: ["data", "error", "meta"],
    properties: {
      data: typeof data === "string" ? { $ref: data } : data,
      error: {
        type: "object" as const,
        nullable: true,
        description: "Always null on success.",
      },
      meta,
    },
  };
}

/** A success response: `data` is the payload, in the envelope. */
function jsonResponse(description: string, data: string | object) {
  return {
    description,
    content: { "application/json": { schema: envelope(data) } },
  };
}

/** A response whose schema already describes the whole body. */
function bodyResponse(description: string, schema: object) {
  return {
    description,
    content: { "application/json": { schema } },
  };
}

/**
 * Paginated list JSON response (#908): the item array in the envelope, with
 * the pagination meta that `apiList()` sends, so Swagger UI shows
 * meta.total / meta.limit / meta.offset and generated clients can page.
 */
function paginatedResponse(description: string, itemSchemaRef: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: envelope(
          { type: "array" as const, items: { $ref: itemSchemaRef } },
          { $ref: "#/components/schemas/PaginationMeta" },
        ),
      },
    },
  };
}

/** Standard limit + offset parameter references, shared by all list GETs. */
const PAGINATION_PARAMS = [
  { $ref: "#/components/parameters/LimitParam" },
  { $ref: "#/components/parameters/OffsetParam" },
] as const;

/** Seconds to wait before retrying: a hint, to use as a minimum. */
const RETRY_AFTER = {
  schema: { type: "integer" as const },
  description: "Seconds to wait before retrying, as a minimum.",
};

// Shorthand aliases for common $ref responses
const R = {
  unauthorized: { $ref: "#/components/responses/Unauthorized" },
  forbidden: { $ref: "#/components/responses/Forbidden" },
  notFound: { $ref: "#/components/responses/NotFound" },
  badRequest: { $ref: "#/components/responses/BadRequest" },
  serverError: { $ref: "#/components/responses/ServerError" },
  deleteSuccess: { $ref: "#/components/responses/DeleteSuccess" },
  tooLarge: { $ref: "#/components/responses/PayloadTooLarge" },
  timeout: { $ref: "#/components/responses/RequestTimeout" },
  busy: { $ref: "#/components/responses/ServiceUnavailable" },
  connectorDown: { $ref: "#/components/responses/ConnectorUnavailable" },
} as const;

/** The query operations' header parameters (#1966). */
const REQUEST_ID_HEADER = { $ref: "#/components/parameters/RequestIdHeader" };

const SPEC = {
  openapi: "3.0.3",
  info: {
    title: `${PRODUCT_NAME} API`,
    version: "1.0.0",
    description:
      `REST API for ${PRODUCT_NAME} — ${PRODUCT_PITCH}. ` +
      "Authenticate via session cookie (browser) or Bearer API key (programmatic access).",
    contact: {
      name: PRODUCT_NAME,
      url: "https://github.com/alfredo1996/neoboard",
    },
  },
  servers: [{ url: "", description: "Current server" }],
  security: [{ CookieAuth: [] }, { BearerAuth: [] }],
  tags: [
    { name: "Connections", description: "Database connector management" },
    { name: "Dashboards", description: "Dashboard CRUD and sharing" },
    { name: "Query", description: "Query execution" },
    { name: "Users", description: "User management (admin only)" },
    {
      name: "Widget Templates",
      description: "Reusable widget template library",
    },
    { name: "API Keys", description: "Programmatic API key management" },
  ],
  paths: {
    // ── Connections ────────────────────────────────────────────────────
    "/api/connections": {
      get: {
        tags: ["Connections"],
        summary: "List connections",
        description:
          "Admins get every connection in the tenant; everyone else gets their own plus the tenant's shared ones.",
        parameters: [...PAGINATION_PARAMS],
        responses: {
          200: paginatedResponse(
            "Paginated list of connections (credentials excluded)",
            "#/components/schemas/ConnectionListItem",
          ),
          401: R.unauthorized,
        },
      },
      post: {
        tags: ["Connections"],
        summary: "Create connection",
        description:
          "Creates a connection, private to its owner. Credentials are encrypted at rest. Readers are refused (403).",
        requestBody: jsonBody("#/components/schemas/CreateConnectionRequest"),
        responses: {
          201: jsonResponse(
            "Connection created",
            "#/components/schemas/ConnectionCreated",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          413: R.tooLarge,
        },
      },
    },
    "/api/connections/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Connections"],
        summary: "Get connection",
        description:
          "Returns connection metadata plus its config: the connector's declared non-secret fields that are set, and `maxRows` " +
          "when one is stored. It never includes a `password`-typed field or an undeclared key, and it leaves config out when " +
          "the stored config cannot be decrypted or the connector is no longer installed. Owner, tenant-shared, or admin access required.",
        responses: {
          200: jsonResponse(
            "Connection detail",
            "#/components/schemas/ConnectionDetail",
          ),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      patch: {
        tags: ["Connections"],
        summary: "Update connection",
        description:
          "Updates the name, config or visibility of a connection the caller owns. Another user's connection is 404, admins " +
          "included. Readers are refused (403), and only an admin may change visibility (403 otherwise). A sent config " +
          "replaces the stored one, except that a `password`-typed field left blank or out keeps its stored value. If the stored " +
          "config cannot be decrypted there is nothing to keep, and a required secret left blank answers 400.",
        requestBody: jsonBody("#/components/schemas/UpdateConnectionRequest"),
        responses: {
          200: jsonResponse(
            "Updated connection summary",
            "#/components/schemas/ConnectionSummary",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          413: R.tooLarge,
        },
      },
      delete: {
        tags: ["Connections"],
        summary: "Delete connection",
        description:
          "Admins may delete any connection in the tenant; everyone else only their own (404 otherwise). Unless `force` is " +
          "`true`, a connection still used by widgets answers 409. That check runs first, so a caller who could not delete " +
          "the connection may get the 409 for a widget on a dashboard they can see.",
        parameters: [
          {
            name: "force",
            in: "query",
            required: false,
            schema: { type: "boolean", default: false },
            description:
              "`true` deletes even while widgets still use the connection. Any other value counts as false.",
          },
        ],
        responses: {
          200: jsonResponse(
            "Connection deleted",
            "#/components/schemas/DeletedResult",
          ),
          401: R.unauthorized,
          403: bodyResponse("A session that must change its password first.", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          404: R.notFound,
          409: bodyResponse(
            "In use by widgets and `force` is not `true`: `error.details.usage` is a ConnectionUsage.",
            { $ref: "#/components/schemas/ErrorResponse" },
          ),
        },
      },
    },
    "/api/connections/{id}/test": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Connections"],
        summary: "Test saved connection",
        description:
          "Tests connectivity using the stored (encrypted) credentials. The owner may test a connection, and an admin any " +
          "connection in the tenant; anyone else gets 404, a tenant-shared connection included. A failed test still answers " +
          "200, with `success: false`. The probe takes a slot on the connection's scheduler, so its only 408 and 503 come " +
          "from that queue (`Retry-After: 5`, and `queue_full` with `Retry-After: 2`): a probe is never shed, and a " +
          "connector failure is a verdict, not an error status.",
        parameters: [
          {
            name: "x-query-priority",
            in: "header",
            required: false,
            schema: { type: "string" },
            description:
              '`2` queues the probe at load priority, as "Test all" does; any other value, `3` included, is interactive ' +
              "(priority 1), so a probe is never shed.",
          },
        ],
        responses: {
          200: jsonResponse(
            "Test result",
            "#/components/schemas/ConnectionTestResult",
          ),
          401: R.unauthorized,
          403: bodyResponse("A session that must change its password first.", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          404: R.notFound,
          408: R.timeout,
          500: R.serverError,
          503: R.busy,
        },
      },
    },
    "/api/connections/test-inline": {
      post: {
        tags: ["Connections"],
        summary: "Test inline credentials",
        description:
          "Tests connectivity with a config sent in the request body; nothing is saved. Readers are refused (403). The config " +
          "is validated before any probe runs: a config the connector's descriptor rejects, as a save rejects it, is a 400 " +
          "with `error.details.fields`; a bad `maxRows` or an unknown `type` is a 400 from the body check, without " +
          "`fields`. A failed test still answers 200, with `success: false`.",
        requestBody: jsonBody("#/components/schemas/TestInlineRequest"),
        responses: {
          200: jsonResponse(
            "Test result",
            "#/components/schemas/ConnectionTestResult",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
    },
    "/api/connections/{id}/schema": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Connections"],
        summary: "Get database schema",
        description:
          "Introspects the connection's database. Readable by the owner and, for a tenant-shared connection, by anyone in " +
          "the tenant; there is no admin override (404). `data` is null when the connection's connector has no schema " +
          "introspection or is no longer installed. Stored credentials that cannot be decrypted, or a failed introspection, " +
          "answer 500; a connector that classifies its error answers 502 for a network or credentials failure, or 408 " +
          "(`Retry-After: 3`) for a transient one. There is no scheduler queue here.",
        responses: {
          200: jsonResponse(
            "Schema information",
            "#/components/schemas/DatabaseSchema",
          ),
          401: R.unauthorized,
          404: R.notFound,
          408: R.timeout,
          500: R.serverError,
          502: R.connectorDown,
        },
      },
    },
    "/api/connectors": {
      get: {
        tags: ["Connections"],
        summary: "List installed connectors",
        description:
          "Every connector this server can connect with, as plain data: label, category, icon, query language and the fields its connection form needs. Reads no database and is the same for every tenant.",
        responses: {
          200: {
            description: "Connector descriptors",
            content: {
              "application/json": {
                schema: envelope({
                  type: "array",
                  items: { $ref: "#/components/schemas/ConnectorDescriptor" },
                }),
              },
            },
          },
          401: R.unauthorized,
        },
      },
    },

    // ── Dashboards ────────────────────────────────────────────────────
    "/api/dashboards": {
      get: {
        tags: ["Dashboards"],
        summary: "List dashboards",
        description:
          "Admins see every dashboard in the tenant; creators see the ones they own, are shared on, or that are public; " +
          "readers see the ones shared with them or public; their own only when it is public. Most recently updated first.",
        parameters: [...PAGINATION_PARAMS],
        responses: {
          200: paginatedResponse(
            "Paginated list of dashboard summaries",
            "#/components/schemas/DashboardSummary",
          ),
          401: R.unauthorized,
          500: R.serverError,
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Create dashboard",
        requestBody: jsonBody("#/components/schemas/CreateDashboardRequest"),
        responses: {
          201: jsonResponse(
            "Dashboard created",
            "#/components/schemas/Dashboard",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
    },
    "/api/dashboards/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Dashboards"],
        summary: "Get dashboard",
        description:
          "Returns the stored dashboard, layout included, with the caller's role. " +
          "A dashboard the caller cannot open answers 404.",
        responses: {
          200: jsonResponse(
            "Dashboard detail",
            "#/components/schemas/DashboardDetail",
          ),
          401: R.unauthorized,
          404: R.notFound,
          500: R.serverError,
        },
      },
      put: {
        tags: ["Dashboards"],
        summary: "Update dashboard",
        description:
          "The owner, an editor or an admin may save. Readers and users without write permission get 403, so does a " +
          "caller with only a viewer share; a caller with no share (a merely public dashboard included) gets 404. " +
          "Only the owner or an admin may change `isPublic` (403); anyone else may re-send the stored value, which is " +
          "not written, but the save still counts and adds one to `version`. " +
          "A save answers 403 when its layout adds a connection the caller cannot use, or adds or changes a query while the dashboard names a connection neither the caller nor its owner can use. " +
          "Adding a form, or changing a form's query, connection or database, needs the caller's own access to that connection even when the dashboard already uses it: " +
          "the connection's owner, anyone in the tenant once it is shared, or an admin. A form left as saved stays.",
        requestBody: jsonBody("#/components/schemas/UpdateDashboardRequest"),
        responses: {
          200: jsonResponse(
            "Updated dashboard",
            "#/components/schemas/Dashboard",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          409: bodyResponse(
            "Saved from a stale copy: `expectedVersion` is not the current version, or another save (or connection re-assignment) landed first; a dashboard deleted mid-save also answers 409",
            { $ref: "#/components/schemas/ErrorResponse" },
          ),
          413: R.tooLarge,
          500: R.serverError,
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Delete dashboard",
        description:
          "Only the owner or an admin can delete. Readers and users without write permission get 403; anyone else, " +
          "a shared editor included, gets 404.",
        responses: {
          200: jsonResponse(
            "Dashboard deleted",
            "#/components/schemas/DeletedResult",
          ),
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
        },
      },
    },
    "/api/dashboards/{id}/duplicate": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Dashboards"],
        summary: "Duplicate dashboard",
        description:
          "Creates a private copy owned by the caller, named '<name> (copy)'. Readers and users without write permission " +
          "get 403. A non-admin can copy only a dashboard they own or are shared on (a merely public one answers 404), " +
          "and every connection it names must be one they can use (403). Admins can copy any dashboard in the tenant.",
        responses: {
          201: jsonResponse(
            "Duplicate created",
            "#/components/schemas/Dashboard",
          ),
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
        },
      },
    },
    "/api/dashboards/{id}/reassign-connection": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Dashboards"],
        summary: "Re-assign this dashboard's widgets to another connection",
        description:
          "Re-points widgets on THIS dashboard from one connection to another, " +
          "leaving other dashboards using the same source untouched. Omit " +
          "fromConnectionId (or pass an empty string) to fill in widgets that " +
          "have no connection — e.g. after an import that skipped one. " +
          "Content-only widgets (markdown, iframe) are never re-assigned. " +
          "Requires editor access to the dashboard; the target connection must " +
          "be one the caller can query, and must share the source's connector " +
          "type when a real source is given. Widget queries are NOT validated " +
          "against the target schema — incompatible queries fail at render time.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetConnectionId"],
                properties: {
                  fromConnectionId: {
                    type: "string",
                    description:
                      "Source connection id. Empty or omitted targets widgets with no connection.",
                  },
                  targetConnectionId: {
                    type: "string",
                    minLength: 1,
                    description: "Connection to re-point the widgets to.",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: jsonResponse("Widgets re-assigned", {
            type: "object",
            properties: {
              dashboardsUpdated: { type: "integer" },
              widgetsReassigned: { type: "integer" },
            },
          }),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
    },
    "/api/dashboards/{id}/export": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Dashboards"],
        summary: "Export dashboard",
        description:
          "Exports the dashboard as a NeoBoard export file (formatVersion 1), the file POST /api/dashboards/import reads. " +
          "Anyone who can view the dashboard can export it: its owner, anyone it is shared with, any tenant user when it is " +
          "public, and admins; anyone else gets 404, never 403. Each connection a widget uses becomes a key (`conn_0`, `conn_1`, …) " +
          "naming only its connector type and name; no connection id, config or credential is in the file. " +
          "The export answers 500 when a widget names a connection that no longer exists or, for anyone but an admin, " +
          "one the caller does not own (a shared one included), or when the stored layout is null or has no pages.",
        responses: {
          200: {
            description:
              "The export file itself, sent as a download (`Content-Disposition: attachment`): the one response not wrapped in the `{ data, error, meta }` envelope.",
            headers: {
              "Content-Disposition": {
                schema: { type: "string" },
                description:
                  'attachment; filename="dashboard-<slugified name>.json"',
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardExport" },
              },
            },
          },
          401: R.unauthorized,
          404: R.notFound,
          500: R.serverError,
        },
      },
    },
    "/api/dashboards/import": {
      post: {
        tags: ["Dashboards"],
        summary: "Import dashboard",
        description:
          "Creates a dashboard, owned by the caller and private, from a NeoBoard export (GET /api/dashboards/{id}/export) " +
          "or a NeoDash dashboard file, which is converted. Needs write permission (403). Map each export connection key to a " +
          "connection the caller owns, or skip it; a skipped key's widgets arrive with no connection. In a NeoBoard file a key " +
          "left neither mapped nor skipped stays as its widgets' `connectionId` (e.g. `conn_0`), which names no connection " +
          "and is not counted as unassigned; a NeoDash file's widgets then arrive with no connection. A mapping target the " +
          "caller does not own answers 400 `Invalid connection mapping`, a shared connection or, for an admin, another user's " +
          "included; a finished layout naming a connection the caller cannot use answers 403. The name is the file's " +
          "(`Imported Dashboard` for a NeoDash file whose title is missing or blank), with ' (imported)' appended when the tenant already has " +
          "a dashboard of that name. A body that is not JSON answers 400 `VALIDATION_ERROR`; an invalid NeoBoard file answers " +
          "400 naming the offending field; a malformed NeoDash report can answer 500.",
        requestBody: jsonBody("#/components/schemas/ImportDashboardRequest"),
        responses: {
          201: jsonResponse(
            "Dashboard imported",
            "#/components/schemas/ImportedDashboard",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
    },
    "/api/dashboards/{id}/share": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Dashboards"],
        summary: "List dashboard shares",
        description:
          "The dashboard's owner or an admin only. Anyone else, a sharee (editor included) or a viewer of a public " +
          "dashboard, gets 404, as does a dashboard outside the tenant. Not paginated, in no particular order; " +
          "an empty array when nobody has a share.",
        responses: {
          200: jsonResponse("Share assignments", {
            type: "array",
            items: { $ref: "#/components/schemas/DashboardShare" },
          }),
          401: R.unauthorized,
          404: R.notFound,
          500: R.serverError,
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Share dashboard with user",
        description:
          "Creates the share, or changes the role of the user's existing share; both answer 201. " +
          "The dashboard's owner or an admin only; anyone else gets 404, before the body is read. " +
          "An email that matches no user in the tenant answers 404 `User not found` (the match is exact and case-sensitive); " +
          "the caller's own email answers 400 `Cannot share with yourself`. A disabled user still matches and is shared with. " +
          "Only the caller's own email is refused, so an admin can add a share for the dashboard's owner.",
        requestBody: jsonBody("#/components/schemas/ShareDashboardRequest"),
        responses: {
          201: jsonResponse(
            "Share created or updated",
            "#/components/schemas/SuccessResult",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: bodyResponse("A session that must change its password first.", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          404: R.notFound,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Remove dashboard share",
        description:
          "The dashboard's owner or an admin only; anyone else gets 404. " +
          "A `shareId` that matches no share of this dashboard still answers 200.",
        parameters: [
          {
            name: "shareId",
            in: "query",
            required: true,
            schema: { type: "string" },
            description:
              "The share's `id`, from GET /api/dashboards/{id}/share.",
          },
        ],
        responses: {
          200: jsonResponse(
            "Share removed",
            "#/components/schemas/SuccessResult",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: bodyResponse("A session that must change its password first.", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          404: R.notFound,
          500: R.serverError,
        },
      },
    },

    // ── Query ─────────────────────────────────────────────────────────
    "/api/query": {
      post: {
        tags: ["Query"],
        summary: "Execute read query",
        description:
          "Executes a read-only query against a connected database. Results are capped at the connection's `maxRows`, " +
          `else ${DEFAULT_MAX_ROWS} rows; a request's \`rowLimit\` can only lower that. \`meta.rowLimit\` is the cap applied. ` +
          "A write that read-only execution stopped answers 500 with `error.details.blockedWrite: true`.\n\n" +
          "**Who may run what.** An admin, the connection's owner, or anyone in the tenant when the connection is shared, runs any query on it. " +
          "Anyone else needs a dashboard that uses the connection. Edit access (the dashboard's owner or an editor share) runs any query, " +
          "while the caller may write and the dashboard's owner can use the connection. View access (a viewer share, a public dashboard, " +
          "or an owner or editor share without edit access) runs only a query one of those dashboards saves (a widget's query, or a " +
          "parameter selector's or form field's seed query), on that widget's connection and saved database; anything else answers 403. " +
          "Without either, the answer is 404, the same as for a connection that does not exist.\n\n" +
          "A non-empty `tenantId` in the body must equal the session's, or the answer is 403. Unknown body keys are stripped, not rejected.",
        parameters: [
          { $ref: "#/components/parameters/QueryPriorityHeader" },
          REQUEST_ID_HEADER,
        ],
        requestBody: jsonBody("#/components/schemas/QueryRequest"),
        responses: {
          200: bodyResponse("Query results", {
            $ref: "#/components/schemas/QueryResponse",
          }),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          408: R.timeout,
          413: R.tooLarge,
          500: R.serverError,
          502: R.connectorDown,
          503: R.busy,
        },
      },
    },
    "/api/query/write": {
      post: {
        tags: ["Query"],
        summary: "Execute write query",
        description:
          "Executes a write query against a connected database. " +
          "A form submit sends `widgetId` and `dashboardId`: anyone who can open that dashboard may submit a form it saves, whatever their `canWrite` and whoever owns the connection. " +
          "The server runs the form's saved query, which `query` must equal exactly, on the form's saved connection and database, and binds only the parameters of the form's own fields, ignoring any other. " +
          "A dashboard the caller cannot open, a widget it does not hold or holds on another connection, and a form saved with other query text answer 404, the same as a dashboard that does not exist. " +
          "Any other write requires `canWrite` and a connection the caller owns; a stored widget that is not a form also needs write mode on, and runs on its saved database when its connection allows a per-card database. " +
          "A database constraint the submitted values violate is the caller's error, not the server's: a NOT NULL, " +
          "foreign-key, check, exclusion, length, format or date/time violation, or a graph constraint violation, answers 400 (a NOT NULL violation names its column in " +
          "`error.details.column`), a unique violation 409, and a read-only connection 403. " +
          `The rows a write returns are capped like a read's, at the connection's \`maxRows\` or ${DEFAULT_MAX_ROWS}, with no truncation flag; the write itself is never cut short.\n\n` +
          "A write always runs at scheduler priority 1; `x-query-priority` is not read. " +
          "A 408 from the queue (`Retry-After: 5`) means the write never started. " +
          "A 408 from a transient connector error (`Retry-After: 3`), or a 502, can arrive after the database applied the write, so retrying it may run the write twice. " +
          "A write is never shed: its 503 is always `queue_full`. " +
          "Unknown body keys are stripped, not rejected: a `rowLimit` or `database` sent here is ignored.",
        parameters: [REQUEST_ID_HEADER],
        requestBody: jsonBody("#/components/schemas/WriteQueryRequest"),
        responses: {
          200: bodyResponse("Query results", {
            $ref: "#/components/schemas/WriteQueryResponse",
          }),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          408: R.timeout,
          409: bodyResponse("A record with these values already exists", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          413: R.tooLarge,
          500: R.serverError,
          502: R.connectorDown,
          503: R.busy,
        },
      },
    },

    // ── Users ─────────────────────────────────────────────────────────
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        description:
          "Returns the users in the caller's tenant, newest first (`createdAt` descending, then `id`). **Admin only.**",
        parameters: [...PAGINATION_PARAMS],
        responses: {
          200: paginatedResponse(
            "Paginated list of users",
            "#/components/schemas/User",
          ),
          401: R.unauthorized,
          403: R.forbidden,
          500: R.serverError,
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create user",
        description:
          "Creates a user in the caller's tenant. **Admin only.** Two concurrent creates with the same email can " +
          "answer 500 rather than 409.",
        requestBody: jsonBody("#/components/schemas/CreateUserRequest"),
        responses: {
          201: jsonResponse("User created", "#/components/schemas/CreatedUser"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          409: bodyResponse(
            "A user with this email already exists in the tenant (the match is exact and case-sensitive)",
            { $ref: "#/components/schemas/ErrorResponse" },
          ),
          413: R.tooLarge,
          500: R.serverError,
        },
      },
    },
    "/api/users/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Users"],
        summary: "Get user",
        description: "Returns a single tenant-scoped user. **Admin only.**",
        responses: {
          200: jsonResponse("User detail", "#/components/schemas/User"),
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update user",
        description:
          "Changes a user's role, write permission or disabled state. **Admin only.** An admin cannot PATCH their own " +
          "user, whatever the body: that answers 400 `You cannot change your own role`. Role and write changes apply " +
          "from the user's next request, for sessions and API keys alike. A lower role also ends the user's sessions, " +
          "except one refreshed in the 30 seconds before the change.",
        requestBody: jsonBody("#/components/schemas/UpdateUserRequest"),
        responses: {
          200: jsonResponse("Updated user", "#/components/schemas/User"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete user",
        description:
          "Deletes a user in the caller's tenant for good, with their connections, dashboards, shares, widget templates " +
          "and API keys. **Admin only.** Their shared connections go too, with no in-use check, so other users' widgets " +
          "on them stop working. Only the caller's own account is protected (400); any other admin can be deleted.",
        responses: {
          200: R.deleteSuccess,
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
        },
      },
    },

    // ── Widget Templates ──────────────────────────────────────────────
    "/api/widget-templates": {
      get: {
        tags: ["Widget Templates"],
        summary: "List widget templates",
        description:
          "Every template in the caller's tenant, not only the caller's own, oldest first (`createdAt`, then `id`).",
        parameters: [
          ...PAGINATION_PARAMS,
          {
            name: "chartType",
            in: "query",
            schema: { type: "string" },
            description: "Only templates of this chart type (exact match).",
          },
          {
            name: "connectorType",
            in: "query",
            schema: {
              type: "string",
              description:
                "A connector type; GET /api/connectors lists the installed ones. Not validated: a type that is not installed answers 200 with the templates stored under that exact type (normally none) plus those that need no connection. An empty value applies no filter.",
            },
            description:
              "Templates for this connector type, plus every template that needs no connection (`connectorType` null).",
          },
        ],
        responses: {
          200: paginatedResponse(
            "Paginated list of widget templates",
            "#/components/schemas/WidgetTemplate",
          ),
          401: R.unauthorized,
          500: R.serverError,
        },
      },
      post: {
        tags: ["Widget Templates"],
        summary: "Create widget template",
        description: "Requires `canWrite` permission.",
        requestBody: jsonBody(
          "#/components/schemas/CreateWidgetTemplateRequest",
        ),
        responses: {
          201: jsonResponse(
            "Template created",
            "#/components/schemas/WidgetTemplate",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
    },
    "/api/widget-templates/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Widget Templates"],
        summary: "Get widget template",
        description: "Any template in the caller's tenant.",
        responses: {
          200: jsonResponse(
            "Widget template",
            "#/components/schemas/WidgetTemplate",
          ),
          401: R.unauthorized,
          404: R.notFound,
          500: R.serverError,
        },
      },
      put: {
        tags: ["Widget Templates"],
        summary: "Update widget template",
        description:
          "The template's creator or an admin, with `canWrite` permission; anyone else gets 403. " +
          "Access is checked before the body is read.",
        requestBody: jsonBody(
          "#/components/schemas/UpdateWidgetTemplateRequest",
        ),
        responses: {
          200: jsonResponse(
            "Updated template",
            "#/components/schemas/WidgetTemplate",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          413: R.tooLarge,
          500: R.serverError,
        },
      },
      delete: {
        tags: ["Widget Templates"],
        summary: "Delete widget template",
        description:
          "The template's creator or an admin, with `canWrite` permission; anyone else gets 403.",
        responses: {
          200: R.deleteSuccess,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
        },
      },
    },

    // ── API Keys ──────────────────────────────────────────────────────
    "/api/keys": {
      get: {
        tags: ["API Keys"],
        summary: "List API keys",
        description:
          "Returns the caller's own API keys, expired ones included, in no set order. Not paginated. Key hashes are never exposed.",
        responses: {
          200: jsonResponse("API key summaries", {
            type: "array",
            items: { $ref: "#/components/schemas/ApiKey" },
          }),
          401: R.unauthorized,
          500: R.serverError,
        },
      },
      post: {
        tags: ["API Keys"],
        summary: "Create API key",
        description:
          "Creates a new API key. The plaintext key (prefixed `nb_`) is returned **only once** in the response — " +
          "it cannot be retrieved again. Requires `canWrite` permission.",
        requestBody: jsonBody("#/components/schemas/CreateApiKeyRequest"),
        responses: {
          201: jsonResponse(
            "The created key, with its plaintext (shown only once)",
            "#/components/schemas/ApiKeyCreated",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          413: R.tooLarge,
          500: R.serverError,
          503: bodyResponse(
            "API keys are unavailable: `API_KEY_HMAC_SECRET` is not configured. No `error.details`. " +
              "Answered to a cookie session, and only after the body validates. A request that sends a Bearer `nb_` key " +
              "answers 500 instead, before any other check, because the key cannot be hashed.",
            { $ref: "#/components/schemas/ErrorResponse" },
          ),
        },
      },
    },
    "/api/keys/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      delete: {
        tags: ["API Keys"],
        summary: "Revoke API key",
        description:
          "Permanently revokes one of your own API keys. Another user's key answers 404, for an admin too. " +
          "Requires `canWrite` permission.",
        responses: {
          200: jsonResponse(
            "Key revoked",
            "#/components/schemas/SuccessResult",
          ),
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API Key",
        description:
          "API key prefixed with `nb_`. Obtain from Settings → API Keys.",
      },
      CookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "next-auth.session-token",
        description: "Session cookie set by the browser after signing in.",
      },
    },
    parameters: {
      IdPath: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Resource identifier",
      },
      LimitParam: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 1000, default: 25 },
        description:
          "Maximum number of rows to return, read as a leading integer (2.5 → 2). No number, or below 1, counts as 25; above 1000 counts as 1000. Out-of-range values are clamped, never rejected.",
      },
      OffsetParam: {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0, default: 0 },
        description:
          "Number of rows to skip. Combine with `limit` to page through results. Read as a leading integer (2.5 → 2). No number, or below 0, counts as 0; it is never rejected.",
      },
      QueryPriorityHeader: {
        name: "x-query-priority",
        in: "header",
        required: false,
        schema: { type: "integer", enum: [1, 2, 3], default: 2 },
        description:
          "Scheduler tier: 1 interactive, 2 load, 3 refresh. Anything else counts as 2. " +
          `A 3 is shed with a 503 once the connection's queue is ${SCHEDULER_DEFAULTS.shedThreshold * 100}% full (\`QUERY_SHED_THRESHOLD\`).`,
      },
      RequestIdHeader: {
        name: "x-request-id",
        in: "header",
        required: false,
        schema: { type: "string" },
        description:
          "Correlation id for the request's logs. The server uses the one sent, or makes one, and echoes it on the response " +
          "(all but the HTTP-to-HTTPS redirect, which is answered before the id is set).",
      },
    },
    responses: {
      Unauthorized: bodyResponse(
        "Not authenticated: no session and no valid API key. The proxy answers " +
          "a request with neither before any handler runs, in the same envelope (#1982).",
        { $ref: "#/components/schemas/ErrorResponse" },
      ),
      Forbidden: bodyResponse(
        "Insufficient permissions, or a change to data from a session that " +
          "must change its password first.",
        { $ref: "#/components/schemas/ErrorResponse" },
      ),
      NotFound: bodyResponse("Resource not found", {
        $ref: "#/components/schemas/ErrorResponse",
      }),
      BadRequest: bodyResponse("Validation error", {
        $ref: "#/components/schemas/ErrorResponse",
      }),
      ServerError: bodyResponse("Internal server error", {
        $ref: "#/components/schemas/ErrorResponse",
      }),
      DeleteSuccess: jsonResponse(
        "Resource deleted",
        "#/components/schemas/DeletedResult",
      ),
      PayloadTooLarge: bodyResponse(
        `The request body is over ${PROXY_BODY_LIMIT_BYTES / 1024 / 1024} MiB, judged by its declared \`Content-Length\` before it is read. ` +
          "A larger body sent without a length is cut off and answers 400.",
        { $ref: "#/components/schemas/ErrorResponse" },
      ),
      RequestTimeout: {
        ...bodyResponse(
          "Timed out or dropped: worth retrying a read; for a write, see the operation. Either the connection's scheduler " +
            "queue timed out before the query started (`Retry-After: 5`), or the connector judged the failure transient, such as " +
            "a query timeout or a dropped connection (`Retry-After: 3`). A transient failure that is also a network or " +
            "credentials failure answers 502 instead.",
          { $ref: "#/components/schemas/ErrorResponse" },
        ),
        headers: { "Retry-After": RETRY_AFTER },
      },
      ServiceUnavailable: {
        ...bodyResponse(
          "The connection's scheduler refused the request (`Retry-After: 2`): its queue is full " +
            '(`error.details.reason: "queue_full"`), or the request was priority 3 and was shed under load (`"shed"`).',
          { $ref: "#/components/schemas/ErrorResponse" },
        ),
        headers: { "Retry-After": RETRY_AFTER },
      },
      ConnectorUnavailable: bodyResponse(
        "The connector cannot use the connection: `error.details.reason` is `network` (the host cannot be reached: a refused " +
          "port, an unresolved name, an unroutable or timed-out host) or `auth_failed` (the database refused the credentials). " +
          `No \`Retry-After\`. For up to ${DEAD_CONNECTOR_TTL_MS / 1000} seconds after the first such failure the server answers ` +
          "this same 502 for that connection without dialling it again (per tenant, per server process), so retrying within " +
          "that window returns it again. A passing connection test, or editing or deleting the connection, ends the window early.",
        { $ref: "#/components/schemas/ErrorResponse" },
      ),
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        description: "The body of every error a handler answers (`apiError`).",
        required: ["data", "error", "meta"],
        properties: {
          data: {
            type: "object",
            nullable: true,
            description: "Always null on an error.",
          },
          error: { $ref: "#/components/schemas/EnvelopeError" },
          meta: {
            type: "object",
            nullable: true,
            description: "Always null on an error.",
          },
        },
      },
      SuccessResult: {
        type: "object",
        required: ["success"],
        properties: { success: { type: "boolean", enum: [true] } },
      },
      DeletedResult: {
        type: "object",
        required: ["deleted"],
        properties: { deleted: { type: "boolean", enum: [true] } },
      },
      PaginationMeta: {
        type: "object",
        description:
          "Pagination metadata returned by every list endpoint. `total` counts every row matching the query's filters, before limit and offset.",
        required: ["total", "limit", "offset"],
        properties: {
          total: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 1000 },
          offset: { type: "integer", minimum: 0 },
        },
      },
      EnvelopeError: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", enum: API_ERROR_CODES },
          message: { type: "string" },
          details: {
            type: "object",
            additionalProperties: true,
            description:
              "Present on some errors: `fields` on a config validation error, `blockedWrite` on a blocked write, `column` on a NOT NULL violation, `reason` on a 502 or a scheduler 503, `usage` on a 409 from deleting a connection still in use.",
          },
        },
      },
      ConnectorField: {
        type: "object",
        description: "One value a connector reads from a connection's config.",
        required: ["key", "label", "type", "group"],
        properties: {
          key: { type: "string", description: "Key in the stored config." },
          label: { type: "string" },
          type: {
            type: "string",
            enum: ["text", "password", "number", "select", "boolean", "uri"],
          },
          group: { type: "string", enum: ["connection", "advanced"] },
          required: { type: "boolean" },
          placeholder: { type: "string" },
          description: { type: "string" },
          options: {
            type: "array",
            description: "`select` only.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
            },
          },
          min: { type: "integer", description: "`number` only." },
          max: { type: "integer", description: "`number` only." },
          unit: { type: "string", description: "`number` only, e.g. `ms`." },
          protocols: {
            type: "array",
            description: "`uri` only — accepted schemes, with the colon.",
            items: { type: "string" },
          },
        },
      },
      ConnectorDescriptor: {
        type: "object",
        required: ["type", "label", "category", "fields"],
        properties: {
          type: {
            type: "string",
            description: "The value a connection's `type` holds.",
          },
          label: { type: "string" },
          category: {
            type: "string",
            enum: ["database", "graph", "api", "file"],
          },
          iconSvg: {
            type: "string",
            description:
              "SVG markup, at most 16 KB. Render it as an image, never as DOM.",
          },
          queryLanguage: {
            type: "string",
            description: "Editor language key. Absent means plain text.",
          },
          supportsGraphData: { type: "boolean" },
          supportsWrite: { type: "boolean" },
          fields: {
            type: "array",
            items: { $ref: "#/components/schemas/ConnectorField" },
          },
        },
      },
      ConnectionSummary: {
        type: "object",
        description:
          "The columns every connection response carries; PATCH /api/connections/{id} sends exactly these.",
        required: ["id", "name", "type", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: {
            type: "string",
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ConnectionVisibility: {
        type: "string",
        enum: ["private", "shared"],
        description:
          "`private`: only the owner and admins may use it directly. A dashboard that names it still grants access through it: its " +
          "viewers may run that dashboard's saved queries, its editors any read query. `shared`: every user in the tenant may query it " +
          "and build on it. Only the owner may edit it; an admin may also delete it.",
      },
      ConnectionCreated: {
        allOf: [
          { $ref: "#/components/schemas/ConnectionSummary" },
          {
            type: "object",
            required: ["allowPerCardDb"],
            properties: {
              allowPerCardDb: {
                type: "boolean",
                description:
                  "Whether a widget may run on a database other than the connection's default. No route sets it, so it is always true.",
              },
            },
          },
        ],
      },
      ConnectionListItem: {
        allOf: [
          { $ref: "#/components/schemas/ConnectionCreated" },
          {
            type: "object",
            required: ["visibility", "isOwner"],
            properties: {
              visibility: { $ref: "#/components/schemas/ConnectionVisibility" },
              isOwner: {
                type: "boolean",
                description:
                  "Whether the caller owns it. The owner's id is never sent.",
              },
            },
          },
        ],
      },
      ConnectionDetail: {
        description:
          "`config` holds the connector's declared non-secret fields that are set, plus `maxRows` when one is stored. It is left out when the stored config cannot be decrypted or its connector is no longer installed.",
        allOf: [
          { $ref: "#/components/schemas/ConnectionSummary" },
          {
            type: "object",
            required: ["visibility", "isOwner"],
            properties: {
              visibility: { $ref: "#/components/schemas/ConnectionVisibility" },
              isOwner: {
                type: "boolean",
                description:
                  "Whether the caller owns it. The owner's id is never sent.",
              },
              config: { $ref: "#/components/schemas/ConnectionConfig" },
            },
          },
        ],
      },
      ConnectionUsage: {
        type: "object",
        description:
          "Where widgets still use a connection, counted over the dashboards the caller can see.",
        required: ["widgetCount", "dashboards"],
        properties: {
          widgetCount: { type: "integer", minimum: 0 },
          dashboards: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "widgetCount"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                widgetCount: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      },
      CreateConnectionRequest: {
        type: "object",
        required: ["name", "type", "config"],
        properties: {
          name: {
            type: "string",
            minLength: 1,
            example: "Production analytics",
          },
          type: {
            type: "string",
            minLength: 1,
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          config: { $ref: "#/components/schemas/ConnectionConfig" },
        },
      },
      UpdateConnectionRequest: {
        type: "object",
        description:
          "Send at least one of name, config or visibility, or the answer is 400. Only an admin may send visibility (403 otherwise).",
        anyOf: [
          { required: ["name"] },
          { required: ["config"] },
          { required: ["visibility"] },
        ],
        properties: {
          name: { type: "string", minLength: 1 },
          config: { $ref: "#/components/schemas/ConnectionConfig" },
          visibility: { $ref: "#/components/schemas/ConnectionVisibility" },
        },
      },
      ConnectionConfig: {
        type: "object",
        description:
          "The connector's config bag. Its keys, which of them are required and each one's constraints are the `fields` of that connector's descriptor (`GET /api/connectors`). The bag is validated against them — a violation is a 400 whose `error.details.fields` maps each field to its message — and a key the descriptor does not declare is dropped before the config is stored. A `password`-typed field is a secret: it is never returned, and on update one left blank or out keeps its stored value. `maxRows` is NeoBoard's own key.",
        additionalProperties: true,
        properties: {
          maxRows: {
            type: "integer",
            minimum: MAX_ROWS_BOUNDS.min,
            maximum: MAX_ROWS_BOUNDS.max,
            description: `Row cap for query results on this connection, the rows a write returns included. Default ${DEFAULT_MAX_ROWS}.`,
          },
        },
      },
      ConnectionTestResult: {
        type: "object",
        description:
          "A connection test's verdict. A failed test is still HTTP 200: `success` is false, and `code` and `error` say why. " +
          "Both are present exactly when `success` is false.",
        required: ["success"],
        properties: {
          success: { type: "boolean" },
          code: {
            type: "string",
            enum: [
              "auth_failed",
              "network",
              "bad_uri",
              "container_loopback",
              "unknown",
              "decrypt_failed",
            ],
            description:
              "Why the test failed. `container_loopback`: the host could not be reached, the connection's `uri` points at a " +
              "loopback host, and the server runs inside a container. " +
              "`unknown`: no classifiable reason, including a probe the server could not run. `decrypt_failed` (saved-" +
              "connection test only): the stored credentials cannot be decrypted with the current key; re-enter them.",
          },
          error: {
            type: "string",
            description:
              "A message safe to display, with credentials redacted.",
          },
        },
      },
      TestInlineRequest: {
        type: "object",
        required: ["type", "config"],
        properties: {
          type: {
            type: "string",
            minLength: 1,
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          config: { $ref: "#/components/schemas/ConnectionConfig" },
        },
      },
      // nullable sits on the component: OpenAPI 3.0 ignores siblings of a $ref.
      DatabaseSchema: {
        type: "object",
        nullable: true,
        description:
          "What the connection's connector reports about its database. Which keys are present is the connector's choice: " +
          "a graph connector sends `labels`, `relationshipTypes`, `nodeProperties` and `relProperties`; a relational one " +
          "sends `tables`. Null when the connection's connector has no schema introspection or is no longer installed.",
        required: ["type"],
        properties: {
          type: {
            type: "string",
            description: "The connector type that produced this schema.",
          },
          labels: { type: "array", items: { type: "string" } },
          relationshipTypes: { type: "array", items: { type: "string" } },
          nodeProperties: {
            type: "object",
            description:
              "Properties seen per node type, keyed as the connector reports the type: a key may be quoted, and a node " +
              "with several labels gives one combined key.",
            additionalProperties: {
              type: "array",
              items: { $ref: "#/components/schemas/SchemaProperty" },
            },
          },
          relProperties: {
            type: "object",
            description:
              "Properties seen per relationship type, keyed as the connector reports the type (a key may be quoted).",
            additionalProperties: {
              type: "array",
              items: { $ref: "#/components/schemas/SchemaProperty" },
            },
          },
          tables: {
            type: "array",
            items: { $ref: "#/components/schemas/SchemaTable" },
          },
        },
      },
      SchemaProperty: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: {
            type: "string",
            nullable: true,
            description:
              "Null on the entry a connector may report for a type with no properties.",
          },
          type: { type: "string" },
        },
      },
      SchemaTable: {
        type: "object",
        required: ["name", "columns"],
        properties: {
          name: { type: "string" },
          columns: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "type", "nullable"],
              properties: {
                name: { type: "string" },
                type: { type: "string" },
                nullable: { type: "boolean" },
              },
            },
          },
        },
      },
      Dashboard: {
        type: "object",
        description:
          "A dashboard row as stored. Create, update and duplicate send it whole.",
        required: [
          "id",
          "userId",
          "tenantId",
          "name",
          "description",
          "layoutJson",
          "version",
          "isPublic",
          "createdAt",
          "updatedAt",
          "updatedBy",
        ],
        properties: {
          id: { type: "string" },
          userId: { type: "string", description: "The owner's user id." },
          tenantId: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          layoutJson: {
            type: "object",
            nullable: true,
            additionalProperties: true,
            description:
              "The layout as stored: `{ version: 2, pages, settings? }`.",
          },
          version: {
            type: "integer",
            minimum: 1,
            description:
              "Optimistic-lock counter. Every accepted PUT, and every connection re-assignment that rewrites its widgets, adds one; send it back as `expectedVersion`.",
          },
          isPublic: { type: "boolean", nullable: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
          updatedBy: {
            type: "string",
            nullable: true,
            description:
              "Id of the user who saved it last; null once that user is deleted.",
          },
        },
      },
      DashboardSummary: {
        type: "object",
        description:
          "A GET /api/dashboards item. It carries no owner, tenant, layout or version.",
        required: [
          "id",
          "name",
          "description",
          "isPublic",
          "createdAt",
          "updatedAt",
          "updatedByName",
          "role",
          "widgetCount",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          isPublic: { type: "boolean", nullable: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
          updatedByName: { type: "string", nullable: true },
          role: {
            type: "string",
            enum: ["owner", "editor", "viewer", "admin"],
            description:
              "The caller's role. An admin gets `owner` on their own dashboards and `admin` on the rest; " +
              "a public dashboard a non-admin neither owns nor is shared on is `viewer`.",
          },
          widgetCount: { type: "integer", minimum: 0 },
        },
      },
      DashboardDetail: {
        allOf: [
          { $ref: "#/components/schemas/Dashboard" },
          {
            type: "object",
            required: ["role", "updatedByName"],
            properties: {
              role: {
                type: "string",
                enum: ["owner", "editor", "viewer", "admin"],
                description:
                  "The caller's access. An admin is always `admin`, on their own dashboards too; " +
                  "a public dashboard a non-admin neither owns nor is shared on is `viewer`.",
              },
              updatedByName: { type: "string", nullable: true },
            },
          },
        ],
      },
      CreateDashboardRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, example: "Sales Overview" },
          description: { type: "string" },
        },
      },
      UpdateDashboardRequest: {
        type: "object",
        additionalProperties: false,
        description:
          "At least one of name, description, layoutJson or isPublic; expectedVersion alone, or any other key, is refused (400).",
        anyOf: [
          { required: ["name"] },
          { required: ["description"] },
          { required: ["layoutJson"] },
          { required: ["isPublic"] },
        ],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          isPublic: {
            type: "boolean",
            description:
              "Only the owner or an admin may change it (403). Anyone else may re-send the stored value: it is not " +
              "written, but the save still adds one to `version`.",
          },
          layoutJson: {
            type: "object",
            description:
              "Unknown keys on a widget are kept; unknown keys on the layout, a page, a grid item or settings are accepted but dropped.",
            required: ["version", "pages"],
            properties: {
              version: { type: "integer", enum: [2] },
              pages: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  required: ["id", "title", "widgets", "gridLayout"],
                  properties: {
                    id: { type: "string" },
                    title: { type: "string", minLength: 1 },
                    widgets: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "chartType", "connectionId", "query"],
                        additionalProperties: true,
                        properties: {
                          id: { type: "string" },
                          chartType: { type: "string" },
                          connectionId: { type: "string" },
                          query: { type: "string" },
                          params: {
                            type: "object",
                            additionalProperties: true,
                          },
                          settings: {
                            type: "object",
                            additionalProperties: true,
                          },
                        },
                      },
                    },
                    gridLayout: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["i", "x", "y", "w", "h"],
                        properties: {
                          i: { type: "string" },
                          x: { type: "number" },
                          y: { type: "number" },
                          w: { type: "number" },
                          h: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
              settings: {
                type: "object",
                properties: {
                  autoRefresh: { type: "boolean" },
                  refreshIntervalSeconds: { type: "number", minimum: 5 },
                },
              },
            },
          },
          expectedVersion: {
            type: "integer",
            minimum: 1,
            description:
              "Optimistic lock: the `version` last read. A mismatch answers 409. A save with layoutJson is pinned to " +
              "the version the server read even without it.",
          },
        },
      },
      DashboardLayout: {
        type: "object",
        description:
          "A version-2 dashboard layout: pages of widgets and their grid positions. Unknown keys on a page, widget or grid item are kept.",
        required: ["version", "pages"],
        properties: {
          version: { type: "integer", enum: [2] },
          pages: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "title", "widgets", "gridLayout"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                widgets: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "chartType", "connectionId", "query"],
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" },
                      chartType: { type: "string" },
                      connectionId: {
                        type: "string",
                        description:
                          "In a file: a key of the file's `connections`, or empty for a widget with no connection.",
                      },
                      query: { type: "string" },
                      params: { type: "object", additionalProperties: true },
                      settings: {
                        type: "object",
                        additionalProperties: true,
                        description:
                          "Chart options belong under `settings.chartOptions`. Importing a NeoBoard file refuses the known " +
                          "chart-option keys at the settings root and checks the shape of `settings.stylingConfig` and " +
                          "`settings.conditionalFormatting`.",
                      },
                      database: { type: "string" },
                      allowWrites: { type: "boolean" },
                      templateId: { type: "string" },
                      templateSyncedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
                gridLayout: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["i", "x", "y", "w", "h"],
                    additionalProperties: true,
                    properties: {
                      i: { type: "string", description: "The widget id." },
                      x: { type: "number" },
                      y: { type: "number" },
                      w: { type: "number" },
                      h: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          settings: {
            type: "object",
            additionalProperties: true,
            properties: {
              autoRefresh: { type: "boolean" },
              refreshIntervalSeconds: { type: "number" },
            },
          },
        },
      },
      DashboardExport: {
        type: "object",
        description:
          "A NeoBoard dashboard export, as GET /api/dashboards/{id}/export sends it. A widget's `connectionId` is a key of " +
          "`connections`, or empty for a widget with no connection.",
        required: [
          "formatVersion",
          "exportedAt",
          "dashboard",
          "connections",
          "layout",
        ],
        properties: {
          formatVersion: { type: "integer", enum: [1] },
          exportedAt: { type: "string", format: "date-time" },
          dashboard: {
            type: "object",
            required: ["name", "description"],
            properties: {
              name: { type: "string" },
              description: { type: "string", nullable: true },
            },
          },
          connections: {
            type: "object",
            description:
              "Export key (`conn_0`, `conn_1`, … in first-use order) → the source connection's name and connector type. " +
              "Only connections a widget uses appear.",
            additionalProperties: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string" },
                type: {
                  type: "string",
                  description: "A registered connector type.",
                },
              },
            },
          },
          layout: { $ref: "#/components/schemas/DashboardLayout" },
        },
      },
      DashboardImportFile: {
        type: "object",
        description:
          "A NeoBoard export as the import reads it: what the export sends, except that `dashboard.description` may be " +
          "left out and `exportedAt` is any string. `connections` must be there but is not read: `connectionMapping` and " +
          "`skippedConnections` decide each widget's connection, and a key in neither stays as the widget's `connectionId`. " +
          "Widget settings are checked: no chart options at the settings root, and `stylingConfig` and " +
          "`conditionalFormatting` must be well formed, so an older export that breaks either rule can fail to import.",
        required: [
          "formatVersion",
          "exportedAt",
          "dashboard",
          "connections",
          "layout",
        ],
        properties: {
          formatVersion: { type: "integer", enum: [1] },
          exportedAt: { type: "string" },
          dashboard: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1 },
              description: { type: "string", nullable: true },
            },
          },
          connections: {
            type: "object",
            additionalProperties: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string" },
                type: { type: "string" },
              },
            },
          },
          layout: { $ref: "#/components/schemas/DashboardLayout" },
        },
      },
      NeoDashDashboard: {
        type: "object",
        description:
          "A NeoDash dashboard file, converted on import: recognised by a non-empty `pages` array whose every page has a `reports` array.",
        required: ["pages"],
        additionalProperties: true,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          version: { type: "string" },
          pages: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["reports"],
              additionalProperties: true,
              properties: {
                title: { type: "string" },
                reports: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
          },
          settings: { type: "object", additionalProperties: true },
        },
      },
      ImportDashboardRequest: {
        type: "object",
        required: ["payload"],
        properties: {
          payload: {
            description:
              "The file to import. A NeoDash dashboard is recognised by its pages' `reports` arrays; anything else must be a NeoBoard export.",
            anyOf: [
              { $ref: "#/components/schemas/DashboardImportFile" },
              { $ref: "#/components/schemas/NeoDashDashboard" },
            ],
          },
          connectionMapping: {
            type: "object",
            additionalProperties: { type: "string" },
            default: {},
            description:
              "Connection key, as the file's widgets name it in `connectionId` (`conn_0`, …; `neodash-default` for a NeoDash " +
              "file) → id of a connection the caller owns. An empty value leaves the key unmapped: in a NeoBoard file its " +
              "widgets keep the key as their `connectionId`; a NeoDash file's widgets get no connection.",
          },
          skippedConnections: {
            type: "array",
            items: { type: "string" },
            default: [],
            description:
              "Connection keys to import without a connection: their widgets get an empty `connectionId` and a note says so.",
          },
        },
      },
      ImportedDashboard: {
        allOf: [
          { $ref: "#/components/schemas/Dashboard" },
          {
            type: "object",
            required: ["notes", "unassignedWidgetCount"],
            properties: {
              notes: {
                type: "array",
                items: { type: "string" },
                description:
                  "What the import changed or could not carry over, such as converted or dropped NeoDash reports, the " +
                  "parameter-select widgets a NeoDash import creates, and widgets left without a connection (for a NeoDash " +
                  "file only when its connection was skipped). May be empty.",
              },
              unassignedWidgetCount: {
                type: "integer",
                minimum: 0,
                description:
                  "Widgets with an empty `connectionId`, excluding content-only widgets (markdown, iframe). A widget whose " +
                  "key was left neither mapped nor skipped is not counted.",
              },
            },
          },
        ],
      },
      DashboardShare: {
        type: "object",
        required: [
          "id",
          "role",
          "createdAt",
          "userName",
          "userEmail",
          "userRole",
        ],
        properties: {
          id: {
            type: "string",
            description: "The share's id; DELETE takes it as `shareId`.",
          },
          role: { type: "string", enum: ["viewer", "editor"] },
          createdAt: { type: "string", format: "date-time", nullable: true },
          userName: { type: "string", nullable: true },
          userEmail: { type: "string", format: "email" },
          userRole: {
            type: "string",
            enum: ["admin", "creator", "reader"],
            description:
              "The sharee's global role. An editor share gives a reader no more than viewer (#1056).",
          },
        },
      },
      ShareDashboardRequest: {
        type: "object",
        required: ["email", "role"],
        properties: {
          email: {
            type: "string",
            format: "email",
            description:
              "Any user in the caller's tenant, disabled ones included, other than the caller; matched exactly (case-sensitive).",
          },
          role: { type: "string", enum: ["viewer", "editor"] },
        },
      },
      QueryRequest: {
        type: "object",
        required: ["connectionId", "query"],
        properties: {
          connectionId: { type: "string" },
          query: {
            type: "string",
            example: "MATCH (n:Movie) RETURN n.title LIMIT 10",
          },
          params: {
            type: "object",
            additionalProperties: true,
            description: "Named query parameters",
          },
          database: {
            type: "string",
            description:
              "The database to run on, for this card. Applied only when the connection allows a per-card database. " +
              "A view-level caller must send the database saved on the widget that runs this query (none, if it saves none), whatever that setting, or the answer is 403.",
          },
          tenantId: {
            type: "string",
            description:
              "Optional check: a non-empty `tenantId` must equal the session's tenant, or the answer is 403.",
          },
          rowLimit: {
            type: "integer",
            minimum: 1,
            description:
              "Return at most this many rows for this run. It can only lower the connection's row cap: a larger value runs at the cap. The query text is never changed; the driver reads one row past the limit to tell, and `meta.truncated` is present, and true, when there were more.",
          },
        },
      },
      WriteQueryRequest: {
        type: "object",
        required: ["connectionId", "query"],
        properties: {
          connectionId: { type: "string" },
          query: { type: "string" },
          params: {
            type: "object",
            additionalProperties: true,
            description:
              "Named query parameters. On a form submit, only the form's own fields are bound.",
          },
          widgetId: {
            type: "string",
            description:
              "The stored widget this write comes from, sent with `dashboardId`; the two count only together, and one alone is a plain write. " +
              "With both, the widget must be on a dashboard the caller can open and on this connection, or the answer is 404. " +
              "A form runs its saved query (the `query` sent must match it) for anyone who can open the dashboard. " +
              "Any other widget needs write permission, the caller's own connection and write mode on the widget, or the answer is 403. " +
              "Either way it runs on the widget's saved database when the connection allows a per-card one.",
          },
          dashboardId: {
            type: "string",
            description: "The dashboard that holds `widgetId`.",
          },
        },
      },
      QueryResponse: {
        type: "object",
        required: ["data", "error", "meta"],
        properties: {
          data: {
            type: "object",
            required: ["data"],
            properties: {
              data: {
                description:
                  "The result rows. A built-in connector returns an array of row objects (column name to value), empty when nothing matched; another connector's result passes through as it returns it.",
                oneOf: [
                  { type: "array", items: { type: "object" } },
                  { type: "object" },
                ],
              },
            },
          },
          error: {
            type: "object",
            nullable: true,
            description: "Always null on success.",
          },
          meta: {
            type: "object",
            required: ["resultId", "serverDurationMs", "rowLimit"],
            properties: {
              resultId: {
                type: "string",
                description:
                  "16 hex characters hashing the connection, the database the run used, the query text (trimmed, otherwise exactly as written), the params and `rowLimit`.",
              },
              serverDurationMs: {
                type: "integer",
                description:
                  "Wall time of the whole run on the server, queue wait included; not database execution time.",
              },
              rowLimit: {
                type: "integer",
                description: `The row cap this run applied: the request's \`rowLimit\` if lower, else the connection's \`maxRows\`, else ${DEFAULT_MAX_ROWS}`,
              },
              truncated: {
                type: "boolean",
                description:
                  "Present, and true, only when the result had more rows than `rowLimit`",
              },
            },
          },
        },
      },
      WriteQueryResponse: {
        type: "object",
        required: ["data", "error", "meta"],
        properties: {
          data: {
            description:
              "The rows the write returned, capped at the connection's `maxRows`. A built-in connector returns an array of row objects; another connector's result passes through as it returns it.",
            oneOf: [
              { type: "array", items: { type: "object" } },
              { type: "object" },
            ],
          },
          error: {
            type: "object",
            nullable: true,
            description: "Always null on success.",
          },
          meta: {
            type: "object",
            required: ["serverDurationMs"],
            properties: {
              serverDurationMs: {
                type: "integer",
                description:
                  "Wall time of the whole run on the server; not database execution time.",
              },
            },
          },
        },
      },
      User: {
        type: "object",
        description:
          "A user as GET /api/users, GET /api/users/{id} and PATCH /api/users/{id} answer with it.",
        required: [
          "id",
          "name",
          "email",
          "role",
          "canWrite",
          "disabledAt",
          "lastLoginAt",
          "createdAt",
        ],
        properties: {
          id: { type: "string" },
          name: {
            type: "string",
            nullable: true,
            description:
              "Can be null for a user provisioned through single sign-on without a name.",
          },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "creator", "reader"] },
          canWrite: {
            type: "boolean",
            description:
              "The stored write flag. It only matters for creators: admins always write and readers never do, whatever it holds.",
          },
          disabledAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "When the user was disabled; null while enabled. A disabled user cannot sign in or use their API keys.",
          },
          lastLoginAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "Last sign-in, recorded best effort; null until the first one. A user created through single sign-on gets it only from their second sign-in.",
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreatedUser: {
        type: "object",
        description: "The user POST /api/users answers with.",
        required: ["id", "name", "email", "role", "canWrite", "createdAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "creator", "reader"] },
          canWrite: {
            type: "boolean",
            description:
              "The stored write flag. It only matters for creators: admins always write and readers never do, whatever it holds.",
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateUserRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", format: "email" },
          password: {
            type: "string",
            minLength: 8,
            format: "password",
            description:
              "At least 8 characters, with at least one ASCII letter (A-Z or a-z) and one digit (0-9). Only the first 72 UTF-8 bytes are significant.",
          },
          role: {
            type: "string",
            enum: ["admin", "creator", "reader"],
            default: "creator",
          },
          canWrite: { type: "boolean", default: true },
          forcePasswordChange: {
            type: "boolean",
            default: false,
            description:
              "Make the user change their password at first sign-in; until then their session can make no changing API call except the password change (PUT /api/users/me/password) and the /api/auth sign-in and sign-out endpoints.",
          },
        },
      },
      UpdateUserRequest: {
        type: "object",
        description:
          "At least one of `role`, `canWrite` and `disabled` is required (400 otherwise); other keys, `name` included, are ignored.",
        properties: {
          role: { type: "string", enum: ["admin", "creator", "reader"] },
          canWrite: { type: "boolean" },
          disabled: {
            type: "boolean",
            description:
              "true sets `disabledAt` (the user can no longer sign in or use their API keys); false clears it.",
          },
        },
      },
      WidgetTemplate: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "tags",
          "chartType",
          "connectorType",
          "connectionId",
          "query",
          "params",
          "settings",
          "previewImageUrl",
          "createdBy",
          "tenantId",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          tags: {
            type: "array",
            items: { type: "string" },
            nullable: true,
            description: "[] when omitted at creation; the column allows null.",
          },
          chartType: { type: "string" },
          connectorType: {
            type: "string",
            nullable: true,
            description:
              "A registered connector type (GET /api/connectors lists the installed ones), or null for a widget that needs no connection; such a template is offered on every connection.",
          },
          connectionId: { type: "string", nullable: true },
          query: { type: "string" },
          params: {
            type: "object",
            nullable: true,
            additionalProperties: true,
          },
          settings: {
            type: "object",
            nullable: true,
            additionalProperties: true,
            description:
              "Never holds `connectionId`: the server drops it in favour of the top-level `connectionId`.",
          },
          previewImageUrl: {
            type: "string",
            nullable: true,
            description: "A data:image/ URI.",
          },
          createdBy: { type: "string" },
          tenantId: { type: "string" },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      CreateWidgetTemplateRequest: {
        type: "object",
        // connectorType is absent for a widget that needs no connection
        // (markdown, iframe) — #1900.
        required: ["name", "chartType"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", maxLength: 1000 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", maxLength: 100 },
          },
          chartType: { type: "string", minLength: 1 },
          connectorType: {
            type: "string",
            description:
              "A registered connector type; GET /api/connectors lists the installed ones. Omit it for a widget that needs no connection — such a template is offered on every connection.",
          },
          connectionId: { type: "string" },
          query: { type: "string", default: "" },
          params: { type: "object", additionalProperties: true },
          settings: {
            type: "object",
            additionalProperties: true,
            description:
              "A `connectionId` key here is dropped; set the top-level `connectionId`.",
          },
          previewImageUrl: {
            type: "string",
            pattern: "^data:image/",
            maxLength: 512000,
            description: "A data:image/ URI of at most 500 KB.",
          },
        },
      },
      UpdateWidgetTemplateRequest: {
        type: "object",
        description:
          "Every field is optional; an omitted field keeps its stored value. `updatedAt` is always bumped, so an empty object is accepted. " +
          "Only `connectionId` can be cleared to null; `params` and `settings` replace the stored object whole.",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", maxLength: 1000 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", maxLength: 100 },
          },
          chartType: { type: "string", minLength: 1 },
          connectorType: {
            type: "string",
            description:
              "A registered connector type; GET /api/connectors lists the installed ones. It cannot be cleared to null.",
          },
          connectionId: {
            type: "string",
            nullable: true,
            description: "null unbinds the template from its connection.",
          },
          query: { type: "string" },
          params: { type: "object", additionalProperties: true },
          settings: {
            type: "object",
            additionalProperties: true,
            description:
              "A `connectionId` key here is dropped; set the top-level `connectionId`.",
          },
          previewImageUrl: {
            type: "string",
            pattern: "^data:image/",
            maxLength: 512000,
            description: "A data:image/ URI of at most 500 KB.",
          },
        },
      },
      ApiKey: {
        type: "object",
        required: [
          "id",
          "name",
          "keyPrefix",
          "lastUsedAt",
          "expiresAt",
          "createdAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          keyPrefix: {
            type: "string",
            nullable: true,
            description:
              "Non-secret display prefix: `nb_` and the key's first 8 hex characters. Null for keys created before #1038.",
            example: "nb_1a2b3c4d",
          },
          createdAt: { type: "string", format: "date-time", nullable: true },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ApiKeyCreated: {
        type: "object",
        description:
          "Returned only once at creation time — includes the plaintext key.",
        required: ["id", "name", "keyPrefix", "expiresAt", "createdAt", "key"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          keyPrefix: {
            type: "string",
            description:
              "`nb_` and the first 8 hex characters of `key`; safe to display.",
            example: "nb_a1b2c3d4",
          },
          createdAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          key: {
            type: "string",
            description:
              "Plaintext API key (nb_ prefix + 64 hex chars). Shown only once.",
            example: "nb_a1b2c3d4e5f6...",
          },
        },
      },
      CreateApiKeyRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, example: "CI/CD Pipeline" },
          expiresAt: {
            type: "string",
            format: "date-time",
            description:
              "Optional expiration, in UTC with a `Z` suffix (e.g. 2026-12-31T00:00:00Z); an offset such as +02:00 or a bare date answers 400. Omit for a non-expiring key.",
          },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof SPEC;
export default SPEC;
