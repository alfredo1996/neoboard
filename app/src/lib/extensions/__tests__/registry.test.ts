import { describe, it, expect, beforeEach } from "vitest";
import { createExtensionPoint } from "../registry";

describe("createExtensionPoint", () => {
  describe("empty registry", () => {
    it("getAll returns empty array", () => {
      const ep = createExtensionPoint<{ id: string }>();
      expect(ep.getAll()).toEqual([]);
    });

    it("getFirst returns undefined", () => {
      const ep = createExtensionPoint<{ id: string }>();
      expect(ep.getFirst()).toBeUndefined();
    });

    it("size returns 0", () => {
      const ep = createExtensionPoint<{ id: string }>();
      expect(ep.size()).toBe(0);
    });
  });

  describe("register", () => {
    it("adds handlers and returns them via getAll", () => {
      const ep = createExtensionPoint<{ id: string }>();
      ep.register({ id: "a" });
      ep.register({ id: "b" });
      expect(ep.getAll()).toEqual([{ id: "a" }, { id: "b" }]);
    });

    it("preserves registration order", () => {
      const ep = createExtensionPoint<number>();
      ep.register(3);
      ep.register(1);
      ep.register(2);
      expect(ep.getAll()).toEqual([3, 1, 2]);
    });

    it("getFirst returns the first registered handler", () => {
      const ep = createExtensionPoint<{ id: string }>();
      ep.register({ id: "first" });
      ep.register({ id: "second" });
      expect(ep.getFirst()).toEqual({ id: "first" });
    });

    it("getAll returns a copy — mutations do not affect the registry", () => {
      const ep = createExtensionPoint<{ id: string }>();
      ep.register({ id: "a" });
      const snapshot = ep.getAll();
      snapshot.push({ id: "injected" });
      expect(ep.getAll()).toEqual([{ id: "a" }]);
    });
  });

  describe("clear", () => {
    it("removes all handlers", () => {
      const ep = createExtensionPoint<{ id: string }>();
      ep.register({ id: "a" });
      ep.register({ id: "b" });
      ep.clear();
      expect(ep.getAll()).toEqual([]);
      expect(ep.size()).toBe(0);
    });
  });

  describe("isolation", () => {
    it("separate extension points do not share state", () => {
      const a = createExtensionPoint<string>();
      const b = createExtensionPoint<string>();
      a.register("from-a");
      b.register("from-b");
      expect(a.getAll()).toEqual(["from-a"]);
      expect(b.getAll()).toEqual(["from-b"]);
    });
  });
});

describe("typed extension points", () => {
  beforeEach(async () => {
    const { extensions } = await import("../index");
    extensions.authProviders.clear();
    extensions.permissionCheckers.clear();
    extensions.resourceFilters.clear();
    extensions.roleProviders.clear();
  });

  it("exposes four typed extension points", async () => {
    const { extensions } = await import("../index");
    expect(extensions.authProviders.size()).toBe(0);
    expect(extensions.permissionCheckers.size()).toBe(0);
    expect(extensions.resourceFilters.size()).toBe(0);
    expect(extensions.roleProviders.size()).toBe(0);
  });

  it("allows registering an AuthProviderExtension", async () => {
    const { extensions } = await import("../index");
    extensions.authProviders.register({
      id: "oidc",
      label: "OIDC",
      buildProvider: () => ({ id: "oidc", type: "oauth" }),
    });
    expect(extensions.authProviders.size()).toBe(1);
    expect(extensions.authProviders.getFirst()?.id).toBe("oidc");
  });

  it("allows registering a PermissionExtension", async () => {
    const { extensions } = await import("../index");
    extensions.permissionCheckers.register({
      id: "group-check",
      check: () => "allow",
    });
    expect(extensions.permissionCheckers.size()).toBe(1);
  });

  it("allows registering a RoleProviderExtension", async () => {
    const { extensions } = await import("../index");
    extensions.roleProviders.register({
      id: "custom-roles",
      getRoles: () => [
        { id: "analyst", label: "Analyst", capabilities: ["dashboards:read"] },
      ],
    });
    const first = extensions.roleProviders.getFirst();
    expect(first?.getRoles()[0].id).toBe("analyst");
  });
});
