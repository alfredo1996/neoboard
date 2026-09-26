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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { API_ERROR_CODES, apiError, type ApiErrorCode } from "../api-response";
import { DEAD_CONNECTOR_TTL_MS } from "@/lib/query/middleware/dead-connector";
import { DEFAULT_MAX_ROWS } from "@/lib/query/query-executor";
import { MAX_ROWS_BOUNDS } from "@/lib/connector/connection-form";

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
 * route answers `{ data: { data }, error, meta: { resultId, serverDurationMs,
 * rowLimit, truncated? } }` — the paths query/route.test.ts reads off a
 * response. The route also forwards a `fields` no connector supplies, so it
 * never reaches the wire and is not documented.
 */
describe("POST /api/query row cap and response (#1913)", () => {
  const paths = SPEC.paths as Record<
    string,
    { post?: { description?: string } }
  >;
  const schemas = (SPEC.components as { schemas: Record<string, unknown> })
    .schemas;
  type Node = {
    properties?: Record<string, Node>;
    required?: string[];
    description?: string;
    minimum?: number;
    maximum?: number;
  };
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
      paths["/api/query/write"].post?.description,
      JSON.stringify(queryResponse),
      JSON.stringify(schemas.WriteQueryResponse),
      JSON.stringify(schemas.QueryRequest),
    ].join(" ");
    const counts = [...text.matchAll(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g)].map(
      ([n]) => Number(n.replaceAll(",", "")),
    );
    expect([...new Set(counts)]).toEqual([DEFAULT_MAX_ROWS]);
  });

  it.each([
    "data.data",
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

  it("documents no key the route never sends", () => {
    expect(at("data.fields")).toBeUndefined();
  });

  it("marks what every 200 carries as required, and only truncated as optional", () => {
    expect(queryResponse.required).toEqual(["data", "error", "meta"]);
    expect(at("meta")?.required).toEqual([
      "resultId",
      "serverDurationMs",
      "rowLimit",
    ]);
  });

  it("says a write's returned rows are capped too", () => {
    expect(paths["/api/query/write"].post?.description).toMatch(
      new RegExp(`capped[^.]*maxRows[^.]*${DEFAULT_MAX_ROWS}`),
    );
  });

  it("states the maxRows bounds the server validates", () => {
    const config = schemas.ConnectionConfig as Node;
    expect(config.properties?.maxRows).toMatchObject({
      minimum: MAX_ROWS_BOUNDS.min,
      maximum: MAX_ROWS_BOUNDS.max,
    });
  });
});

/**
 * #1961. Every handler answers through apiSuccess / apiList / apiError, so every
 * JSON body is `{ data, error, meta }` — but most responses were documented as
 * the bare payload, and every error as `{ error: string }`. This walks every
 * operation, so a new one is held to the envelope from birth.
 */
describe("every response is documented in the envelope the server sends (#1961)", () => {
  type Schema = {
    $ref?: string;
    oneOf?: Schema[];
    required?: string[];
    properties?: Record<string, Schema>;
    enum?: string[];
  };
  type Response = {
    $ref?: string;
    content?: Record<string, { schema?: Schema }>;
  };
  const components = SPEC.components as unknown as {
    schemas: Record<string, Schema>;
    responses: Record<string, Response>;
  };
  const deref = <T extends { $ref?: string }>(node: T): T => {
    if (!node.$ref) return node;
    const [, , kind, name] = node.$ref.split("/");
    return deref(
      (components as unknown as Record<string, Record<string, T>>)[kind][name],
    );
  };

  /** [label, status, the JSON body schema] for every documented response. */
  const bodies: [string, number, Schema][] = Object.entries(
    SPEC.paths as Record<
      string,
      Record<string, { responses?: Record<string, Response> }>
    >,
  ).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => method !== "parameters")
      .flatMap(([method, op]) =>
        Object.entries(op.responses ?? {}).flatMap(
          ([status, response]): [string, number, Schema][] => {
            const schema =
              deref(response).content?.["application/json"]?.schema;
            return schema
              ? [
                  [
                    `${method.toUpperCase()} ${path} ${status}`,
                    Number(status),
                    deref(schema),
                  ],
                ]
              : [];
          },
        ),
      ),
  );

  const isEnvelope = (s: Schema) =>
    ["data", "error", "meta"].every((k) => s.properties?.[k] !== undefined) &&
    ["data", "error", "meta"].every((k) => s.required?.includes(k));

  it("covers the documented operations", () => {
    expect(bodies.length).toBeGreaterThan(60);
  });

  it.each(bodies.filter(([, status]) => status < 400))(
    "%s is an envelope",
    (label, _status, schema) => {
      // The export is a file download, deliberately outside the envelope.
      if (label.startsWith("GET /api/dashboards/{id}/export")) return;
      expect(isEnvelope(schema)).toBe(true);
    },
  );

  it.each(bodies.filter(([, status]) => status >= 400))(
    "%s is apiError's body",
    (label, status, schema) => {
      const forms = schema.oneOf ? schema.oneOf.map(deref) : [schema];
      const handler = forms.find(isEnvelope);
      expect(handler, label).toBeDefined();
      expect(deref(handler!.properties!.error).required).toEqual([
        "code",
        "message",
      ]);
      // One form: the proxy answers in the envelope too since #1982.
      expect(forms.length, `${label} (${status})`).toBe(1);
    },
  );

  it("documents no proxy-only error form (#1982)", () => {
    expect(components.schemas.ProxyError).toBeUndefined();
  });

  it("documents every error code apiError can send", () => {
    expect(components.schemas.EnvelopeError.properties?.code.enum).toEqual(
      API_ERROR_CODES,
    );
  });

  it("keeps no hand-written envelope schema", () => {
    expect(
      Object.keys(components.schemas).filter((name) =>
        /Envelope(?!Error)/.test(name),
      ),
    ).toEqual([]);
  });
});

