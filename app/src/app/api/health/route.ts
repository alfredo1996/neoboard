import { NextResponse } from "next/server";

const startTime = Date.now();

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: process.env.npm_package_version ?? "2.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
}
