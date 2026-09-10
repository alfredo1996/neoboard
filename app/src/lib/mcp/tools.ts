import { z } from "zod";
import type { UserRole } from "@/lib/db/schema";
import { DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/api/api-response";
import { listDashboards } from "@/lib/dashboard/list-dashboards";
import {
  getVisibleConnectionSchema,
  listConnections,
} from "@/lib/connector/visible-connections";
import { runReadQuery } from "@/lib/query/run-read-query";

/**
 * MCP tools (#1694): plain functions over the helpers the REST routes use, so
 * an agent holding a user's API key gets exactly that user's access — no
 * more. The JSON-RPC transport lives in app/api/mcp/route.ts.
 *
 * Read-only for now; create_widget / update_dashboard (behind canWrite) are
 * the remaining work on #1694.
 */

/** Who is calling — always from requireSession(), never from tool arguments. */
export interface ToolContext {
  session: {
    userId: string;
    role: UserRole;
    canWrite: boolean;
    tenantId: string;
  };
  requestId?: string;
}

export interface McpTool {
  name: string;
  description: string;
  input: z.ZodType;
  /** Called only with arguments that already passed `input`. */
  run: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

function tool<S extends z.ZodType>(
  name: string,
  description: string,
  input: S,
  run: (args: z.output<S>, ctx: ToolContext) => Promise<unknown>,
): McpTool {
  return {
    name,
    description,
    input,
    run: (args, ctx) => run(args as z.output<S>, ctx),
  };
}

const page = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Page size (default ${DEFAULT_LIMIT})`),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Items to skip (default 0)"),
});

const connectionId = z
  .string()
  .min(1)
  .describe("Connection id, from list_connections");

export const MCP_TOOLS: McpTool[] = [
  tool(
    "ping",
    "Check that NeoBoard is reachable and the API key is valid. Returns the key owner's user id and role.",
    z.object({}),
    async (_args, { session }) => ({
      pong: true,
      userId: session.userId,
      role: session.role,
    }),
  ),

  tool(
    "list_dashboards",
    "List the dashboards you can open — your own, those shared with you and public ones (admins see all) — with your role on each. Paginated; `total` is the full count.",
    page,
    async ({ limit = DEFAULT_LIMIT, offset = 0 }, { session }) => {
      const { items, total } = await listDashboards(session, { limit, offset });
      return { dashboards: items, total, limit, offset };
    },
  ),

  tool(
    "list_connections",
    "List the database connections you can query — your own and workspace-shared ones (admins see all). Pass an id to get_schema or run_query. Never includes credentials. Paginated; `total` is the full count.",
    page,
    async ({ limit = DEFAULT_LIMIT, offset = 0 }, { session }) => {
      const { items, total } = await listConnections(session, {
        limit,
        offset,
      });
      return { connections: items, total, limit, offset };
    },
  ),

  tool(
    "get_schema",
    "Get a connection's schema (Neo4j labels, relationship types and properties; PostgreSQL tables and columns) to write a query against it. Returns null for connector types without introspection.",
    z.object({ connectionId }),
    async (args, { session }) => {
      const found = await getVisibleConnectionSchema(
        session,
        args.connectionId,
      );
      if (!found) throw new Error("Connection not found");
      return found.schema;
    },
  ),

  tool(
    "run_query",
    "Run a Cypher (Neo4j) or SQL (PostgreSQL) query read-only and return its rows. The query runs exactly as written, in a read-only transaction, with the connection's timeout and row limit; `truncated: true` means rows were cut at `rowLimit`.",
    z.object({
      connectionId,
      query: z.string().min(1).describe("Cypher or SQL, executed unchanged"),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Query parameters. Write $param_<name> in the query and pass {"param_<name>": value}, e.g. {"param_title": "The Matrix"} for $param_title.',
        ),
      database: z
        .string()
        .optional()
        .describe(
          "Database to query instead of the connection's default; ignored unless the connection allows it",
        ),
    }),
    async (args, { session, requestId }) => {
      const outcome = await runReadQuery(session, {
        ...args,
        metadata: requestId ? { requestId } : {},
      });
      if (!outcome.ok) throw new Error(outcome.message);
      const { data, fields, truncated, rowLimit } = outcome.result;
      return {
        data,
        fields,
        rowLimit,
        ...(truncated ? { truncated: true } : {}),
      };
    },
  ),
];
