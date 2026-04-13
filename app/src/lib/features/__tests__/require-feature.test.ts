import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("requireFeature guard", () => {
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

  it("throws EnterpriseRequiredError when feature is not enabled", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { requireFeature, EnterpriseRequiredError } =
      await import("../require-feature");
    expect(() => requireFeature("sso")).toThrow(EnterpriseRequiredError);
    expect(() => requireFeature("sso")).toThrow(/enterprise license/i);
  });

  it("does not throw when feature is enabled", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { requireFeature } = await import("../require-feature");
    expect(() => requireFeature("sso")).not.toThrow();
    expect(() => requireFeature("custom-roles")).not.toThrow();
  });

  it("error message includes the feature id", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { requireFeature } = await import("../require-feature");
    try {
      requireFeature("custom-roles");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("custom-roles");
    }
  });

  it("EnterpriseRequiredError exposes the feature id", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { requireFeature, EnterpriseRequiredError } =
      await import("../require-feature");
    try {
      requireFeature("sso");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnterpriseRequiredError);
      expect(
        (err as InstanceType<typeof EnterpriseRequiredError>).feature,
      ).toBe("sso");
    }
  });
});
