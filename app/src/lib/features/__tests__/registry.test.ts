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

    it("hasFeature returns false for every enterprise feature", async () => {
      delete process.env.NEOBOARD_EDITION;
      const { hasFeature } = await import("../registry");
      expect(hasFeature("sso")).toBe(false);
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

    it("hasFeature returns true for every enterprise feature", async () => {
      process.env.NEOBOARD_EDITION = "enterprise";
      const { hasFeature } = await import("../registry");
      expect(hasFeature("sso")).toBe(true);
    });

    it("getEnabledFeatures returns every feature that has code", async () => {
      process.env.NEOBOARD_EDITION = "enterprise";
      const { getEnabledFeatures } = await import("../registry");
      // Only SSO has code behind it. The other ten ids were names in a list,
      // so enterprise mode advertised features that do not exist (#1845).
      expect(getEnabledFeatures()).toEqual(["sso"]);
    });
  });
});
