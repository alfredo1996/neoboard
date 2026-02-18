import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { testConnection } from "@/lib/query-executor";
import type { DbType } from "@/lib/query-executor";

const testInlineSchema = z.object({
  type: z.enum(["neo4j", "postgresql"]),
  config: z.object({
    uri: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    database: z.string().optional(),
  }),
});

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
    });

    return NextResponse.json({ success });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection test failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
