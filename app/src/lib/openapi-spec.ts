/**
 * NeoBoard OpenAPI 3.0 Specification
 *
 * Static spec covering all public API routes. Kept in sync manually.
 * Served at GET /api/openapi.json.
 */

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

/** Single-object JSON response pointing to a $ref schema */
function jsonResponse(description: string, schemaRef: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: schemaRef } } },
  };
}

/** Array JSON response pointing to a $ref schema */
function arrayResponse(description: string, schemaRef: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { type: "array" as const, items: { $ref: schemaRef } },
      },
    },
  };
}

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
    title: "NeoBoard API",
    version: "1.0.0",
    description:
      "REST API for NeoBoard — a dashboarding tool for hybrid Neo4j + PostgreSQL architectures. " +
      "Authenticate via session cookie (browser) or Bearer API key (programmatic access).",
    contact: {
      name: "NeoBoard",
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
    { name: "Widget Templates", description: "Reusable widget template library" },
    { name: "API Keys", description: "Programmatic API key management" },
  ],
  paths: {
    // ── Connections ────────────────────────────────────────────────────
    "/api/connections": {
      get: {
        tags: ["Connections"],
        summary: "List connections",
        description: "Returns all connections owned by the authenticated user.",
        responses: {
          200: arrayResponse("Array of connection summaries (credentials excluded)", "#/components/schemas/ConnectionSummary"),
          401: R.unauthorized,
        },
      },
      post: {
        tags: ["Connections"],
        summary: "Create connection",
        description: "Creates a new database connection. Credentials are encrypted at rest.",
        requestBody: jsonBody("#/components/schemas/CreateConnectionRequest"),
        responses: {
          201: jsonResponse("Connection created", "#/components/schemas/ConnectionSummary"),
          400: R.badRequest,
          401: R.unauthorized,
        },
      },
    },
    "/api/connections/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      patch: {
        tags: ["Connections"],
        summary: "Update connection",
        description: "Updates the name and/or credentials of a connection.",
        requestBody: jsonBody("#/components/schemas/UpdateConnectionRequest"),
        responses: {
          200: jsonResponse("Updated connection summary", "#/components/schemas/ConnectionSummary"),
          400: R.badRequest,
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      delete: {
        tags: ["Connections"],
        summary: "Delete connection",
        responses: { 200: R.deleteSuccess, 401: R.unauthorized, 404: R.notFound },
      },
    },
    "/api/connections/{id}/test": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Connections"],
        summary: "Test saved connection",
        description: "Tests connectivity using the stored (encrypted) credentials.",
        responses: {
          200: jsonResponse("Test result", "#/components/schemas/ConnectionTestResult"),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
    },
    "/api/connections/test-inline": {
      post: {
        tags: ["Connections"],
        summary: "Test inline credentials",
        description: "Tests connectivity using credentials provided directly in the request body (not saved).",
        requestBody: jsonBody("#/components/schemas/TestInlineRequest"),
        responses: {
          200: jsonResponse("Test result", "#/components/schemas/ConnectionTestResult"),
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
        description: "Returns the schema (labels/node types, relationship types, table names) for the connection.",
        responses: {
          200: {
            description: "Schema information",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    nodeLabels: { type: "array", items: { type: "string" } },
                    relationshipTypes: { type: "array", items: { type: "string" } },
                    tables: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          401: R.unauthorized,
          404: R.notFound,
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
        responses: {
          200: arrayResponse("Array of dashboard summaries", "#/components/schemas/DashboardSummary"),
          401: R.unauthorized,
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Create dashboard",
        requestBody: jsonBody("#/components/schemas/CreateDashboardRequest"),
        responses: {
          201: jsonResponse("Dashboard created", "#/components/schemas/Dashboard"),
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
          200: jsonResponse("Dashboard detail", "#/components/schemas/DashboardDetail"),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      put: {
        tags: ["Dashboards"],
        summary: "Update dashboard",
        requestBody: jsonBody("#/components/schemas/UpdateDashboardRequest"),
        responses: {
          200: jsonResponse("Updated dashboard", "#/components/schemas/Dashboard"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Delete dashboard",
        responses: { 200: R.deleteSuccess, 401: R.unauthorized, 403: R.forbidden, 404: R.notFound },
      },
    },
    "/api/dashboards/{id}/duplicate": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Dashboards"],
        summary: "Duplicate dashboard",
        description: "Creates a copy of the dashboard with '(copy)' appended to the name.",
        responses: {
          201: jsonResponse("Duplicate created", "#/components/schemas/Dashboard"),
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
          200: { description: "Dashboard export file", content: { "application/json": { schema: { type: "object" } } } },
          401: R.unauthorized,
          404: R.notFound,
        },
      },
    },
    "/api/dashboards/import": {
      post: {
        tags: ["Dashboards"],
        summary: "Import dashboard",
        description: "Imports a dashboard from a NeoDash-compatible JSON export.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          201: jsonResponse("Dashboard imported", "#/components/schemas/Dashboard"),
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
        responses: { 200: { description: "Share assignments" }, 401: R.unauthorized, 404: R.notFound },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Share dashboard with user",
        responses: { 200: { description: "Share created or updated" }, 400: R.badRequest, 401: R.unauthorized, 403: R.forbidden },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Remove dashboard share",
        responses: { 200: { description: "Share removed" }, 401: R.unauthorized, 403: R.forbidden },
      },
    },

    // ── Query ─────────────────────────────────────────────────────────
    "/api/query": {
      post: {
        tags: ["Query"],
        summary: "Execute read query",
        description: "Executes a read-only query against a connected database. Results are capped at 10,000 rows.",
        requestBody: jsonBody("#/components/schemas/QueryRequest"),
        responses: {
          200: jsonResponse("Query results", "#/components/schemas/QueryResponse"),
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
        description: "Executes a write query against a connected database. Requires `canWrite` permission on the session.",
        requestBody: jsonBody("#/components/schemas/QueryRequest"),
        responses: {
          200: jsonResponse("Query results", "#/components/schemas/QueryResponse"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
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
        responses: {
          200: arrayResponse("Array of users", "#/components/schemas/User"),
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
          409: jsonResponse("Email already in use", "#/components/schemas/Error"),
        },
      },
    },
    "/api/users/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
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
        responses: { 200: R.deleteSuccess, 401: R.unauthorized, 403: R.forbidden, 404: R.notFound },
      },
    },

    // ── Widget Templates ──────────────────────────────────────────────
    "/api/widget-templates": {
      get: {
        tags: ["Widget Templates"],
        summary: "List widget templates",
        parameters: [
          { name: "chartType", in: "query", schema: { type: "string" }, description: "Filter by chart type" },
          { name: "connectorType", in: "query", schema: { type: "string", enum: ["neo4j", "postgresql"] }, description: "Filter by connector type" },
        ],
        responses: {
          200: arrayResponse("Array of widget templates", "#/components/schemas/WidgetTemplate"),
          401: R.unauthorized,
        },
      },
      post: {
        tags: ["Widget Templates"],
        summary: "Create widget template",
        requestBody: jsonBody("#/components/schemas/CreateWidgetTemplateRequest"),
        responses: {
          201: jsonResponse("Template created", "#/components/schemas/WidgetTemplate"),
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
          200: jsonResponse("Widget template", "#/components/schemas/WidgetTemplate"),
          401: R.unauthorized,
          404: R.notFound,
        },
      },
      put: {
        tags: ["Widget Templates"],
        summary: "Update widget template",
        requestBody: jsonBody("#/components/schemas/CreateWidgetTemplateRequest"),
        responses: {
          200: jsonResponse("Updated template", "#/components/schemas/WidgetTemplate"),
          400: R.badRequest,
          401: R.unauthorized,
          403: R.forbidden,
          404: R.notFound,
        },
      },
      delete: {
        tags: ["Widget Templates"],
        summary: "Delete widget template",
        responses: { 200: R.deleteSuccess, 401: R.unauthorized, 403: R.forbidden, 404: R.notFound },
      },
    },

    // ── API Keys ──────────────────────────────────────────────────────
    "/api/keys": {
      get: {
        tags: ["API Keys"],
        summary: "List API keys",
        description: "Returns all API keys for the authenticated user. Key hashes are never exposed.",
        responses: {
          200: jsonResponse("Envelope containing array of API key summaries", "#/components/schemas/ApiKeyListEnvelope"),
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
          201: jsonResponse("Envelope containing the created key with plaintext (shown only once)", "#/components/schemas/ApiKeyCreatedEnvelope"),
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
        description: "Permanently revokes an API key. Requires `canWrite` permission.",
        responses: {
          200: jsonResponse("Key revoked", "#/components/schemas/EnvelopeSuccess"),
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
        description: "API key prefixed with `nb_`. Obtain from Settings → API Keys.",
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
    },
    responses: {
      Unauthorized: jsonResponse("Not authenticated", "#/components/schemas/Error"),
      Forbidden: jsonResponse("Insufficient permissions", "#/components/schemas/Error"),
      NotFound: jsonResponse("Resource not found", "#/components/schemas/Error"),
      BadRequest: jsonResponse("Validation error", "#/components/schemas/Error"),
      ServerError: jsonResponse("Internal server error", "#/components/schemas/Error"),
      DeleteSuccess: jsonResponse("Resource deleted", "#/components/schemas/SuccessResult"),
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
      SuccessResult: {
        type: "object",
        properties: { success: { type: "boolean" } },
      },
      EnvelopeError: {
        type: "object",
        nullable: true,
        properties: { message: { type: "string" } },
      },
      ConnectionSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["neo4j", "postgresql"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateConnectionRequest: {
        type: "object",
        required: ["name", "type", "config"],
        properties: {
          name: { type: "string", minLength: 1, example: "Production Neo4j" },
          type: { type: "string", enum: ["neo4j", "postgresql"] },
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
        required: ["uri", "username", "password"],
        properties: {
          uri: { type: "string", example: "neo4j+s://xxx.databases.neo4j.io" },
          username: { type: "string", example: "neo4j" },
          password: { type: "string", format: "password" },
          database: { type: "string", example: "neo4j" },
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
          type: { type: "string", enum: ["neo4j", "postgresql"] },
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
              role: { type: "string", enum: ["owner", "editor", "viewer", "admin"] },
              widgetCount: { type: "integer" },
              preview: { type: "array", items: { $ref: "#/components/schemas/WidgetPreviewItem" } },
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
      WidgetPreviewItem: {
        type: "object",
        properties: {
          x: { type: "integer" },
          y: { type: "integer" },
          w: { type: "integer" },
          h: { type: "integer" },
          chartType: { type: "string" },
          thumbnailUrl: { type: "string", nullable: true },
        },
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
          thumbnailJson: { type: "object", nullable: true },
        },
      },
      QueryRequest: {
        type: "object",
        required: ["connectionId", "query"],
        properties: {
          connectionId: { type: "string" },
          query: { type: "string", example: "MATCH (n:Movie) RETURN n.title LIMIT 10" },
          params: { type: "object", additionalProperties: true, description: "Named query parameters" },
        },
      },
      QueryResponse: {
        type: "object",
        properties: {
          data: { oneOf: [{ type: "array", items: { type: "object" } }, { type: "object" }] },
          resultId: { type: "string", description: "Deterministic hash of connection + query + params" },
          serverDurationMs: { type: "integer" },
          truncated: { type: "boolean", description: "True when results were capped at 10,000 rows" },
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
          role: { type: "string", enum: ["admin", "creator", "reader"], default: "creator" },
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
          connectorType: { type: "string", enum: ["neo4j", "postgresql"] },
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
        required: ["name", "chartType", "connectorType"],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          chartType: { type: "string" },
          connectorType: { type: "string", enum: ["neo4j", "postgresql"] },
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
        description: "Returned only once at creation time — includes the plaintext key.",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          key: { type: "string", description: "Plaintext API key (nb_ prefix + 64 hex chars). Shown only once.", example: "nb_a1b2c3d4e5f6..." },
        },
      },
      CreateApiKeyRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, example: "CI/CD Pipeline" },
          expiresAt: { type: "string", format: "date-time", description: "Optional expiration date. Omit for non-expiring keys." },
        },
      },
      ApiKeyListEnvelope: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } },
          error: { $ref: "#/components/schemas/EnvelopeError" },
          meta: { type: "object", nullable: true },
        },
      },
      ApiKeyCreatedEnvelope: {
        type: "object",
        properties: {
          data: { $ref: "#/components/schemas/ApiKeyCreated" },
          error: { $ref: "#/components/schemas/EnvelopeError" },
          meta: { type: "object", nullable: true },
        },
      },
      EnvelopeSuccess: {
        type: "object",
        properties: {
          data: { $ref: "#/components/schemas/SuccessResult" },
          error: { $ref: "#/components/schemas/EnvelopeError" },
          meta: { type: "object", nullable: true },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof SPEC;
export default SPEC;
