import { NextResponse } from "next/server";
import openapiSpec from "@/lib/openapi-spec";

/** Serves the OpenAPI 3.0 specification as JSON. */
export async function GET() {
  return NextResponse.json(openapiSpec, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
