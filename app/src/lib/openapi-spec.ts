/**
 * NeoBoard OpenAPI 3.0 Specification
 *
 * Static spec covering all public API routes. Kept in sync manually.
 * Served at GET /api/openapi.json.
 */

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
    "/api/connections": {
      get: {
        tags: ["Connections"],
        summary: "List connections",
        description: "Returns all connections owned by the authenticated user.",
        responses: {
          200: {
            description: "Array of connection summaries (credentials excluded)",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ConnectionSummary" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Connections"],
        summary: "Create connection",
        description: "Creates a new database connection. Credentials are encrypted at rest.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateConnectionRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Connection created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectionSummary" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/connections/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      patch: {
        tags: ["Connections"],
        summary: "Update connection",
        description: "Updates the name and/or credentials of a connection.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateConnectionRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Updated connection summary",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectionSummary" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Connections"],
        summary: "Delete connection",
        responses: {
          200: { $ref: "#/components/responses/DeleteSuccess" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/connections/{id}/test": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Connections"],
        summary: "Test saved connection",
        description: "Tests connectivity using the stored (encrypted) credentials.",
        responses: {
          200: {
            description: "Test result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectionTestResult" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/connections/test-inline": {
      post: {
        tags: ["Connections"],
        summary: "Test inline credentials",
        description: "Tests connectivity using credentials provided directly in the request body (not saved).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TestInlineRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Test result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectionTestResult" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
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
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/dashboards": {
      get: {
        tags: ["Dashboards"],
        summary: "List dashboards",
        description:
          "Returns dashboards visible to the authenticated user: owned, shared, and public. " +
          "Admins see all dashboards in the tenant.",
        responses: {
          200: {
            description: "Array of dashboard summaries",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DashboardSummary" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Create dashboard",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateDashboardRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Dashboard created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
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
          200: {
            description: "Dashboard detail",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardDetail" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        tags: ["Dashboards"],
        summary: "Update dashboard",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateDashboardRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Updated dashboard",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Delete dashboard",
        responses: {
          200: { $ref: "#/components/responses/DeleteSuccess" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/dashboards/{id}/duplicate": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      post: {
        tags: ["Dashboards"],
        summary: "Duplicate dashboard",
        description: "Creates a copy of the dashboard with '(copy)' appended to the name.",
        responses: {
          201: {
            description: "Duplicate created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
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
            description: "Dashboard export file",
            content: { "application/json": { schema: { type: "object" } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/dashboards/import": {
      post: {
        tags: ["Dashboards"],
        summary: "Import dashboard",
        description: "Imports a dashboard from a NeoDash-compatible JSON export.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          201: {
            description: "Dashboard imported",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
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
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Share dashboard with user",
        responses: {
          200: { description: "Share created or updated" },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Remove dashboard share",
        responses: {
          200: { description: "Share removed" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/query": {
      post: {
        tags: ["Query"],
        summary: "Execute read query",
        description:
          "Executes a read-only query against a connected database. " +
          "Results are capped at 10,000 rows.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/QueryRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Query results",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueryResponse" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/query/write": {
      post: {
        tags: ["Query"],
        summary: "Execute write query",
        description:
          "Executes a write query against a connected database. " +
          "Requires `canWrite` permission on the session.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/QueryRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Query results",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueryResponse" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        description: "Returns all users. **Admin only.**",
        responses: {
          200: {
            description: "Array of users",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/User" } },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create user",
        description: "Creates a new user. **Admin only.**",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "User created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          409: {
            description: "Email already in use",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/users/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      patch: {
        tags: ["Users"],
        summary: "Update user",
        description: "Updates user fields. **Admin only.**",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateUserRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Updated user",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete user",
        description: "Deletes a user. **Admin only.**",
        responses: {
          200: { $ref: "#/components/responses/DeleteSuccess" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/widget-templates": {
      get: {
        tags: ["Widget Templates"],
        summary: "List widget templates",
        parameters: [
          {
            name: "chartType",
            in: "query",
            schema: { type: "string" },
            description: "Filter by chart type",
          },
          {
            name: "connectorType",
            in: "query",
            schema: { type: "string", enum: ["neo4j", "postgresql"] },
            description: "Filter by connector type",
          },
        ],
        responses: {
          200: {
            description: "Array of widget templates",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WidgetTemplate" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Widget Templates"],
        summary: "Create widget template",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWidgetTemplateRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Template created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WidgetTemplate" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/widget-templates/{id}": {
      parameters: [{ $ref: "#/components/parameters/IdPath" }],
      get: {
        tags: ["Widget Templates"],
        summary: "Get widget template",
        responses: {
          200: {
            description: "Widget template",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WidgetTemplate" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        tags: ["Widget Templates"],
        summary: "Update widget template",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWidgetTemplateRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Updated template",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WidgetTemplate" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Widget Templates"],
        summary: "Delete widget template",
        responses: {
          200: { $ref: "#/components/responses/DeleteSuccess" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/keys": {
      get: {
        tags: ["API Keys"],
        summary: "List API keys",
        description: "Returns all API keys for the authenticated user. Key hashes are never exposed.",
        responses: {
          200: {
            description: "Envelope containing array of API key summaries",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKeyListEnvelope" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["API Keys"],
        summary: "Create API key",
        description:
          "Creates a new API key. The plaintext key (prefixed `nb_`) is returned **only once** in the response — " +
          "it cannot be retrieved again. Requires `canWrite` permission.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateApiKeyRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Envelope containing the created key with plaintext (shown only once)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKeyCreatedEnvelope" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
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
          200: {
            description: "Key revoked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EnvelopeSuccess" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
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
      Unauthorized: {
        description: "Not authenticated",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Unauthorized" },
          },
        },
      },
      Forbidden: {
        description: "Insufficient permissions",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Forbidden" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Not found" },
          },
        },
      },
      BadRequest: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Name is required" },
          },
        },
      },
      ServerError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: { error: "Internal server error" },
          },
        },
      },
      DeleteSuccess: {
        description: "Resource deleted",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SuccessResult" },
          },
        },
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
        },
      },
      SuccessResult: {
        type: "object",
        properties: {
          success: { type: "boolean" },
        },
      },
      EnvelopeError: {
        type: "object",
        nullable: true,
        properties: {
          message: { type: "string" },
        },
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
              role: {
                type: "string",
                enum: ["owner", "editor", "viewer", "admin"],
              },
              widgetCount: { type: "integer" },
              preview: {
                type: "array",
                items: { $ref: "#/components/schemas/WidgetPreviewItem" },
              },
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
          query: {
            type: "string",
            example: "MATCH (n:Movie) RETURN n.title LIMIT 10",
          },
          params: {
            type: "object",
            additionalProperties: true,
            description: "Named query parameters",
          },
        },
      },
      QueryResponse: {
        type: "object",
        properties: {
          data: {
            oneOf: [
              { type: "array", items: { type: "object" } },
              { type: "object" },
            ],
          },
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
          key: {
            type: "string",
            description: "Plaintext API key (nb_ prefix + 64 hex chars). Shown only once.",
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
            description: "Optional expiration date. Omit for non-expiring keys.",
          },
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
