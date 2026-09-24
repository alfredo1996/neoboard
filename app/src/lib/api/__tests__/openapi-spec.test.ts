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
import { DEFAULT_MAX_ROWS } from "@/lib/query/query-executor";

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

describe("POST /api/query/write description (#1831)", () => {
  it("says a stored widget's saved database applies only when its connection allows a per-card database", () => {
    const paths = SPEC.paths as Record<
      string,
      { post?: { description?: string } }
    >;
    expect(paths["/api/query/write"].post?.description).toMatch(
      /not a form also needs write mode on, and runs on its saved database when its connection allows a per-card database/,
    );
  });
});

/**
 * #1913. The spec said results were capped at 10,000 rows. The cap is the
 * connection's maxRows, else DEFAULT_MAX_ROWS, and `rowLimit` can only lower
 * it. QueryResponse also described a flat body the route never sends: the
 * route answers `{ data: { data, fields }, error, meta: { resultId,
 * serverDurationMs, rowLimit, truncated? } }` — the paths query/route.test.ts
 * reads off a response.
 */
describe("POST /api/query row cap and response (#1913)", () => {
  const paths = SPEC.paths as Record<
    string,
    { post?: { description?: string } }
  >;
  const schemas = (SPEC.components as { schemas: Record<string, unknown> })
    .schemas;
  type Node = { properties?: Record<string, Node>; description?: string };
  const queryResponse = schemas.QueryResponse as Node;
  const at = (path: string) =>
    path
      .split(".")
      .reduce<Node | undefined>(
        (n, key) => n?.properties?.[key],
        queryResponse,
      );

  it("states no row count but DEFAULT_MAX_ROWS", () => {
    const text = [
      paths["/api/query"].post?.description,
      JSON.stringify(queryResponse),
    ].join(" ");
    const counts = [...text.matchAll(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g)].map(
      ([n]) => Number(n.replaceAll(",", "")),
    );
    expect([...new Set(counts)]).toEqual([DEFAULT_MAX_ROWS]);
  });

  it.each([
    "data.data",
    "data.fields",
    "error",
    "meta.resultId",
    "meta.serverDurationMs",
    "meta.rowLimit",
    "meta.truncated",
  ])("describes %s where the route puts it", (path) => {
    expect(at(path)).toBeDefined();
  });

  it("gives the write route its own response: the rows, and only a duration", () => {
    type Op = {
      post?: {
        responses?: Record<
          string,
          { content?: Record<string, { schema?: { $ref?: string } }> }
        >;
      };
    };
    const ref = (paths["/api/query/write"] as Op).post?.responses?.["200"]
      ?.content?.["application/json"]?.schema?.$ref;
    const write = schemas[ref!.split("/").pop()!] as Node;
    expect(write.properties?.data?.properties).toBeUndefined();
    expect(Object.keys(write.properties?.meta?.properties ?? {})).toEqual([
      "serverDurationMs",
    ]);
  });
});
