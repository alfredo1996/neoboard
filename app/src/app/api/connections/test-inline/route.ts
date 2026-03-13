import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { testConnection } from "@/lib/query-executor";
import type { DbType } from "@/lib/query-executor";
import { testInlineSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = await request.json();
    const parsed = testInlineSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { type, config } = parsed.data;
    const success = await testConnection(type as DbType, {
      uri: config.uri,
      username: config.username,
      password: config.password,
      database: config.database,
      connectionTimeout: config.connectionTimeout,
      queryTimeout: config.queryTimeout,
      maxPoolSize: config.maxPoolSize,
      connectionAcquisitionTimeout: config.connectionAcquisitionTimeout,
      idleTimeout: config.idleTimeout,
      statementTimeout: config.statementTimeout,
      sslRejectUnauthorized: config.sslRejectUnauthorized,
    });

    return NextResponse.json({ success });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection test failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
