import { describe, it, expect, vi } from "vitest";

const triggerDownload = vi.fn();
vi.mock("@neoboard/components", () => ({ triggerDownload }));

describe("downloadModel", () => {
  it("hands the file to the shared download helper as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { format: "neoboard-ontology" },
              error: null,
              meta: null,
            }),
          ),
      ),
    );
    const { downloadModel } = await import("../download-model");
    await downloadModel();
    expect(fetch).toHaveBeenCalledWith("/api/ontology/export");
    expect(triggerDownload).toHaveBeenCalledWith(
      JSON.stringify({ format: "neoboard-ontology" }, null, 2),
      "neoboard-model.json",
      "application/json",
    );
  });
});
