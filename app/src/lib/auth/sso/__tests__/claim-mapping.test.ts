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
});
