import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPaths = ["/login", "/signup", "/api/auth", "/api/docs", "/api/openapi"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Allow API key authenticated requests through for API routes only.
  // The nb_ prefix check is lightweight — actual validation (hash lookup, expiry)
  // happens in route handlers via requireSession() → resolveApiKeyAuth().
  // Edge Middleware cannot use Node.js crypto/DB drivers, so we keep this minimal.
  // Scoped to /api/ routes to prevent bypassing middleware auth checks for page routes.
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
