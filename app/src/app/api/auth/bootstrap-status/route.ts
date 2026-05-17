import { areUsersEmpty } from "@/lib/auth/signup";
import { apiSuccess } from "@/lib/api/api-response";

// Public route — no auth required. Returns only booleans, no user data.
export async function GET() {
  const bootstrapRequired = await areUsersEmpty();
  // Closed by default — operators must explicitly set REGISTRATION_ENABLED=true.
  // Prevents accidental open signup when deploying without an env file.
  const registrationEnabled =
    process.env.REGISTRATION_ENABLED?.toLowerCase() === "true";
  return apiSuccess({ bootstrapRequired, registrationEnabled });
}
