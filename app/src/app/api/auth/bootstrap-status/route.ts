import { areUsersEmpty } from "@/lib/auth/signup";
import { isRegistrationEnabled } from "@/lib/auth/registration";
import { apiSuccess } from "@/lib/api/api-response";
import { withPublicAuthRateLimit } from "@/lib/api/with-rate-limit";

// Public route — no auth required. Returns only booleans, no user data.
// Rate-limited per IP (#819): it hits the DB on every signup-page render.
export const GET = withPublicAuthRateLimit(async () => {
  const bootstrapRequired = await areUsersEmpty();
  return apiSuccess({
    bootstrapRequired,
    registrationEnabled: isRegistrationEnabled(),
  });
});
