import { triggerDownload } from "@neoboard/components";
import { unwrapResponse } from "@/lib/api/api-client";

/** Downloads the whole Model as one JSON file (#2510). */
export async function downloadModel() {
  const file = await unwrapResponse<unknown>(
    await fetch("/api/ontology/export"),
  );
  triggerDownload(
    JSON.stringify(file, null, 2),
    "neoboard-model.json",
    "application/json",
  );
}
