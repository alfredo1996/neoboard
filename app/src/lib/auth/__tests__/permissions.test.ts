import { describe, it, expect } from "vitest";
import { assertCanManageConnections } from "../permissions";
import { ForbiddenError } from "../errors";

describe("assertCanManageConnections", () => {
  it("throws ForbiddenError for readers", () => {
    expect(() => assertCanManageConnections("reader")).toThrow(ForbiddenError);
    expect(() => assertCanManageConnections("reader")).toThrow("Forbidden");
  });

  it("allows creators", () => {
    expect(() => assertCanManageConnections("creator")).not.toThrow();
  });

  it("allows admins", () => {
    expect(() => assertCanManageConnections("admin")).not.toThrow();
  });
});
