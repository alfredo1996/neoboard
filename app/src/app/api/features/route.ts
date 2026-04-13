import { apiSuccess } from "@/lib/api/api-response";
import { getEdition, getEnabledFeatures } from "@/lib/features/registry";

/**
 * GET /api/features
 *
 * Public endpoint — returns the current edition and the list of enabled
 * enterprise features. Clients use this to decide which UI to render and
 * whether to show locked badges on gated features.
 */
export async function GET() {
  return apiSuccess({
    edition: getEdition(),
    features: getEnabledFeatures(),
  });
}
