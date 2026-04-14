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

  it("registers the core audit middleware", () => {
    bootstrapQueryMiddleware();
    expect(extensions.queryMiddleware.size()).toBe(1);
    const first = extensions.queryMiddleware.getFirst();
    expect(first?.id).toBe("core:audit");
  });

  it("assigns the audit middleware a priority of 50", () => {
    bootstrapQueryMiddleware();
    expect(extensions.queryMiddleware.getFirst()?.priority).toBe(50);
  });

  it("is idempotent — calling twice registers audit only once", () => {
    bootstrapQueryMiddleware();
    bootstrapQueryMiddleware();
    expect(extensions.queryMiddleware.size()).toBe(1);
  });

  it("test reset helper lets the bootstrap run again", () => {
    bootstrapQueryMiddleware();
    extensions.queryMiddleware.clear();
    _resetQueryMiddlewareBootstrap();
    bootstrapQueryMiddleware();
    expect(extensions.queryMiddleware.size()).toBe(1);
  });
});
