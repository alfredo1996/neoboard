/**
 * OpenAPI 3.0 specification for the NeoBoard Management API.
 *
 * This spec is served at /api/openapi and consumed by Swagger UI at /api/docs.
 * Keep in sync with route handlers when adding/modifying endpoints.
 */

const ENVELOPE_ERROR = {
  type: "object" as const,
  properties: {
    data: { type: "null" as const },
    error: {
      type: "object" as const,
      properties: {
        code: {
          type: "string" as const,
          enum: [
            "UNAUTHORIZED",
            "FORBIDDEN",
            "NOT_FOUND",
            "BAD_REQUEST",
            "VALIDATION_ERROR",
            "CONFLICT",
            "INTERNAL_ERROR",
            "TENANT_MISMATCH",
          ],
        },
        message: { type: "string" as const },
      },
      required: ["code", "message"],
    },
    meta: { type: "null" as const },
  },
  required: ["data", "error", "meta"],
};

function envelopeSuccess(
  dataSchema: Record<string, unknown>,
  metaSchema?: Record<string, unknown>,
) {
  return {
    type: "object" as const,
    properties: {
      data: dataSchema,
      error: { type: "null" as const },
      meta: metaSchema ?? { type: "null" as const },
    },
    required: ["data", "error", "meta"],
  };
}

function envelopeList(
  itemSchema: Record<string, unknown>,
) {
  return envelopeSuccess(
    { type: "array" as const, items: itemSchema },
    {
      type: "object" as const,
      properties: {
        total: { type: "integer" as const },
        limit: { type: "integer" as const },
        offset: { type: "integer" as const },
      },
      required: ["total", "limit", "offset"],
    },
  );
}

const paginationParams = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", default: 25, minimum: 1, maximum: 1000 },
    description: "Max items per page (default 25, max 1000)",
  },
  {
    name: "offset",
    in: "query",
    schema: { type: "integer", default: 0, minimum: 0 },
    description: "Number of items to skip",
  },
];

// ---------------------------------------------------------------------------
// Reusable parameters and response fragments
// ---------------------------------------------------------------------------

const idPathParam = {
  name: "id",
  in: "path" as const,
  required: true,
  schema: { type: "string" as const },
};

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ENVELOPE_ERROR } },
});

const deletedResponse = envelopeSuccess({
  type: "object" as const,
  properties: { deleted: { type: "boolean" as const } },
});

const successEnvelope = envelopeSuccess({
  type: "object" as const,
  properties: { success: { type: "boolean" as const } },
});

const connectionConfigSchema = {
  type: "object" as const,
  required: ["uri", "username", "password"],
  properties: {
    uri: { type: "string" as const },
    username: { type: "string" as const },
    password: { type: "string" as const },
    database: { type: "string" as const },
  },
};

// ---------------------------------------------------------------------------
// Reusable schemas
// ---------------------------------------------------------------------------

const UserSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    name: { type: "string" as const, nullable: true },
    email: { type: "string" as const, nullable: true },
    role: { type: "string" as const, enum: ["admin", "creator", "reader"] },
    canWrite: { type: "boolean" as const },
    createdAt: { type: "string" as const, format: "date-time" },
  },
};

const ConnectionSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    name: { type: "string" as const },
    type: { type: "string" as const, enum: ["neo4j", "postgresql"] },
    createdAt: { type: "string" as const, format: "date-time" },
    updatedAt: { type: "string" as const, format: "date-time" },
  },
};

const DashboardSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    name: { type: "string" as const },
    description: { type: "string" as const, nullable: true },
    isPublic: { type: "boolean" as const, nullable: true },
    createdAt: { type: "string" as const, format: "date-time" },
    updatedAt: { type: "string" as const, format: "date-time" },
    role: { type: "string" as const, enum: ["owner", "viewer", "editor", "admin"] },
    layoutJson: { type: "object" as const, nullable: true },
    userId: { type: "string" as const },
  },
};

const WidgetTemplateSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    name: { type: "string" as const },
    description: { type: "string" as const, nullable: true },
    tags: { type: "array" as const, items: { type: "string" as const } },
    chartType: { type: "string" as const },
    connectorType: { type: "string" as const, enum: ["neo4j", "postgresql"] },
    connectionId: { type: "string" as const, nullable: true },
    query: { type: "string" as const },
    params: { type: "object" as const },
    settings: { type: "object" as const },
    previewImageUrl: { type: "string" as const, nullable: true },
    createdAt: { type: "string" as const, format: "date-time" },
    updatedAt: { type: "string" as const, format: "date-time" },
  },
};

const ShareSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    role: { type: "string" as const, enum: ["viewer", "editor"] },
    createdAt: { type: "string" as const, format: "date-time" },
    userName: { type: "string" as const, nullable: true },
    userEmail: { type: "string" as const, nullable: true },
  },
};

// ---------------------------------------------------------------------------
// Full spec
// ---------------------------------------------------------------------------

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "NeoBoard Management API",
    version: "0.7.0",
    description:
      "REST API for managing NeoBoard resources — users, connections, dashboards, widget templates, and query execution. All responses use a standardized `{ data, error, meta }` envelope.",
    license: { name: "Apache-2.0" },
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Users", description: "User management (admin only)" },
    { name: "Connections", description: "Database connection management" },
    { name: "Dashboards", description: "Dashboard CRUD, sharing, import/export" },
    { name: "Widget Templates", description: "Reusable widget templates" },
    { name: "Query", description: "Query execution" },
    { name: "Auth", description: "Authentication utilities" },
  ],
  paths: {
    // ── Users ──────────────────────────────────────────────────────────
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        description: "Returns paginated list of users. Requires admin role.",
        parameters: paginationParams,
        responses: {
          "200": {
            description: "Paginated user list",
            content: { "application/json": { schema: envelopeList(UserSchema) } },
          },
          "403": {
            ...errorResponse("Forbidden — admin role required"),
          },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create user",
        description: "Creates a new user. Requires admin role.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                  role: { type: "string", enum: ["admin", "creator", "reader"], default: "creator" },
                  canWrite: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User created",
            content: { "application/json": { schema: envelopeSuccess(UserSchema) } },
          },
          "409": {
            ...errorResponse("Email already exists"),
          },
        },
      },
    },
    "/api/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get user by ID",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "User details",
            content: { "application/json": { schema: envelopeSuccess(UserSchema) } },
          },
          "404": {
            ...errorResponse("User not found"),
          },
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update user",
        description: "Update user role or write permission. At least one field required.",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["admin", "creator", "reader"] },
                  canWrite: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "User updated",
            content: { "application/json": { schema: envelopeSuccess(UserSchema) } },
          },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete user",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "User deleted",
            content: {
              "application/json": { schema: deletedResponse },
            },
          },
        },
      },
    },

    // ── Connections ────────────────────────────────────────────────────
    "/api/connections": {
      get: {
        tags: ["Connections"],
        summary: "List connections",
        description: "Admin sees all tenant connections; non-admin sees own.",
        parameters: paginationParams,
        responses: {
          "200": {
            description: "Paginated connection list",
            content: { "application/json": { schema: envelopeList(ConnectionSchema) } },
          },
        },
      },
      post: {
        tags: ["Connections"],
        summary: "Create connection",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "type", "config"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  type: { type: "string", enum: ["neo4j", "postgresql"] },
                  config: connectionConfigSchema,
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Connection created",
            content: { "application/json": { schema: envelopeSuccess(ConnectionSchema) } },
          },
        },
      },
    },
    "/api/connections/{id}": {
      get: {
        tags: ["Connections"],
        summary: "Get connection by ID",
        description: "Returns connection metadata (never encrypted credentials).",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Connection details",
            content: { "application/json": { schema: envelopeSuccess(ConnectionSchema) } },
          },
          "404": {
            ...errorResponse("Connection not found"),
          },
        },
      },
      patch: {
        tags: ["Connections"],
        summary: "Update connection",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  config: connectionConfigSchema,
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Connection updated",
            content: { "application/json": { schema: envelopeSuccess(ConnectionSchema) } },
          },
        },
      },
      delete: {
        tags: ["Connections"],
        summary: "Delete connection",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Connection deleted",
            content: {
              "application/json": { schema: deletedResponse },
            },
          },
        },
      },
    },
    "/api/connections/{id}/test": {
      post: {
        tags: ["Connections"],
        summary: "Test saved connection",
        description: "Tests connectivity of a saved connection.",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Test result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/connections/test-inline": {
      post: {
        tags: ["Connections"],
        summary: "Test connection inline",
        description: "Tests connectivity with provided credentials (no save).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "config"],
                properties: {
                  type: { type: "string", enum: ["neo4j", "postgresql"] },
                  config: connectionConfigSchema,
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Test result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/connections/{id}/schema": {
      get: {
        tags: ["Connections"],
        summary: "Get database schema",
        description: "Returns the schema (tables, labels, relationships) for a connection.",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Database schema",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },

    // ── Dashboards ─────────────────────────────────────────────────────
    "/api/dashboards": {
      get: {
        tags: ["Dashboards"],
        summary: "List dashboards",
        description: "Returns owned, shared, and public dashboards (deduplicated).",
        parameters: paginationParams,
        responses: {
          "200": {
            description: "Paginated dashboard list",
            content: { "application/json": { schema: envelopeList(DashboardSchema) } },
          },
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Create dashboard",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Dashboard created",
            content: { "application/json": { schema: envelopeSuccess(DashboardSchema) } },
          },
        },
      },
    },
    "/api/dashboards/{id}": {
      get: {
        tags: ["Dashboards"],
        summary: "Get dashboard by ID",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Dashboard details with layout",
            content: { "application/json": { schema: envelopeSuccess(DashboardSchema) } },
          },
          "404": {
            ...errorResponse("Dashboard not found"),
          },
        },
      },
      put: {
        tags: ["Dashboards"],
        summary: "Update dashboard",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                  layoutJson: { type: "object", description: "Dashboard layout (version 2)" },
                  isPublic: { type: "boolean" },
                  thumbnailJson: { type: "object", description: "Widget thumbnail data-URIs" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Dashboard updated",
            content: { "application/json": { schema: envelopeSuccess(DashboardSchema) } },
          },
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Delete dashboard",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Dashboard deleted",
            content: {
              "application/json": { schema: deletedResponse },
            },
          },
        },
      },
    },
    "/api/dashboards/{id}/duplicate": {
      post: {
        tags: ["Dashboards"],
        summary: "Duplicate dashboard",
        description: "Creates a copy of the dashboard. Requires write permission.",
        parameters: [idPathParam],
        responses: {
          "201": {
            description: "Dashboard duplicated",
            content: { "application/json": { schema: envelopeSuccess(DashboardSchema) } },
          },
        },
      },
    },
    "/api/dashboards/import": {
      post: {
        tags: ["Dashboards"],
        summary: "Import dashboard",
        description: "Import a NeoBoard or NeoDash dashboard export.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["payload"],
                properties: {
                  payload: { type: "object", description: "Export payload (NeoBoard or NeoDash format)" },
                  connectionMapping: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    description: "Map export connection IDs to real connection IDs",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Dashboard imported",
            content: { "application/json": { schema: envelopeSuccess(DashboardSchema) } },
          },
        },
      },
    },
    "/api/dashboards/{id}/export": {
      get: {
        tags: ["Dashboards"],
        summary: "Export dashboard",
        description: "Downloads the dashboard as a JSON file.",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Dashboard export file",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/api/dashboards/{id}/share": {
      get: {
        tags: ["Dashboards"],
        summary: "List shares",
        description: "List all users with whom the dashboard is shared.",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Share list",
            content: {
              "application/json": {
                schema: envelopeSuccess({
                  type: "array",
                  items: ShareSchema,
                }),
              },
            },
          },
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Share dashboard",
        description: "Share a dashboard with a user by email. Creates or updates the share.",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "role"],
                properties: {
                  email: { type: "string", format: "email" },
                  role: { type: "string", enum: ["viewer", "editor"] },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Share created/updated",
            content: {
              "application/json": {
                schema: successEnvelope,
              },
            },
          },
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Remove share",
        parameters: [
          idPathParam,
          { name: "shareId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Share removed",
            content: {
              "application/json": {
                schema: successEnvelope,
              },
            },
          },
        },
      },
    },

    // ── Widget Templates ───────────────────────────────────────────────
    "/api/widget-templates": {
      get: {
        tags: ["Widget Templates"],
        summary: "List widget templates",
        parameters: [
          ...paginationParams,
          { name: "chartType", in: "query", schema: { type: "string" }, description: "Filter by chart type" },
          { name: "connectorType", in: "query", schema: { type: "string", enum: ["neo4j", "postgresql"] }, description: "Filter by connector type" },
        ],
        responses: {
          "200": {
            description: "Paginated template list",
            content: { "application/json": { schema: envelopeList(WidgetTemplateSchema) } },
          },
        },
      },
      post: {
        tags: ["Widget Templates"],
        summary: "Create widget template",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "chartType", "connectorType", "previewImageUrl"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  chartType: { type: "string" },
                  connectorType: { type: "string", enum: ["neo4j", "postgresql"] },
                  connectionId: { type: "string" },
                  query: { type: "string" },
                  params: { type: "object" },
                  settings: { type: "object" },
                  previewImageUrl: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Template created",
            content: { "application/json": { schema: envelopeSuccess(WidgetTemplateSchema) } },
          },
        },
      },
    },
    "/api/widget-templates/{id}": {
      get: {
        tags: ["Widget Templates"],
        summary: "Get widget template by ID",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Template details",
            content: { "application/json": { schema: envelopeSuccess(WidgetTemplateSchema) } },
          },
        },
      },
      put: {
        tags: ["Widget Templates"],
        summary: "Update widget template",
        parameters: [idPathParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  chartType: { type: "string" },
                  connectorType: { type: "string", enum: ["neo4j", "postgresql"] },
                  connectionId: { type: "string", nullable: true },
                  query: { type: "string" },
                  params: { type: "object" },
                  settings: { type: "object" },
                  previewImageUrl: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Template updated",
            content: { "application/json": { schema: envelopeSuccess(WidgetTemplateSchema) } },
          },
        },
      },
      delete: {
        tags: ["Widget Templates"],
        summary: "Delete widget template",
        parameters: [idPathParam],
        responses: {
          "200": {
            description: "Template deleted",
            content: {
              "application/json": { schema: deletedResponse },
            },
          },
        },
      },
    },

    // ── Query ──────────────────────────────────────────────────────────
    "/api/query": {
      post: {
        tags: ["Query"],
        summary: "Execute read query",
        description: "Executes a read-only query against a database connection. Results are truncated at 10,000 rows.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["connectionId", "query"],
                properties: {
                  connectionId: { type: "string" },
                  query: { type: "string" },
                  params: { type: "object", description: "Query parameters" },
                  tenantId: { type: "string", description: "Defense-in-depth tenant assertion" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Query results",
            content: {
              "application/json": {
                schema: envelopeSuccess(
                  {
                    type: "object",
                    properties: {
                      data: { description: "Row data (array) or graph data (object)" },
                      fields: { type: "array", items: { type: "string" } },
                    },
                  },
                  {
                    type: "object",
                    properties: {
                      resultId: { type: "string", description: "Deterministic hash for cache/state" },
                      serverDurationMs: { type: "integer" },
                      truncated: { type: "boolean", description: "True if result exceeded 10,000 rows" },
                    },
                  },
                ),
              },
            },
          },
        },
      },
    },
    "/api/query/write": {
      post: {
        tags: ["Query"],
        summary: "Execute write query",
        description: "Executes a write query. Requires `canWrite` permission.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["connectionId", "query"],
                properties: {
                  connectionId: { type: "string" },
                  query: { type: "string" },
                  params: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Write result",
            content: {
              "application/json": {
                schema: envelopeSuccess(
                  { type: "object", description: "Write operation result" },
                  {
                    type: "object",
                    properties: {
                      serverDurationMs: { type: "integer" },
                    },
                  },
                ),
              },
            },
          },
          "403": {
            ...errorResponse("Write permission required"),
          },
        },
      },
    },

    // ── Auth ───────────────────────────────────────────────────────────
    "/api/auth/bootstrap-status": {
      get: {
        tags: ["Auth"],
        summary: "Check bootstrap status",
        description: "Public endpoint. Returns whether initial admin setup is required.",
        security: [],
        responses: {
          "200": {
            description: "Bootstrap status",
            content: {
              "application/json": {
                schema: envelopeSuccess({
                  type: "object",
                  properties: {
                    bootstrapRequired: { type: "boolean" },
                  },
                }),
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Session JWT token from Auth.js",
      },
    },
  },
  security: [{ bearerAuth: [] }],
};