describe("the query operations document what their routes send (#1966)", () => {
  type Resp = {
    $ref?: string;
    headers?: Record<string, unknown>;
    description?: string;
  };
  type Param = {
    $ref?: string;
    name?: string;
    in?: string;
    schema?: { enum?: unknown[]; default?: unknown };
  };
  type Op = {
    description?: string;
    parameters?: Param[];
    responses: Record<string, Resp>;
    requestBody?: {
      content: Record<string, { schema: { $ref: string } }>;
    };
  };
  const paths = SPEC.paths as unknown as Record<string, { post: Op }>;
  const components = SPEC.components as unknown as {
    schemas: Record<string, { properties?: Record<string, unknown> }>;
    responses: Record<string, Resp>;
    parameters: Record<string, Param>;
  };
  const last = (ref: string) => ref.split("/").pop()!;
  const response = (r: Resp) =>
    r.$ref ? components.responses[last(r.$ref)] : r;
  const params = (op: Op) =>
    (op.parameters ?? []).map((p) =>
      p.$ref ? components.parameters[last(p.$ref)] : p,
    );
  const header = (op: Op, name: string) =>
    params(op).find((p) => p.in === "header" && p.name === name);
  const bodyKeys = (op: Op) =>
    Object.keys(
      components.schemas[
        last(op.requestBody!.content["application/json"].schema.$ref)
      ].properties ?? {},
    );
  const read = paths["/api/query"].post;
  const write = paths["/api/query/write"].post;
  const ops: [string, Op][] = [
    ["/api/query", read],
    ["/api/query/write", write],
  ];

  it.each(ops)(
    "%s documents every status the shared error path can answer",
    (_path, op) => {
      // Every code api-utils.ts hands to apiError: handleRouteError,
      // readJsonBody, validateBody and the auth helpers. A new branch there
      // fails this until the query operations document its status.
      const source = readFileSync(
        join(__dirname, "..", "api-utils.ts"),
        "utf8",
      );
      const codes = [...source.matchAll(/apiError\(\s*"([A-Z_]+)"/g)]
        .map((m) => m[1] as ApiErrorCode)
        // requireFeature is the only source, and no query route calls it.
        .filter((code) => code !== "ENTERPRISE_REQUIRED");
      expect(codes.length).toBeGreaterThan(5);
      const statuses = new Set(
        codes.map((code) => String(apiError(code, "x").status)),
      );
      expect([...statuses].filter((s) => !(s in op.responses))).toEqual([]);
    },
  );

  it.each(ops)(
    "%s says when to retry a 408 or 503, and not a 502",
    (_p, op) => {
      expect(response(op.responses["408"]).headers).toHaveProperty(
        "Retry-After",
      );
      expect(response(op.responses["503"]).headers).toHaveProperty(
        "Retry-After",
      );
      expect(response(op.responses["502"]).headers).toBeUndefined();
    },
  );

  it("states how long a dead connection is answered without dialling", () => {
    expect(response(read.responses["502"]).description).toContain(
      `${DEAD_CONNECTOR_TTL_MS / 1000} seconds`,
    );
  });

  it("warns that a write retried after a 408 may run twice", () => {
    expect(write.description).toMatch(/408[^.]*(twice|again)/);
  });

  it("the read request declares its per-card database and tenant check", () => {
    expect(bodyKeys(read)).toEqual(
      expect.arrayContaining([
        "connectionId",
        "query",
        "params",
        "tenantId",
        "database",
        "rowLimit",
      ]),
    );
  });

  it("the write request declares its form fields and nothing it strips", () => {
    const keys = bodyKeys(write);
    expect(keys).toEqual(
      expect.arrayContaining([
        "connectionId",
        "query",
        "params",
        "widgetId",
        "dashboardId",
      ]),
    );
    for (const stripped of ["rowLimit", "database", "tenantId"]) {
      expect(keys).not.toContain(stripped);
    }
  });

  it("the read takes x-query-priority 1-3, default 2; the write runs at 1", () => {
    const priority = header(read, "x-query-priority");
    expect(priority?.schema?.enum).toEqual([1, 2, 3]);
    expect(priority?.schema?.default).toBe(2);
    expect(header(write, "x-query-priority")).toBeUndefined();
    expect(write.description).toMatch(/priority 1/);
  });

  it.each(ops)("%s takes an x-request-id", (_p, op) => {
    expect(header(op, "x-request-id")).toBeDefined();
  });

  it("the read says who may run what, and that 404 also means no access", () => {
    for (const term of [/admin/i, /shared/i, /view/i, /edit/i, /404/]) {
      expect(read.description).toMatch(term);
    }
  });
});
