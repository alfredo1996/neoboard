import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("feature registry", () => {
  const originalEdition = process.env.NEOBOARD_EDITION;

  beforeEach(() => {
    // Re-import fresh for each test to reset module state
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEdition === undefined) {
      delete process.env.NEOBOARD_EDITION;
    } else {
      process.env.NEOBOARD_EDITION = originalEdition;
    }
  });

  describe("community edition (default)", () => {
    it("defaults to community when NEOBOARD_EDITION is unset", async () => {
      delete process.env.NEOBOARD_EDITION;
      const { getEdition, isEnterpriseEdition } = await import("../registry");
      expect(getEdition()).toBe("community");
      expect(isEnterpriseEdition()).toBe(false);
    });

    it("treats unknown edition values as community", async () => {
      process.env.NEOBOARD_EDITION = "banana";
      const { getEdition, isEnterpriseEdition } = await import("../registry");
      expect(getEdition()).toBe("community");
      expect(isEnterpriseEdition()).toBe(false);
    });

    it("hasFeature returns false for all enterprise features", async () => {
      delete process.env.NEOBOARD_EDITION;
      const { hasFeature } = await import("../registry");
      expect(hasFeature("sso")).toBe(false);
      expect(hasFeature("custom-roles")).toBe(false);
      expect(hasFeature("user-groups")).toBe(false);
      expect(hasFeature("connector-labels")).toBe(false);
      expect(hasFeature("connector-alias")).toBe(false);
      expect(hasFeature("environment-selector")).toBe(false);
      expect(hasFeature("bulk-import")).toBe(false);
      expect(hasFeature("dashboard-sharing-links")).toBe(false);
      expect(hasFeature("impersonation")).toBe(false);
      expect(hasFeature("session-management")).toBe(false);
      expect(hasFeature("ast-completion")).toBe(false);
    });

    it("getEnabledFeatures returns empty array", async () => {
      delete process.env.NEOBOARD_EDITION;
      const { getEnabledFeatures } = await import("../registry");
      expect(getEnabledFeatures()).toEqual([]);
    });
  });

  describe("enterprise edition", () => {
    it("detects enterprise edition from env var", async () => {
      process.env.NEOBOARD_EDITION = "enterprise";
      const { getEdition, isEnterpriseEdition } = await import("../registry");
      expect(getEdition()).toBe("enterprise");
      expect(isEnterpriseEdition()).toBe(true);
    });

    it("is case-insensitive for enterprise value", async () => {
      process.env.NEOBOARD_EDITION = "ENTERPRISE";
      const { getEdition } = await import("../registry");
      expect(getEdition()).toBe("enterprise");
    });

    it("hasFeature returns true for all enterprise features", async () => {
      process.env.NEOBOARD_EDITION = "enterprise";
      const { hasFeature } = await import("../registry");
      expect(hasFeature("sso")).toBe(true);
      expect(hasFeature("custom-roles")).toBe(true);
      expect(hasFeature("user-groups")).toBe(true);
      expect(hasFeature("connector-labels")).toBe(true);
      expect(hasFeature("bulk-import")).toBe(true);
    });

    it("getEnabledFeatures returns the full enterprise feature list", async () => {
      process.env.NEOBOARD_EDITION = "enterprise";
      const { getEnabledFeatures } = await import("../registry");
      const features = getEnabledFeatures();
      expect(features).toContain("sso");
      expect(features).toContain("custom-roles");
      expect(features).toContain("user-groups");
      expect(features.length).toBeGreaterThanOrEqual(11);
    });
  });
});
