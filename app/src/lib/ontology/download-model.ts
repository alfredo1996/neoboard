import { fetchOntologyFile } from "@/hooks/use-ontology-transfer";

/** Downloads the whole Model as one JSON file (#2510). */
export async function downloadModel() {
  const file = await fetchOntologyFile();
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "neoboard-model.json";
  a.click();
  URL.revokeObjectURL(url);
}
