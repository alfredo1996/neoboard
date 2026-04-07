import { areUsersEmpty } from "@/lib/auth/signup";
import { apiSuccess } from "@/lib/api/api-response";

// Public route — no auth required. Returns only booleans, no user data.
export async function GET() {
  const bootstrapRequired = await areUsersEmpty();
  const registrationEnabled =
    process.env.REGISTRATION_ENABLED?.toLowerCase() !== "false";
  return apiSuccess({ bootstrapRequired, registrationEnabled });
}
