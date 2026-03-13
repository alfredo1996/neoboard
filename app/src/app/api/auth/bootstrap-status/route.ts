import { areUsersEmpty } from "@/lib/auth/signup";
import { apiSuccess } from "@/lib/api-response";

// Public route — no auth required. Returns only a boolean, no user data.
export async function GET() {
  const bootstrapRequired = await areUsersEmpty();
  return apiSuccess({ bootstrapRequired });
}
