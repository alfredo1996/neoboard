import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("bootstrapExtensions", () => {
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

  it("is a no-op in community edition", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { bootstrapExtensions } = await import("../bootstrap");
    const { extensions } = await import("../index");
    const result = await bootstrapExtensions();
    expect(result.edition).toBe("community");
    expect(result.enterpriseLoaded).toBe(false);
    expect(extensions.authProviders.size()).toBe(0);
  });

  it("reports enterprise edition and attempts to load the enterprise package", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { bootstrapExtensions } = await import("../bootstrap");
    const result = await bootstrapExtensions();
    expect(result.edition).toBe("enterprise");
    // Enterprise package does not exist yet — bootstrap should
    // not throw, just report enterpriseLoaded=false
    expect(result.enterpriseLoaded).toBe(false);
  });

  it("is idempotent — calling twice does not double-register", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { bootstrapExtensions } = await import("../bootstrap");
    const { extensions } = await import("../index");
    await bootstrapExtensions();
    await bootstrapExtensions();
    expect(extensions.authProviders.size()).toBe(0);
  });
});
