import { describe, it, expect, beforeEach } from "vitest";
import {
  bootstrapQueryMiddleware,
  _resetQueryMiddlewareBootstrap,
} from "../bootstrap";
import { extensions } from "@/lib/extensions";

describe("bootstrapQueryMiddleware", () => {
  beforeEach(() => {
    extensions.queryMiddleware.clear();
    _resetQueryMiddlewareBootstrap();
  });

  it("registers both core:scheduler and core:audit", () => {
    bootstrapQueryMiddleware();
    const all = extensions.queryMiddleware.getAll();
    expect(all).toHaveLength(2);
    const ids = all.map((m) => m.id);
    expect(ids).toContain("core:scheduler");
    expect(ids).toContain("core:audit");
  });

  it("assigns core:scheduler priority 30 (runs before audit)", () => {
    bootstrapQueryMiddleware();
    const scheduler = extensions.queryMiddleware
      .getAll()
      .find((m) => m.id === "core:scheduler");
    expect(scheduler?.priority).toBe(30);
  });

  it("assigns core:audit priority 50 (wraps scheduler)", () => {
    bootstrapQueryMiddleware();
    const audit = extensions.queryMiddleware
      .getAll()
      .find((m) => m.id === "core:audit");
    expect(audit?.priority).toBe(50);
  });

  it("is idempotent — calling twice registers each middleware once", () => {
    bootstrapQueryMiddleware();
    bootstrapQueryMiddleware();
    expect(extensions.queryMiddleware.size()).toBe(2);
  });

  it("test reset helper lets the bootstrap run again", () => {
    bootstrapQueryMiddleware();
    extensions.queryMiddleware.clear();
    _resetQueryMiddlewareBootstrap();
    bootstrapQueryMiddleware();
    expect(extensions.queryMiddleware.size()).toBe(2);
  });
});
