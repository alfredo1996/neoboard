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

// Shorthand aliases for common $ref responses
const R = {
  unauthorized: { $ref: "#/components/responses/Unauthorized" },
  forbidden: { $ref: "#/components/responses/Forbidden" },
  notFound: { $ref: "#/components/responses/NotFound" },
  badRequest: { $ref: "#/components/responses/BadRequest" },
  serverError: { $ref: "#/components/responses/ServerError" },
  deleteSuccess: { $ref: "#/components/responses/DeleteSuccess" },
} as const;

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
        description: "Returns all connections owned by the authenticated user.",
        parameters: [...PAGINATION_PARAMS],
        responses: {
          200: paginatedResponse(
            "Paginated list of connection summaries (credentials excluded)",
            "#/components/schemas/ConnectionSummary",
          ),
          401: R.unauthorized,
        },
      },
      post: {
        tags: ["Connections"],
        summary: "Create connection",
        description:
          "Creates a new database connection. Credentials are encrypted at rest.",
        requestBody: jsonBody("#/components/schemas/CreateConnectionRequest"),
        responses: {
          201: jsonResponse(
            "Connection created",
            "#/components/schemas/ConnectionSummary",
          ),
          400: R.badRequest,
          401: R.unauthorized,
        },
      },
    },
    "/api/connections/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Connections"],
        summary: "Get connection",
        description:
          "Returns connection metadata plus its config with the password stripped. Owner, tenant-shared, or admin access required.",
        responses: {
          200: jsonResponse(
            "Connection detail",
            "#/components/schemas/ConnectionSummary",
          ),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      patch: {
        tags: ["Connections"],
        summary: "Update connection",
        description: "Updates the name and/or credentials of a connection.",
        requestBody: jsonBody("#/components/schemas/UpdateConnectionRequest"),
        responses: {
          200: jsonResponse(
            "Updated connection summary",
            "#/components/schemas/ConnectionSummary",
          ),
          400: R.badRequest,
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      delete: {
        tags: ["Connections"],
        summary: "Delete connection",
        responses: {
          200: R.deleteSuccess,
          401: R.unauthorized,
          404: R.notFound,
        },
      },
    },
    "/api/connections/{id}/test": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Connections"],
        summary: "Test saved connection",
        description:
          "Tests connectivity using the stored (encrypted) credentials.",
        responses: {
          200: jsonResponse(
            "Test result",
            "#/components/schemas/ConnectionTestResult",
          ),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
    },
    "/api/connections/test-inline": {
      post: {
        tags: ["Connections"],
        summary: "Test inline credentials",
        description:
          "Tests connectivity using credentials provided directly in the request body (not saved).",
        requestBody: jsonBody("#/components/schemas/TestInlineRequest"),
        responses: {
          200: jsonResponse(
            "Test result",
            "#/components/schemas/ConnectionTestResult",
          ),
          400: R.badRequest,
          401: R.unauthorized,
        },
      },
    },
    "/api/connections/{id}/schema": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Connections"],
        summary: "Get database schema",
        description:
          "Returns the schema (labels/node types, relationship types, table names) for the connection.",
        responses: {
          200: jsonResponse("Schema information", {
            type: "object",
            properties: {
              nodeLabels: { type: "array", items: { type: "string" } },
              relationshipTypes: {
                type: "array",
                items: { type: "string" },
              },
              tables: { type: "array", items: { type: "string" } },
            },
          }),
          401: R.unauthorized,
          404: R.notFound,
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
          "Returns dashboards visible to the authenticated user: owned, shared, and public. " +
          "Admins see all dashboards in the tenant.",
        parameters: [...PAGINATION_PARAMS],
        responses: {
          200: paginatedResponse(
            "Paginated list of dashboard summaries",
            "#/components/schemas/DashboardSummary",
          ),
          401: R.unauthorized,
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
        },
      },
    },
    "/api/dashboards/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Dashboards"],
        summary: "Get dashboard",
        description: "Returns the full dashboard including layout JSON.",
        responses: {
          200: jsonResponse(
            "Dashboard detail",
            "#/components/schemas/DashboardDetail",
          ),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      put: {
        tags: ["Dashboards"],
        summary: "Update dashboard",
        description:
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
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Delete dashboard",
        responses: {
          200: R.deleteSuccess,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
    },
    "/api/dashboards/{id}/duplicate": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Dashboards"],
        summary: "Duplicate dashboard",
        description:
          "Creates a copy of the dashboard with '(copy)' appended to the name.",
        responses: {
          201: jsonResponse(
            "Duplicate created",
            "#/components/schemas/Dashboard",
          ),
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
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
        description: "Exports the dashboard as a NeoDash-compatible JSON file.",
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
            content: { "application/json": { schema: { type: "object" } } },
          },
          401: R.unauthorized,
          404: R.notFound,
        },
      },
    },
    "/api/dashboards/import": {
      post: {
        tags: ["Dashboards"],
        summary: "Import dashboard",
        description:
          "Imports a dashboard from a NeoDash-compatible JSON export.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          201: jsonResponse(
            "Dashboard imported",
            "#/components/schemas/Dashboard",
          ),
          400: R.badRequest,
          401: R.unauthorized,
        },
      },
    },
    "/api/dashboards/{id}/share": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Dashboards"],
        summary: "List dashboard shares",
        responses: {
          200: { description: "Share assignments" },
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Share dashboard with user",
        responses: {
          200: { description: "Share created or updated" },
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Remove dashboard share",
        responses: {
          200: { description: "Share removed" },
          401: R.unauthorized,
          403: R.forbidden,
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
          "A write that read-only execution stopped answers 500 with `error.details.blockedWrite: true`.",
        requestBody: jsonBody("#/components/schemas/QueryRequest"),
        responses: {
          200: bodyResponse("Query results", {
            $ref: "#/components/schemas/QueryResponse",
          }),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          500: R.serverError,
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
          `The rows a write returns are capped like a read's, at the connection's \`maxRows\` or ${DEFAULT_MAX_ROWS}, with no truncation flag; the write itself is never cut short.`,
        requestBody: jsonBody("#/components/schemas/QueryRequest"),
        responses: {
          200: bodyResponse("Query results", {
            $ref: "#/components/schemas/WriteQueryResponse",
          }),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
          409: bodyResponse("A record with these values already exists", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
          500: R.serverError,
        },
      },
    },

    // ── Users ─────────────────────────────────────────────────────────
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        description: "Returns all users. **Admin only.**",
        parameters: [...PAGINATION_PARAMS],
        responses: {
          200: paginatedResponse(
            "Paginated list of users",
            "#/components/schemas/User",
          ),
          401: R.unauthorized,
          403: R.forbidden,
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create user",
        description: "Creates a new user. **Admin only.**",
        requestBody: jsonBody("#/components/schemas/CreateUserRequest"),
        responses: {
          201: jsonResponse("User created", "#/components/schemas/User"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          409: bodyResponse("Email already in use", {
            $ref: "#/components/schemas/ErrorResponse",
          }),
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
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update user",
        description: "Updates user fields. **Admin only.**",
        requestBody: jsonBody("#/components/schemas/UpdateUserRequest"),
        responses: {
          200: jsonResponse("Updated user", "#/components/schemas/User"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete user",
        description: "Deletes a user. **Admin only.**",
        responses: {
          200: R.deleteSuccess,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
    },

    // ── Widget Templates ──────────────────────────────────────────────
    "/api/widget-templates": {
      get: {
        tags: ["Widget Templates"],
        summary: "List widget templates",
        parameters: [
          ...PAGINATION_PARAMS,
          {
            name: "chartType",
            in: "query",
            schema: { type: "string" },
            description: "Filter by chart type",
          },
          {
            name: "connectorType",
            in: "query",
            schema: {
              type: "string",
              description:
                "A registered connector type. GET /api/connectors lists the installed ones.",
            },
            description: "Filter by connector type",
          },
        ],
        responses: {
          200: paginatedResponse(
            "Paginated list of widget templates",
            "#/components/schemas/WidgetTemplate",
          ),
          401: R.unauthorized,
        },
      },
      post: {
        tags: ["Widget Templates"],
        summary: "Create widget template",
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
        },
      },
    },
    "/api/widget-templates/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Widget Templates"],
        summary: "Get widget template",
        responses: {
          200: jsonResponse(
            "Widget template",
            "#/components/schemas/WidgetTemplate",
          ),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      put: {
        tags: ["Widget Templates"],
        summary: "Update widget template",
        requestBody: jsonBody(
          "#/components/schemas/CreateWidgetTemplateRequest",
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
        },
      },
      delete: {
        tags: ["Widget Templates"],
        summary: "Delete widget template",
        responses: {
          200: R.deleteSuccess,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
    },

    // ── API Keys ──────────────────────────────────────────────────────
    "/api/keys": {
      get: {
        tags: ["API Keys"],
        summary: "List API keys",
        description:
          "Returns all API keys for the authenticated user. Key hashes are never exposed.",
        responses: {
          200: jsonResponse("API key summaries", {
            type: "array",
            items: { $ref: "#/components/schemas/ApiKey" },
          }),
          401: R.unauthorized,
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
        },
      },
    },
    "/api/keys/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      delete: {
        tags: ["API Keys"],
        summary: "Revoke API key",
        description:
          "Permanently revokes an API key. Requires `canWrite` permission.",
        responses: {
          200: jsonResponse(
            "Key revoked",
            "#/components/schemas/SuccessResult",
          ),
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
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
          "Maximum number of rows to return. Defaults to 25, capped at 1000.",
      },
      OffsetParam: {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0, default: 0 },
        description:
          "Number of rows to skip. Combine with `limit` to page through results.",
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
        "#/components/schemas/SuccessResult",
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
        properties: { success: { type: "boolean" } },
      },
      PaginationMeta: {
        type: "object",
        description:
          "Pagination metadata returned by every list endpoint. `total` is the unfiltered row count for the current query.",
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
              "Present on some errors: `fields` on a config validation error, `blockedWrite` on a blocked write, `column` on a NOT NULL violation, `reason` on a 502 or 503.",
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
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: {
            type: "string",
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
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
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          config: { $ref: "#/components/schemas/ConnectionConfig" },
        },
      },
      UpdateConnectionRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          config: { $ref: "#/components/schemas/ConnectionConfig" },
        },
      },
      ConnectionConfig: {
        type: "object",
        description:
          "The connector's config bag. Its keys, which of them are required and each one's constraints are the `fields` of that connector's descriptor (`GET /api/connectors`). The bag is validated against them — a violation is a 400 whose `error.details.fields` maps each field to its message — and a key the descriptor does not declare is dropped before the config is stored. A `password`-typed field is a secret: it is never returned, and on update a blank one keeps its stored value. `maxRows` is NeoBoard's own key.",
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
        properties: {
          success: { type: "boolean" },
          error: { type: "string" },
          latencyMs: { type: "number" },
        },
      },
      TestInlineRequest: {
        type: "object",
        required: ["type", "config"],
        properties: {
          type: {
            type: "string",
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          config: { $ref: "#/components/schemas/ConnectionConfig" },
        },
      },
      Dashboard: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          isPublic: { type: "boolean" },
          userId: { type: "string" },
          tenantId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DashboardSummary: {
        allOf: [
          { $ref: "#/components/schemas/Dashboard" },
          {
            type: "object",
            properties: {
              role: {
                type: "string",
                enum: ["owner", "editor", "viewer", "admin"],
              },
              widgetCount: { type: "integer" },
            },
          },
        ],
      },
      DashboardDetail: {
        allOf: [
          { $ref: "#/components/schemas/DashboardSummary" },
          {
            type: "object",
            properties: {
              layoutJson: { type: "object", nullable: true },
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
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string", nullable: true },
          isPublic: { type: "boolean" },
          layoutJson: { type: "object", nullable: true },
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
          rowLimit: {
            type: "integer",
            minimum: 1,
            description:
              "`/api/query` only. Return at most this many rows for this run. It can only lower the connection's row cap: a larger value runs at the cap. The query text is never changed; the driver reads one row past the limit to tell, and `meta.truncated` is present, and true, when there were more.",
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
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "creator", "reader"] },
          canWrite: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateUserRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6, format: "password" },
          role: {
            type: "string",
            enum: ["admin", "creator", "reader"],
            default: "creator",
          },
          canWrite: { type: "boolean", default: true },
        },
      },
      UpdateUserRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          role: { type: "string", enum: ["admin", "creator", "reader"] },
          canWrite: { type: "boolean" },
        },
      },
      WidgetTemplate: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" } },
          chartType: { type: "string" },
          connectorType: {
            type: "string",
            description:
              "A registered connector type. GET /api/connectors lists the installed ones.",
          },
          connectionId: { type: "string", nullable: true },
          query: { type: "string" },
          params: { type: "object", nullable: true },
          settings: { type: "object", nullable: true },
          previewImageUrl: { type: "string", nullable: true },
          createdBy: { type: "string" },
          tenantId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateWidgetTemplateRequest: {
        type: "object",
        // connectorType is absent for a widget that needs no connection
        // (markdown, iframe) — #1900.
        required: ["name", "chartType"],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          chartType: { type: "string" },
          connectorType: {
            type: "string",
            description:
              "A registered connector type; GET /api/connectors lists the installed ones. Omit it for a widget that needs no connection — such a template is offered on every connection.",
          },
          connectionId: { type: "string" },
          query: { type: "string", default: "" },
          params: { type: "object" },
          settings: { type: "object" },
          previewImageUrl: { type: "string" },
        },
      },
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ApiKeyCreated: {
        type: "object",
        description:
          "Returned only once at creation time — includes the plaintext key.",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
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
              "Optional expiration date. Omit for non-expiring keys.",
          },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof SPEC;
export default SPEC;
