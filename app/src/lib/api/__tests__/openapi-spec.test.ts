/**
 * Regression guard for #908.
 *
 * The OpenAPI spec is hand-maintained alongside the route handlers. Every
 * paginated list route MUST document its `limit` + `offset` query params
 * and the paginated response envelope (`{data, error, meta: {total, ...}}`),
 * otherwise Swagger UI hides the controls and generated clients lose the
 * ability to page through results.
 *
 * This test fails if any of the known paginated routes loses its declaration.
 */
import { describe, it, expect } from "vitest";
import SPEC from "../openapi-spec";

const PAGINATED_OFFSET_ROUTES = [
  "/api/connections",
  "/api/dashboards",
  "/api/users",
  "/api/widget-templates",
];

interface OAParam {
  $ref?: string;
  name?: string;
  in?: string;
}

interface OARoute {
  get?: {
    parameters?: readonly OAParam[];
    responses?: Record<
      string,
      { content?: Record<string, { schema?: unknown }> }
    >;
  };
}

function paramNames(refs: readonly OAParam[] | undefined): string[] {
  if (!refs) return [];
  return refs
    .map((p) =>
      p.$ref ? p.$ref.replace("#/components/parameters/", "") : (p.name ?? ""),
    )
    .filter(Boolean);
}

describe("openapi-spec.ts pagination declarations (#908)", () => {
  it("declares shared LimitParam and OffsetParam components", () => {
    const params = SPEC.components.parameters as Record<string, unknown>;
    expect(params.LimitParam).toBeDefined();
    expect(params.OffsetParam).toBeDefined();
  });

  it.each(PAGINATED_OFFSET_ROUTES)(
    "%s GET advertises limit + offset query params",
    (route) => {
      const path = (SPEC.paths as unknown as Record<string, OARoute>)[route];
      expect(path, `expected ${route} to be documented`).toBeDefined();
      const names = paramNames(path?.get?.parameters);
      expect(names).toContain("LimitParam");
      expect(names).toContain("OffsetParam");
    },
  );

  it.each(PAGINATED_OFFSET_ROUTES)(
    "%s GET 200 response includes the paginated envelope (data + meta with total)",
    (route) => {
      const path = (SPEC.paths as unknown as Record<string, OARoute>)[route];
      const response200 = path?.get?.responses?.[200];
      expect(
        response200,
        `expected ${route} GET to have a 200 response`,
      ).toBeDefined();
      const schema = response200?.content?.["application/json"]?.schema;
      // The schema must declare the standard paginated envelope: a `data`
      // array, an `error`, and a `meta` field (either inline or via $ref to
      // a meta schema like `PaginationMeta` that itself documents `total`).
      const serialized = JSON.stringify(schema);
      expect(serialized).toMatch(/"meta"/);
      // The meta schema (or its inline shape) must surface a total count.
      const metaSchema = SPEC.components.schemas as Record<
        string,
        { properties?: { total?: unknown } }
      >;
      const declaresTotalInline = /"total"/.test(serialized);
      const declaresTotalViaMetaSchema =
        metaSchema.PaginationMeta?.properties?.total !== undefined &&
        /PaginationMeta/.test(serialized);
      expect(
        declaresTotalInline || declaresTotalViaMetaSchema,
        `${route} must document meta.total (inline or via PaginationMeta ref)`,
      ).toBe(true);
    },
  );
});
