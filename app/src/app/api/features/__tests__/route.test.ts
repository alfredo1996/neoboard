import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

vi.mock("next/server", () => nextResponseMockFactory());

describe("GET /api/features", () => {
  const originalEdition = process.env.NEOBOARD_EDITION;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEdition === undefined) {
      delete process.env.NEOBOARD_EDITION;
    } else {
      process.env.NEOBOARD_EDITION = originalEdition;
    }
  });

  it("returns community edition with empty features when no env var set", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { GET } = await import("../route");
    const res = await GET();
    const json = await res.json();
    expect(json.data.edition).toBe("community");
    expect(json.data.features).toEqual([]);
  });

  it("returns enterprise edition with all features when env var is set", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { GET } = await import("../route");
    const res = await GET();
    const json = await res.json();
    expect(json.data.edition).toBe("enterprise");
    expect(json.data.features).toContain("sso");
    expect(json.data.features).toContain("custom-roles");
    expect(json.data.features.length).toBeGreaterThanOrEqual(11);
  });
});
