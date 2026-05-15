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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- HTTPS redirect (production only) ---
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_HTTPS?.toLowerCase() !== "false"
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
  if (isPublic) return NextResponse.next();

  // Allow API key authenticated requests through for API routes only.
  // The nb_ prefix check is lightweight — actual validation (hash lookup, expiry)
  // happens in route handlers via requireSession() → resolveApiKeyAuth().
  // Edge Middleware cannot use Node.js crypto/DB drivers, so we keep this minimal.
  // Scoped to /api/ routes to prevent bypassing proxy auth checks for page routes.
  const authHeader = req.headers.get("authorization");
  if (pathname.startsWith("/api/") && authHeader?.startsWith("Bearer nb_")) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    // For API routes, return 401 JSON instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect users who must change their password before accessing anything else.
  if (
    token.forcePasswordChange &&
    pathname !== "/change-password" &&
    !pathname.startsWith("/api/")
  ) {
    return NextResponse.redirect(
      new URL("/change-password", req.nextUrl.origin),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
