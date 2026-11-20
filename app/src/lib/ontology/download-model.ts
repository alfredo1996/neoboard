import { triggerDownload } from "@neoboard/components";
import { fetchOntologyFile } from "@/hooks/use-ontology-transfer";

/** Downloads the whole Model as one JSON file (#2510). */
export async function downloadModel() {
  const file = await fetchOntologyFile();
  triggerDownload(
    JSON.stringify(file, null, 2),
    "neoboard-model.json",
    "application/json",
  );
}
