import { describe, it, expect, vi } from "vitest";

const triggerDownload = vi.fn();
vi.mock("@neoboard/components", () => ({ triggerDownload }));
vi.mock("@/hooks/use-ontology-transfer", () => ({
  fetchOntologyFile: async () => ({ format: "neoboard-ontology" }),
}));

describe("downloadModel", () => {
  it("hands the file to the shared download helper as JSON", async () => {
    const { downloadModel } = await import("../download-model");
    await downloadModel();
    expect(triggerDownload).toHaveBeenCalledWith(
      JSON.stringify({ format: "neoboard-ontology" }, null, 2),
      "neoboard-model.json",
      "application/json",
    );
  });
});
