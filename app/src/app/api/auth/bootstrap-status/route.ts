import { NextResponse } from "next/server";
import { areUsersEmpty } from "@/lib/auth/signup";

// Public route — no auth required. Returns only a boolean, no user data.
export async function GET() {
  const bootstrapRequired = await areUsersEmpty();
  return NextResponse.json({ bootstrapRequired });
}
