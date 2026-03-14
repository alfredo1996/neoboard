import { NextResponse } from "next/server";

/**
 * Standardized API response envelope.
 *
 * All management API routes return this shape:
 *   { data, error, meta }
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "TENANT_MISMATCH";

const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  TENANT_MISMATCH: 403,
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Single-resource success response. */
export function apiSuccess(
  data: unknown,
  status = 200,
  meta: Record<string, unknown> | null = null,
) {
  return NextResponse.json({ data, error: null, meta }, { status });
}

/** List response with pagination meta. */
export function apiList(
  data: unknown[],
  meta: { total: number; limit: number; offset: number },
) {
  return NextResponse.json({ data, error: null, meta });
}

/** Error response with machine-readable code. */
export function apiError(code: ApiErrorCode, message: string) {
  return NextResponse.json(
    { data: null, error: { code, message }, meta: null },
    { status: ERROR_STATUS[code] },
  );
}

// ---------------------------------------------------------------------------
// Pagination parser
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 1000;

/** Extract and validate limit/offset from request URL search params. */
export function parsePagination(request: Request): {
  limit: number;
  offset: number;
} {
  const url = new URL(request.url);
  let limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  let offset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);

  if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  if (Number.isNaN(offset) || offset < 0) offset = 0;

  return { limit, offset };
}
