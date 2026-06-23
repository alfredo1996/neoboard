import { describe, it, expect } from "vitest";
import { validateIframeUrl } from "../validate-iframe-url";

describe("validateIframeUrl (#1053)", () => {
  it("accepts an https URL", () => {
    expect(validateIframeUrl("https://example.com/embed")).toBeNull();
  });

  it("allows empty (the widget shows its own prompt)", () => {
    expect(validateIframeUrl("   ")).toBeNull();
  });

  it("rejects javascript: and data: schemes as errors", () => {
    expect(validateIframeUrl("javascript:alert(1)")?.level).toBe("error");
    expect(validateIframeUrl("data:text/html,<h1>x</h1>")?.level).toBe("error");
  });

  it("rejects an unparseable URL as an error", () => {
    expect(validateIframeUrl("not a url")?.level).toBe("error");
  });

  it("warns (not blocks) on plain http and mentions framing", () => {
    const r = validateIframeUrl("http://example.com");
    expect(r?.level).toBe("warning");
    expect(r?.message).toMatch(/https|framing|X-Frame/i);
  });
});
