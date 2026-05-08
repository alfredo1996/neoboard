import { describe, it, expect } from "vitest";
import { resolveRoleFromClaims } from "../claim-mapping";
import type { SsoClaimMapping } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Tests — resolveRoleFromClaims
// ---------------------------------------------------------------------------

describe("resolveRoleFromClaims", () => {
  const mapping: SsoClaimMapping = {
    claimKey: "groups",
    adminValue: "neoboard-admins",
    creatorValue: "neoboard-editors",
    readerValue: "neoboard-viewers",
  };

  it("returns admin when claim matches adminValue", () => {
    const profile = { groups: ["neoboard-admins", "other-group"] };
    expect(resolveRoleFromClaims(profile, mapping, "creator")).toBe("admin");
  });

  it("returns creator when claim matches creatorValue", () => {
    const profile = { groups: ["neoboard-editors"] };
    expect(resolveRoleFromClaims(profile, mapping, "creator")).toBe("creator");
  });

  it("returns reader when claim matches readerValue", () => {
    const profile = { groups: ["neoboard-viewers"] };
    expect(resolveRoleFromClaims(profile, mapping, "creator")).toBe("reader");
  });

  it("returns default role when no claim matches", () => {
    const profile = { groups: ["unrelated-group"] };
    expect(resolveRoleFromClaims(profile, mapping, "reader")).toBe("reader");
  });

  it("returns default role when claim key is missing from profile", () => {
    const profile = { departments: ["engineering"] };
    expect(resolveRoleFromClaims(profile, mapping, "creator")).toBe("creator");
  });

  it("returns default role when mapping is null", () => {
    const profile = { groups: ["neoboard-admins"] };
    expect(resolveRoleFromClaims(profile, null, "creator")).toBe("creator");
  });

  it("returns default role when mapping is undefined", () => {
    const profile = { groups: ["neoboard-admins"] };
    expect(resolveRoleFromClaims(profile, undefined, "creator")).toBe(
      "creator",
    );
  });

  it("handles string claim value (not array)", () => {
    const profile = { groups: "neoboard-admins" };
    expect(resolveRoleFromClaims(profile, mapping, "creator")).toBe("admin");
  });

  it("prioritizes admin > creator > reader when multiple match", () => {
    // User is in both admin and editor groups
    const profile = { groups: ["neoboard-admins", "neoboard-editors"] };
    expect(resolveRoleFromClaims(profile, mapping, "reader")).toBe("admin");
  });

  it("handles nested claim key with dot notation", () => {
    const nestedMapping: SsoClaimMapping = {
      claimKey: "realm_access.roles",
      adminValue: "admin",
      creatorValue: "editor",
    };
    const profile = { realm_access: { roles: ["editor", "user"] } };
    expect(resolveRoleFromClaims(profile, nestedMapping, "reader")).toBe(
      "creator",
    );
  });

  it("returns default when nested claim path doesn't exist", () => {
    const nestedMapping: SsoClaimMapping = {
      claimKey: "realm_access.roles",
      adminValue: "admin",
    };
    const profile = { groups: ["admin"] };
    expect(resolveRoleFromClaims(profile, nestedMapping, "creator")).toBe(
      "creator",
    );
  });

  it("handles mapping with only some values defined", () => {
    const partialMapping: SsoClaimMapping = {
      claimKey: "role",
      adminValue: "super-admin",
      // creatorValue and readerValue intentionally omitted
    };
    const profile = { role: "super-admin" };
    expect(resolveRoleFromClaims(profile, partialMapping, "reader")).toBe(
      "admin",
    );
  });

  it("handles empty claim array", () => {
    const profile = { groups: [] };
    expect(resolveRoleFromClaims(profile, mapping, "creator")).toBe("creator");
  });

  // ── Comma-separated multi-value mapping ─────────────────────────────────

  it("matches any of comma-separated admin values", () => {
    const multiMapping: SsoClaimMapping = {
      claimKey: "groups",
      adminValue: "devops,platform-team,it-ops",
      creatorValue: "engineering",
    };
    const profile = { groups: ["platform-team", "users"] };
    expect(resolveRoleFromClaims(profile, multiMapping, "reader")).toBe(
      "admin",
    );
  });

  it("matches any of comma-separated creator values", () => {
    const multiMapping: SsoClaimMapping = {
      claimKey: "groups",
      adminValue: "devops",
      creatorValue: "engineering,data-team,analytics",
    };
    const profile = { groups: ["data-team"] };
    expect(resolveRoleFromClaims(profile, multiMapping, "reader")).toBe(
      "creator",
    );
  });

  it("matches any of comma-separated reader values", () => {
    const multiMapping: SsoClaimMapping = {
      claimKey: "groups",
      readerValue: "marketing,sales,support",
    };
    const profile = { groups: ["sales"] };
    expect(resolveRoleFromClaims(profile, multiMapping, "creator")).toBe(
      "reader",
    );
  });

  it("trims whitespace around comma-separated values", () => {
    const multiMapping: SsoClaimMapping = {
      claimKey: "groups",
      adminValue: " devops , platform-team , it-ops ",
    };
    const profile = { groups: ["platform-team"] };
    expect(resolveRoleFromClaims(profile, multiMapping, "reader")).toBe(
      "admin",
    );
  });

  it("still works with single value (no comma)", () => {
    // Existing behavior preserved — single values work as before
    const profile = { groups: ["neoboard-admins"] };
    expect(resolveRoleFromClaims(profile, mapping, "reader")).toBe("admin");
  });

  it("prioritizes admin over creator with comma-separated values", () => {
    const multiMapping: SsoClaimMapping = {
      claimKey: "groups",
      adminValue: "admins,super-admins",
      creatorValue: "editors,writers",
    };
    const profile = { groups: ["writers", "super-admins"] };
    expect(resolveRoleFromClaims(profile, multiMapping, "reader")).toBe(
      "admin",
    );
  });
});
