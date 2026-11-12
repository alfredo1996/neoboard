import { timingSafeEqual } from "node:crypto";
import { metricsRegistry } from "@/lib/metrics";

/**
 * GET /api/metrics (#2440)
 *
 * Prometheus text format, per process. Off unless METRICS_TOKEN is set (404);
 * then the request must carry `Authorization: Bearer <token>` (401). The
 * session proxy lets this path through, so the token is the only gate.
 */
export const dynamic = "force-dynamic";

function tokenMatches(header: string | null, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  // timingSafeEqual needs equal lengths; the length of the token is not secret
  // enough to matter, the content is.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<Response> {
  const token = process.env.METRICS_TOKEN;
  if (!token) return new Response("Not Found", { status: 404 });
  if (!tokenMatches(request.headers.get("authorization"), token)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    });
  }
  const registry = metricsRegistry();
  return new Response(await registry.metrics(), {
    headers: { "content-type": registry.contentType },
  });
}
