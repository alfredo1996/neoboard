import { NextResponse } from "next/server";
import SPEC from "@/lib/api/openapi-spec";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(SPEC, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
