import { z } from "zod";
import pkg from "../../../../package.json";
import { requireSession } from "@/lib/auth/session";
import { handleRouteError, sanitizeErrorMessage } from "@/lib/api/api-utils";
import { logRoute } from "@/lib/api/log-route";
import { apiLogger } from "@/lib/logger";
import { MCP_TOOLS } from "@/lib/mcp/tools";
import type { ToolContext } from "@/lib/mcp/tools";

/**
 * MCP endpoint (#1694): the Streamable HTTP transport in its stateless,
 * JSON-response form. One JSON-RPC 2.0 message per POST; no SSE stream, no
 * Mcp-Session-Id, no batches. GET and DELETE are deliberately not exported,
 * so Next.js answers them with 405 — what the spec asks of a server that
 * offers neither a stream nor sessions.
 *
 * ponytail: hand-rolled because no MCP dependency is approved. Everything
 * protocol-shaped lives in this file; swap it for mcp-handler and the tools
 * in lib/mcp/tools.ts stay as they are.
 */

/** Newest first. Older versions predate Streamable HTTP or require batching. */
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18"];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
/** Transport-level refusal (Origin, protocol header) — the MCP SDK's code. */
const TRANSPORT_ERROR = -32000;

type RpcId = string | number | null;

function rpcResult(id: RpcId, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: RpcId, code: number, message: string, status = 200) {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status },
  );
}

const rpcMessage = z.object({
  jsonrpc: z.literal("2.0"),
  // MCP forbids null ids; no id at all makes the message a notification.
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const toolCall = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

const TOOL_LIST = MCP_TOOLS.map(({ name, description, input }) => ({
  name,
  description,
  inputSchema: z.toJSONSchema(input, { io: "input" }),
}));

/**
 * The DNS-rebinding guard the transport spec requires: an Origin header, when
 * a browser sends one, must be this app's. MCP clients outside a browser send
 * none.
 *
 * ponytail: without NEXTAUTH_URL the expected origin is derived from the
 * request's Host header, which a rebinding attacker controls. Set
 * NEXTAUTH_URL to make the check meaningful against rebinding.
 */
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  return origin === new URL(process.env.NEXTAUTH_URL || request.url).origin;
}

export async function POST(request: Request) {
  return logRoute(request, "mcp", async () => {
    if (!isAllowedOrigin(request)) {
      return rpcError(
        null,
        TRANSPORT_ERROR,
        "Forbidden: Origin not allowed",
        403,
      );
    }

    try {
      const session = await requireSession();

      const version = request.headers.get("mcp-protocol-version");
      if (version !== null && !PROTOCOL_VERSIONS.includes(version)) {
        return rpcError(
          null,
          TRANSPORT_ERROR,
          `Bad Request: supported MCP-Protocol-Version values are ${PROTOCOL_VERSIONS.join(", ")}`,
          400,
        );
      }

      let body: unknown;
      try {
        body = JSON.parse(await request.text());
      } catch {
        return rpcError(null, PARSE_ERROR, "Parse error", 400);
      }

      const message = rpcMessage.safeParse(body);
      if (!message.success) {
        return rpcError(null, INVALID_REQUEST, "Invalid Request", 400);
      }

      const { id, method, params = {} } = message.data;
      // Notifications (initialized, cancelled, …) are acknowledged, never answered.
      if (id === undefined) return new Response(null, { status: 202 });

      return await answer(id, method, params, {
        session,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    } catch (error) {
      return handleRouteError(error, "MCP request failed");
    }
  });
}

async function answer(
  id: string | number,
  method: string,
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Response> {
  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion:
          typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "neoboard", version: pkg.version },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOL_LIST });
    case "tools/call":
      return callTool(id, params, ctx);
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

async function callTool(
  id: string | number,
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Response> {
  const call = toolCall.safeParse(params);
  if (!call.success) {
    return rpcError(
      id,
      INVALID_PARAMS,
      "Invalid params: a tool name is required",
    );
  }

  const tool = MCP_TOOLS.find((t) => t.name === call.data.name);
  if (!tool) {
    return rpcError(id, INVALID_PARAMS, `Unknown tool: ${call.data.name}`);
  }

  const args = tool.input.safeParse(call.data.arguments ?? {});
  if (!args.success) {
    const [issue] = args.error.issues;
    return rpcError(
      id,
      INVALID_PARAMS,
      `Invalid arguments for ${tool.name}: ${issue.path.join(".") || "arguments"}: ${issue.message}`,
    );
  }

  try {
    const result = await tool.run(args.data, ctx);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result ?? null) }],
    });
  } catch (error) {
    // A failed tool is a result the model can read and act on, not a
    // protocol error. Same redaction as REST error responses (#1227).
    apiLogger.warn(
      {
        event: "mcp_tool_error",
        tool: tool.name,
        requestId: ctx.requestId,
        err: error instanceof Error ? error : String(error),
      },
      "mcp_tool_error",
    );
    const text = sanitizeErrorMessage(
      error instanceof Error ? error.message : "",
      "Tool failed",
    );
    return rpcResult(id, { content: [{ type: "text", text }], isError: true });
  }
}
