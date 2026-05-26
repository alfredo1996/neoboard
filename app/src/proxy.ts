import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Paths that use prefix matching (sub-routes allowed) */
const publicPrefixes = ["/api/auth/", "/api/openapi"];

/** Paths that require exact match */
const publicExact = new Set([
  "/login",
  "/signup",
  "/change-password",
  "/api/docs",
]);

/**
 * Ensure every request carries an `x-request-id` header so downstream
 * code (audit logs, route handlers) can correlate log entries back to
 * a single request. If the caller already supplied one we trust it —
 * upstream proxies or load balancers typically set this.
 */
function ensureRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.length > 0) return existing;
  return crypto.randomUUID();
}

function withRequestId<T extends NextResponse>(res: T, requestId: string): T {
  res.headers.set("x-request-id", requestId);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestId = ensureRequestId(req);
  // Propagate the request id downstream by mutating the forwarded
  // headers — route handlers read it via `headers().get("x-request-id")`.
  req.headers.set("x-request-id", requestId);

  // --- HTTPS redirect (opt-in, production only) ---
  // Default OFF: fresh deploys, demos, and reverse-proxy setups that
  // terminate TLS upstream don't get force-redirected to HTTPS. Opt in
  // with FORCE_HTTPS=true (matches the HSTS header behaviour in
  // next.config.ts — both gated on the same env var).
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_HTTPS?.toLowerCase() === "true"
  ) {
    const host = req.nextUrl.hostname;
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const proto = req.headers.get("x-forwarded-proto");
    if (!isLocal && proto !== "https") {
      const httpsUrl = new URL(req.nextUrl.toString());
      httpsUrl.protocol = "https:";
      return NextResponse.redirect(httpsUrl, 301);
    }
  }

  const isPublic =
    publicExact.has(pathname) ||
    publicPrefixes.some((p) => pathname.startsWith(p));
  if (isPublic) {
    return withRequestId(
      NextResponse.next({ request: { headers: req.headers } }),
      requestId,
    );
  }

  // Allow API key authenticated requests through for API routes only.
  // The nb_ prefix check is lightweight — actual validation (hash lookup, expiry)
  // happens in route handlers via requireSession() → resolveApiKeyAuth().
  // Edge Middleware cannot use Node.js crypto/DB drivers, so we keep this minimal.
  // Scoped to /api/ routes to prevent bypassing proxy auth checks for page routes.
  const authHeader = req.headers.get("authorization");
  if (pathname.startsWith("/api/") && authHeader?.startsWith("Bearer nb_")) {
    return withRequestId(
      NextResponse.next({ request: { headers: req.headers } }),
      requestId,
    );
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    // For API routes, return 401 JSON instead of redirect
    if (pathname.startsWith("/api/")) {
      return withRequestId(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        requestId,
      );
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withRequestId(NextResponse.redirect(loginUrl), requestId);
  }

  // Redirect users who must change their password before accessing anything else.
  if (
    token.forcePasswordChange &&
    pathname !== "/change-password" &&
    !pathname.startsWith("/api/")
  ) {
    return withRequestId(
      NextResponse.redirect(new URL("/change-password", req.nextUrl.origin)),
      requestId,
    );
  }

  return withRequestId(
    NextResponse.next({ request: { headers: req.headers } }),
    requestId,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
