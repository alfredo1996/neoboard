import { describe, it, expect } from "vitest";
import { sanitizeSandbox, validateIframeSandbox } from "../iframe-sandbox";

describe("sanitizeSandbox (#1413)", () => {
  it("drops allow-same-origin", () => {
    expect(sanitizeSandbox("allow-scripts allow-same-origin")).toBe(
      "allow-scripts",
    );
  });

  it("drops unrecognised tokens and stray whitespace", () => {
    expect(sanitizeSandbox("  allow-form   allow-forms ")).toBe("allow-forms");
  });

  it("keeps every token on the allow-list", () => {
    const safe =
      "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads allow-presentation allow-orientation-lock allow-pointer-lock allow-top-navigation-by-user-activation";
    expect(sanitizeSandbox(safe)).toBe(safe);
  });

  it("does not loosen for other refused tokens or case variants", () => {
    expect(
      sanitizeSandbox(
        "allow-top-navigation allow-storage-access-by-user-activation ALLOW-SAME-ORIGIN",
      ),
    ).toBe("");
  });
});

describe("validateIframeSandbox (#1413)", () => {
  it("is silent when every token is applied, or the field is empty", () => {
    expect(validateIframeSandbox("allow-scripts allow-forms")).toBeNull();
    expect(validateIframeSandbox("   ")).toBeNull();
  });

  it("explains a refused token and shows what is applied", () => {
    const r = validateIframeSandbox("allow-scripts allow-same-origin");
    expect(r?.level).toBe("warning");
    expect(r?.message).toMatch(/"allow-same-origin" is refused/);
    expect(r?.message).toMatch(/remove its own sandbox/);
    expect(r?.message).toMatch(/Applied: "allow-scripts"/);
  });

  it("gives an unrecognised token a different message than a refused one", () => {
    const typo = validateIframeSandbox("allow-form");
    const refused = validateIframeSandbox("allow-same-origin");
    expect(typo?.message).toMatch(
      /"allow-form" is not a recognised sandbox token/,
    );
    expect(typo?.message).not.toMatch(/refused/);
    expect(refused?.message).not.toMatch(/not a recognised/);
  });

  it("reports each discarded token once, and an empty result as none", () => {
    const r = validateIframeSandbox(
      "allow-same-origin allow-same-origin bogus",
    );
    expect(r?.message.match(/allow-same-origin/g)).toHaveLength(1);
    expect(r?.message).toMatch(/"bogus" is not a recognised/);
    expect(r?.message).toMatch(/Applied: none/);
  });
});
