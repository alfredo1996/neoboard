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
import { readdirSync, readFileSync } from "node:fs";
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

describe("#1981 payloads: connections-crud", () => {
  type Schema = {
    $ref?: string;
    allOf?: Schema[];
    anyOf?: Schema[];
    type?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    enum?: unknown[];
    nullable?: boolean;
    minLength?: number;
    items?: Schema;
  };
  type Resp = {
    $ref?: string;
    content?: Record<string, { schema: Schema }>;
  };
  type Op = {
    description?: string;
    parameters?: { name?: string; in?: string; schema?: Schema }[];
    responses: Record<string, Resp>;
    requestBody?: { content: Record<string, { schema: Schema }> };
  };
  const paths = SPEC.paths as unknown as Record<string, Record<string, Op>>;
  const components = SPEC.components as unknown as {
    schemas: Record<string, Schema>;
    responses: Record<string, Resp>;
  };
  const last = (ref: string) => ref.split("/").pop()!;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(components.schemas[last(s.$ref)]) : s;
  /** A schema with its allOf parts merged: every property, every required key. */
  const flat = (s: Schema): { properties: string[]; required: string[] } => {
    const node = deref(s);
    const parts = (node.allOf ?? []).map(flat);
    return {
      properties: [
        ...Object.keys(node.properties ?? {}),
        ...parts.flatMap((p) => p.properties),
      ],
      required: [...(node.required ?? []), ...parts.flatMap((p) => p.required)],
    };
  };
  /** The `data` schema a success response carries. */
  const data = (op: Op, status: string): Schema => {
    const r = op.responses[status];
    const resp = r.$ref ? components.responses[last(r.$ref)] : r;
    return resp.content!["application/json"].schema.properties!.data;
  };
  const sorted = (a: string[]) => [...new Set(a)].sort();
  const SUMMARY = ["id", "name", "type", "createdAt", "updatedAt"];

  const list = paths["/api/connections"].get;
  const create = paths["/api/connections"].post;
  const detail = paths["/api/connections/{id}"].get;
  const update = paths["/api/connections/{id}"].patch;
  const remove = paths["/api/connections/{id}"].delete;

  it("the list items carry visibility, isOwner and allowPerCardDb, never the owner id", () => {
    const item = deref(data(list, "200")).items!;
    const { properties, required } = flat(item);
    const keys = [...SUMMARY, "allowPerCardDb", "visibility", "isOwner"];
    expect(sorted(properties)).toEqual(sorted(keys));
    expect(sorted(required)).toEqual(sorted(keys));
  });

  it("the list says admins see the whole tenant, others their own plus shared", () => {
    expect(list.description).toMatch(/admin/i);
    expect(list.description).toMatch(/shared/i);
  });

  it("a create answers 201 with the summary plus allowPerCardDb", () => {
    expect(create.responses["200"]).toBeUndefined();
    const { properties, required } = flat(data(create, "201"));
    expect(sorted(properties)).toEqual(sorted([...SUMMARY, "allowPerCardDb"]));
    expect(sorted(required)).toEqual(sorted([...SUMMARY, "allowPerCardDb"]));
  });

  it("the detail carries visibility, isOwner and an optional config, not allowPerCardDb", () => {
    const { properties, required } = flat(data(detail, "200"));
    expect(sorted(properties)).toEqual(
      sorted([...SUMMARY, "visibility", "isOwner", "config"]),
    );
    expect(sorted(required)).toEqual(
      sorted([...SUMMARY, "visibility", "isOwner"]),
    );
  });

  it("an update answers exactly the summary, every key present, timestamps nullable", () => {
    const summary = deref(data(update, "200"));
    expect(sorted(Object.keys(summary.properties!))).toEqual(sorted(SUMMARY));
    expect(sorted(summary.required!)).toEqual(sorted(SUMMARY));
    expect(summary.properties!.createdAt.nullable).toBe(true);
    expect(summary.properties!.updatedAt.nullable).toBe(true);
  });

  it("an update accepts visibility and must name at least one field", () => {
    const body = deref(update.requestBody!.content["application/json"].schema);
    expect(Object.keys(body.properties!)).toEqual(
      expect.arrayContaining(["name", "config", "visibility"]),
    );
    expect(deref(body.properties!.visibility).enum).toEqual([
      "private",
      "shared",
    ]);
    expect(body.anyOf?.map((s) => s.required)).toEqual([
      ["name"],
      ["config"],
      ["visibility"],
    ]);
  });

  it("a create requires a non-empty connector type", () => {
    expect(
      components.schemas.CreateConnectionRequest.properties!.type.minLength,
    ).toBe(1);
  });

  it.each([
    ["POST", create],
    ["PATCH", update],
  ])("%s documents 403 for readers and 413 for an oversized body", (_m, op) => {
    expect(op.responses).toHaveProperty("403");
    expect(op.responses).toHaveProperty("413");
  });

  it("a delete answers {deleted: true}, not {success}", () => {
    const result = deref(data(remove, "200"));
    expect(result.required).toEqual(["deleted"]);
    expect(result.properties!.deleted.enum).toEqual([true]);
    expect(result.properties).not.toHaveProperty("success");
  });

  it("a delete takes force and answers 409 with the usage while widgets use it", () => {
    const force = remove.parameters?.find((p) => p.name === "force");
    expect(force?.in).toBe("query");
    expect(remove.responses).toHaveProperty("409");
    expect(remove.responses).toHaveProperty("403");
    const usage = components.schemas.ConnectionUsage;
    expect(usage.required).toEqual(["widgetCount", "dashboards"]);
    expect(usage.properties!.dashboards.items!.required).toEqual([
      "id",
      "name",
      "widgetCount",
    ]);
    expect(remove.description).toMatch(/admin/i);
  });
});

describe("#1981 payloads: connections-test-schema", () => {
  type Schema = {
    $ref?: string;
    type?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    additionalProperties?: Schema;
    enum?: unknown[];
    nullable?: boolean;
    minLength?: number;
    items?: Schema;
  };
  type Resp = { $ref?: string; content?: Record<string, { schema: Schema }> };
  type Op = {
    description?: string;
    parameters?: { name?: string; in?: string; schema?: Schema }[];
    responses: Record<string, Resp>;
  };
  const paths = SPEC.paths as unknown as Record<string, Record<string, Op>>;
  const schemas = (
    SPEC.components as unknown as {
      schemas: Record<string, Schema>;
    }
  ).schemas;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(schemas[s.$ref.split("/").pop()!]) : s;
  const data = (op: Op): Schema =>
    deref(
      op.responses["200"].content!["application/json"].schema.properties!.data,
    );
  const keys = (s: Schema) => Object.keys(s.properties ?? {}).sort();

  const test = paths["/api/connections/{id}/test"].post;
  const inline = paths["/api/connections/test-inline"].post;
  const schema = paths["/api/connections/{id}/schema"].get;

  it.each([
    ["saved", test],
    ["inline", inline],
  ])(
    "a %s test answers success, plus code and error on a failure; never latencyMs",
    (_n, op) => {
      const result = data(op);
      expect(keys(result)).toEqual(["code", "error", "success"]);
      expect(result.required).toEqual(["success"]);
      expect(result.properties!.code.enum).toEqual([
        "auth_failed",
        "network",
        "bad_uri",
        "container_loopback",
        "unknown",
        "decrypt_failed",
      ]);
      expect(op.description).toMatch(/200/);
    },
  );

  it("a saved test takes x-query-priority and documents 403, 408, 500 and 503", () => {
    const priority = test.parameters?.find(
      (p) => p.name === "x-query-priority",
    );
    expect(priority?.in).toBe("header");
    expect(priority?.schema).toEqual({ type: "string" });
    for (const status of ["403", "408", "500", "503"]) {
      expect(test.responses).toHaveProperty(status);
    }
    expect(test.description).toMatch(/admin/i);
  });

  it("an inline test documents 403 for readers, 413 and 500, and needs a non-empty type", () => {
    for (const status of ["403", "413", "500"]) {
      expect(inline.responses).toHaveProperty(status);
    }
    expect(inline.description).toMatch(/reader/i);
    expect(inline.description).toMatch(/without `fields`/);
    expect(schemas.TestInlineRequest.properties!.type.minLength).toBe(1);
  });

  it("the schema documents a classified connector error as 408 or 502", () => {
    for (const status of ["401", "404", "408", "500", "502"]) {
      expect(schema.responses).toHaveProperty(status);
    }
    expect(schema.responses).not.toHaveProperty("403");
    expect(schema.description).toMatch(/no longer installed/);
  });

  it("the schema answers the connector's DatabaseSchema, nullable, with `labels` not `nodeLabels`", () => {
    const db = data(schema);
    expect(db.nullable).toBe(true);
    expect(db.required).toEqual(["type"]);
    expect(keys(db)).toEqual(
      [
        "type",
        "labels",
        "relationshipTypes",
        "nodeProperties",
        "relProperties",
        "tables",
      ].sort(),
    );
    const prop = deref(
      db.properties!.nodeProperties.additionalProperties!.items!,
    );
    expect(prop.required).toEqual(["name", "type"]);
    expect(
      deref(db.properties!.relProperties.additionalProperties!.items!),
    ).toBe(prop);
    const table = deref(db.properties!.tables.items!);
    expect(table.required).toEqual(["name", "columns"]);
    expect(table.properties!.columns.items!.required).toEqual([
      "name",
      "type",
      "nullable",
    ]);
    expect(schema.responses).toHaveProperty("500");
  });
});

describe("#1981 payloads: dashboards-crud", () => {
  type Schema = {
    $ref?: string;
    description?: string;
    allOf?: Schema[];
    anyOf?: Schema[];
    type?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    additionalProperties?: boolean | Schema;
    enum?: unknown[];
    nullable?: boolean;
    minItems?: number;
    items?: Schema;
  };
  type Resp = { $ref?: string; content?: Record<string, { schema: Schema }> };
  type Op = {
    description?: string;
    responses: Record<string, Resp>;
    requestBody?: { content: Record<string, { schema: Schema }> };
  };
  const paths = SPEC.paths as unknown as Record<string, Record<string, Op>>;
  const components = SPEC.components as unknown as {
    schemas: Record<string, Schema>;
    responses: Record<string, Resp>;
    parameters: Record<string, { description?: string }>;
  };
  const last = (ref: string) => ref.split("/").pop()!;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(components.schemas[last(s.$ref)]) : s;
  /** A schema with its allOf parts merged: every property, every required key. */
  const flat = (s: Schema): { properties: string[]; required: string[] } => {
    const node = deref(s);
    const parts = (node.allOf ?? []).map(flat);
    return {
      properties: [
        ...Object.keys(node.properties ?? {}),
        ...parts.flatMap((p) => p.properties),
      ].sort(),
      required: [
        ...(node.required ?? []),
        ...parts.flatMap((p) => p.required),
      ].sort(),
    };
  };
  const data = (op: Op, status: string): Schema => {
    const r = op.responses[status];
    const resp = r.$ref ? components.responses[last(r.$ref)] : r;
    return resp.content!["application/json"].schema.properties!.data;
  };
  const ROW = [
    "id",
    "userId",
    "tenantId",
    "name",
    "description",
    "layoutJson",
    "version",
    "isPublic",
    "createdAt",
    "updatedAt",
    "updatedBy",
  ].sort();

  const list = paths["/api/dashboards"].get;
  const create = paths["/api/dashboards"].post;
  const detail = paths["/api/dashboards/{id}"].get;
  const update = paths["/api/dashboards/{id}"].put;
  const remove = paths["/api/dashboards/{id}"].delete;
  const duplicate = paths["/api/dashboards/{id}/duplicate"].post;

  it("a list item carries updatedByName, role and widgetCount, never owner, tenant, layout or version", () => {
    const item = deref(data(list, "200")).items!;
    const keys = [
      "id",
      "name",
      "description",
      "isPublic",
      "createdAt",
      "updatedAt",
      "updatedByName",
      "role",
      "widgetCount",
    ].sort();
    expect(flat(item)).toEqual({ properties: keys, required: keys });
    const props = deref(item).properties!;
    for (const k of [
      "description",
      "isPublic",
      "createdAt",
      "updatedAt",
      "updatedByName",
    ]) {
      expect(props[k].nullable, k).toBe(true);
    }
    expect(props.role.enum).toEqual(["owner", "editor", "viewer", "admin"]);
  });

  it("the list says readers see shared and public dashboards, their own only when public", () => {
    expect(list.description).toMatch(/admin/i);
    expect(list.description).toMatch(/readers see the ones shared with them/i);
    expect(list.description).toMatch(/their own only when it is public/i);
  });

  it("limit and offset say how an out-of-range value is read", () => {
    expect(components.parameters.LimitParam.description).toMatch(
      /counts as 25/,
    );
    expect(components.parameters.OffsetParam.description).toMatch(
      /counts as 0/,
    );
  });

  it.each([
    ["a create", create, "201"],
    ["an update", update, "200"],
    ["a duplicate", duplicate, "201"],
  ])("%s answers the whole stored row", (_n, op, status) => {
    expect(flat(data(op, status))).toEqual({ properties: ROW, required: ROW });
  });

  it("the row's nullable columns are nullable, version is an integer", () => {
    const props = components.schemas.Dashboard.properties!;
    for (const k of [
      "description",
      "layoutJson",
      "isPublic",
      "createdAt",
      "updatedAt",
      "updatedBy",
    ]) {
      expect(props[k].nullable, k).toBe(true);
    }
    for (const k of ["id", "userId", "tenantId", "name", "version"]) {
      expect(props[k].nullable, k).toBeUndefined();
    }
    expect(props.version.type).toBe("integer");
  });

  it("the detail is the row plus role and updatedByName, without widgetCount", () => {
    const keys = [...ROW, "role", "updatedByName"].sort();
    expect(flat(data(detail, "200"))).toEqual({
      properties: keys,
      required: keys,
    });
  });

  it("an update takes expectedVersion, refuses unknown keys and needs a real field", () => {
    const body = deref(update.requestBody!.content["application/json"].schema);
    expect(body.additionalProperties).toBe(false);
    expect(body.properties!.expectedVersion.type).toBe("integer");
    expect(body.anyOf?.map((s) => s.required)).toEqual([
      ["name"],
      ["description"],
      ["layoutJson"],
      ["isPublic"],
    ]);
    expect(body.properties!.description.nullable).toBeUndefined();
    const layout = body.properties!.layoutJson;
    expect(layout.nullable).toBeUndefined();
    expect(layout.required).toEqual(["version", "pages"]);
    expect(layout.description).toMatch(/widget are kept.*accepted but dropped/);
    expect(layout.properties!.version.enum).toEqual([2]);
    expect(layout.properties!.pages.minItems).toBe(1);
    expect(layout.properties!.pages.items!.required).toEqual([
      "id",
      "title",
      "widgets",
      "gridLayout",
    ]);
  });

  it.each([
    ["POST /api/dashboards", create, ["400", "401", "403", "413", "500"]],
    ["GET /api/dashboards", list, ["401", "500"]],
    ["GET /{id}", detail, ["401", "404", "500"]],
    ["PUT /{id}", update, ["400", "401", "403", "404", "409", "413", "500"]],
    ["DELETE /{id}", remove, ["401", "403", "404", "500"]],
    ["POST /{id}/duplicate", duplicate, ["401", "403", "404", "500"]],
  ])("%s documents its error statuses", (_n, op, statuses) => {
    for (const status of statuses) {
      expect(op.responses, status).toHaveProperty(status);
    }
  });

  it("a delete answers {deleted: true}, not {success}", () => {
    const result = deref(data(remove, "200"));
    expect(result.required).toEqual(["deleted"]);
    expect(result.properties!.deleted.enum).toEqual([true]);
    expect(result.properties).not.toHaveProperty("success");
    expect(remove.description).toMatch(/owner or an admin/i);
  });

  it("a duplicate says the copy is private and a merely public source answers 404", () => {
    expect(duplicate.description).toMatch(/private/i);
    expect(duplicate.description).toMatch(/public.*404/i);
  });
});

describe("#1981 payloads: dashboards-export-import", () => {
  type Schema = {
    $ref?: string;
    allOf?: Schema[];
    anyOf?: Schema[];
    type?: string;
    format?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    additionalProperties?: boolean | Schema;
    enum?: unknown[];
    nullable?: boolean;
    items?: Schema;
    minLength?: number;
  };
  type Resp = { $ref?: string; content?: Record<string, { schema: Schema }> };
  type Op = {
    description?: string;
    responses: Record<string, Resp>;
    requestBody?: { content: Record<string, { schema: Schema }> };
  };
  const paths = SPEC.paths as unknown as Record<string, Record<string, Op>>;
  const schemas = (
    SPEC.components as unknown as { schemas: Record<string, Schema> }
  ).schemas;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(schemas[s.$ref.split("/").pop()!]) : s;
  const keys = (s: Schema) => Object.keys(deref(s).properties ?? {}).sort();
  const body = (op: Op, status: string) =>
    op.responses[status].content!["application/json"].schema;

  const exportOp = paths["/api/dashboards/{id}/export"].get;
  const importOp = paths["/api/dashboards/import"].post;
  const FILE_KEYS = [
    "formatVersion",
    "exportedAt",
    "dashboard",
    "connections",
    "layout",
  ];

  it("the export body is the file itself: formatVersion 1, dashboard, conn_N connections and a v2 layout", () => {
    const file = deref(body(exportOp, "200"));
    expect(keys(file)).toEqual([...FILE_KEYS].sort());
    expect(file.required).toEqual(FILE_KEYS);
    const p = file.properties!;
    expect(p.formatVersion.enum).toEqual([1]);
    expect(p.exportedAt.format).toBe("date-time");
    expect(p.dashboard.required).toEqual(["name", "description"]);
    expect(p.dashboard.properties!.description.nullable).toBe(true);
    // A NeoDash import with an empty title stores, and so exports, name "".
    expect(p.dashboard.properties!.name.minLength).toBeUndefined();
    const conn = p.connections.additionalProperties as Schema;
    expect(conn.required).toEqual(["name", "type"]);
    expect(keys(conn)).toEqual(["name", "type"]);
    const layout = deref(p.layout);
    expect(layout.required).toEqual(["version", "pages"]);
    expect(layout.properties!.version.enum).toEqual([2]);
    expect(layout.properties!.pages.items!.required).toEqual([
      "id",
      "title",
      "widgets",
      "gridLayout",
    ]);
  });

  it("the export is not NeoDash-compatible, says who may export and documents 500", () => {
    expect(exportOp.description).not.toMatch(/NeoDash-compatible/);
    expect(exportOp.description).toMatch(/formatVersion 1/);
    expect(exportOp.description).toMatch(/never 403/);
    expect(exportOp.description).toMatch(
      /no connection id, config or credential is in the file/,
    );
    expect(exportOp.description).toMatch(/layout is null or has no pages/);
    expect(Object.keys(exportOp.responses).sort()).toEqual([
      "200",
      "401",
      "404",
      "500",
    ]);
  });

  it("the import takes payload, connectionMapping and skippedConnections", () => {
    const req = deref(importOp.requestBody!.content["application/json"].schema);
    expect(keys(req)).toEqual([
      "connectionMapping",
      "payload",
      "skippedConnections",
    ]);
    expect(req.required).toEqual(["payload"]);
    expect(
      (req.properties!.connectionMapping.additionalProperties as Schema).type,
    ).toBe("string");
    expect(req.properties!.skippedConnections.items!.type).toBe("string");
    expect(req.properties!.payload.anyOf!.map((s) => s.$ref)).toEqual([
      "#/components/schemas/DashboardImportFile",
      "#/components/schemas/NeoDashDashboard",
    ]);
  });

  it("the import file accepts less than the export sends: description optional, exportedAt any string", () => {
    const file = schemas.DashboardImportFile;
    expect(file.required).toEqual(FILE_KEYS);
    expect(file.properties!.dashboard.required).toEqual(["name"]);
    expect(file.properties!.dashboard.properties!.name.minLength).toBe(1);
    const conn = file.properties!.connections.additionalProperties as Schema;
    expect(conn.required).toEqual(["name", "type"]);
    expect(conn.properties!.name.type).toBe("string");
    expect(conn.properties!.type.type).toBe("string");
    expect(file.properties!.exportedAt.format).toBeUndefined();
    expect(schemas.NeoDashDashboard.required).toEqual(["pages"]);
  });

  it("the import answers the stored row plus notes and unassignedWidgetCount", () => {
    const created = deref(body(importOp, "201").properties!.data);
    expect(created.allOf![0].$ref).toBe("#/components/schemas/Dashboard");
    const extra = created.allOf![1];
    expect(extra.required).toEqual(["notes", "unassignedWidgetCount"]);
    expect(extra.properties!.notes.items!.type).toBe("string");
    expect(extra.properties!.unassignedWidgetCount.type).toBe("integer");
  });

  it("the import documents 403, 413 and 500 and names both file formats", () => {
    expect(Object.keys(importOp.responses).sort()).toEqual([
      "201",
      "400",
      "401",
      "403",
      "413",
      "500",
    ]);
    expect(importOp.description).not.toMatch(/NeoDash-compatible/);
    expect(importOp.description).toMatch(/NeoBoard export/);
    expect(importOp.description).toMatch(/Invalid connection mapping/);
    expect(importOp.description).toMatch(/neither mapped nor skipped/);
    expect(importOp.description).toMatch(
      /malformed NeoDash report can answer 500/,
    );
  });
});

describe("#1981 payloads: dashboards-share", () => {
  type Schema = {
    $ref?: string;
    type?: string;
    format?: string;
    description?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    enum?: unknown[];
    nullable?: boolean;
    items?: Schema;
  };
  type Resp = {
    $ref?: string;
    description?: string;
    content?: Record<string, { schema: Schema }>;
  };
  type Op = {
    description?: string;
    parameters?: { name?: string; in?: string; required?: boolean }[];
    responses: Record<string, Resp>;
    requestBody?: { content: Record<string, { schema: Schema }> };
  };
  const share = (SPEC.paths as unknown as Record<string, Record<string, Op>>)[
    "/api/dashboards/{id}/share"
  ];
  const schemas = (
    SPEC.components as unknown as { schemas: Record<string, Schema> }
  ).schemas;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(schemas[s.$ref.split("/").pop()!]) : s;
  const data = (op: Op, status: string) =>
    deref(
      op.responses[status].content!["application/json"].schema.properties!.data,
    );
  const statuses = (op: Op) => Object.keys(op.responses).sort();

  it("GET answers an unpaginated array of shares with their user", () => {
    const list = data(share.get, "200");
    expect(list.type).toBe("array");
    const item = deref(list.items!);
    const KEYS = [
      "id",
      "role",
      "createdAt",
      "userName",
      "userEmail",
      "userRole",
    ];
    expect(item.required).toEqual(KEYS);
    expect(Object.keys(item.properties!).sort()).toEqual([...KEYS].sort());
    const p = item.properties!;
    expect(p.role.enum).toEqual(["viewer", "editor"]);
    expect(p.userRole.enum).toEqual(["admin", "creator", "reader"]);
    expect(p.createdAt.nullable).toBe(true);
    expect(p.userName.nullable).toBe(true);
    expect(p.userEmail.nullable).toBeUndefined();
    expect(share.get.parameters).toBeUndefined();
    expect(share.get.description).toMatch(/owner or an admin/);
    expect(statuses(share.get)).toEqual(["200", "401", "404", "500"]);
  });

  it("POST takes email and role and answers 201 { success: true }", () => {
    const req = deref(
      share.post.requestBody!.content["application/json"].schema,
    );
    expect(req.required).toEqual(["email", "role"]);
    expect(Object.keys(req.properties!).sort()).toEqual(["email", "role"]);
    expect(req.properties!.email.format).toBe("email");
    expect(req.properties!.role.enum).toEqual(["viewer", "editor"]);
    expect(share.post.responses["200"]).toBeUndefined();
    const ok = data(share.post, "201");
    expect(ok.required).toEqual(["success"]);
    expect(ok.properties!.success.enum).toEqual([true]);
    expect(statuses(share.post)).toEqual([
      "201",
      "400",
      "401",
      "403",
      "404",
      "413",
      "500",
    ]);
    expect(share.post.description).toMatch(/User not found/);
    expect(share.post.description).toMatch(/yourself/);
    expect(share.post.description).toMatch(/disabled user still matches/);
    expect(req.properties!.email.description).toMatch(/disabled ones included/);
  });

  it("DELETE takes a required shareId query param and answers { success: true }, even for no match", () => {
    expect(share.delete.parameters).toEqual([
      expect.objectContaining({ name: "shareId", in: "query", required: true }),
    ]);
    const ok = data(share.delete, "200");
    expect(ok.required).toEqual(["success"]);
    expect(statuses(share.delete)).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "500",
    ]);
    expect(share.delete.description).toMatch(/matches no share/);
  });

  it("POST and DELETE answer 403 only to a session that must change its password", () => {
    for (const op of [share.post, share.delete]) {
      expect(op.responses["403"].$ref).toBeUndefined();
      expect(op.responses["403"].description).toMatch(
        /must change its password/,
      );
    }
  });
});

describe("#1981 payloads: users", () => {
  type Schema = {
    $ref?: string;
    type?: string;
    format?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    enum?: unknown[];
    nullable?: boolean;
    items?: Schema;
    minLength?: number;
    default?: unknown;
    description?: string;
  };
  type Resp = { $ref?: string; content?: Record<string, { schema: Schema }> };
  type Op = {
    description?: string;
    responses: Record<string, Resp>;
    requestBody?: { content: Record<string, { schema: Schema }> };
  };
  const paths = SPEC.paths as unknown as Record<string, Record<string, Op>>;
  const list = paths["/api/users"];
  const one = paths["/api/users/{id}"];
  const components = SPEC.components as unknown as {
    schemas: Record<string, Schema>;
    responses: Record<string, Resp>;
  };
  const schemas = components.schemas;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(schemas[s.$ref.split("/").pop()!]) : s;
  const resp = (r: Resp): Resp =>
    r.$ref ? components.responses[r.$ref.split("/").pop()!] : r;
  const data = (op: Op, status: string) =>
    deref(
      resp(op.responses[status]).content!["application/json"].schema.properties!
        .data,
    );
  const body = (op: Op) =>
    deref(op.requestBody!.content["application/json"].schema);
  const statuses = (op: Op) => Object.keys(op.responses).sort();

  const USER_KEYS = [
    "id",
    "name",
    "email",
    "role",
    "canWrite",
    "disabledAt",
    "lastLoginAt",
    "createdAt",
  ];

  it("GET, GET {id} and PATCH answer a User with all eight keys; name, disabledAt and lastLoginAt nullable", () => {
    const listed = data(list.get, "200");
    expect(listed.type).toBe("array");
    for (const user of [
      deref(listed.items!),
      data(one.get, "200"),
      data(one.patch, "200"),
    ]) {
      expect(user.required).toEqual(USER_KEYS);
      expect(Object.keys(user.properties!).sort()).toEqual(
        [...USER_KEYS].sort(),
      );
      const p = user.properties!;
      expect(p.name.nullable).toBe(true);
      expect(p.disabledAt).toMatchObject({
        format: "date-time",
        nullable: true,
      });
      expect(p.lastLoginAt).toMatchObject({
        format: "date-time",
        nullable: true,
      });
      expect(p.createdAt.nullable).toBeUndefined();
    }
    expect(list.get.description).toMatch(/caller's tenant, newest first/);
  });

  it("canWrite is the stored flag, overridden by the admin and reader roles", () => {
    for (const s of [schemas.User, schemas.CreatedUser]) {
      expect(s.properties!.canWrite.description).toMatch(
        /admins always write and readers never do/,
      );
    }
  });

  it("the list meta always carries total, limit and offset", () => {
    expect(schemas.PaginationMeta.required).toEqual([
      "total",
      "limit",
      "offset",
    ]);
  });

  it("POST answers 201 with the six keys its insert returns", () => {
    const created = data(list.post, "201");
    const KEYS = ["id", "name", "email", "role", "canWrite", "createdAt"];
    expect(created.required).toEqual(KEYS);
    expect(Object.keys(created.properties!).sort()).toEqual([...KEYS].sort());
    expect(created.properties!.name.nullable).toBeUndefined();
    expect(list.post.responses["200"]).toBeUndefined();
  });

  it("POST takes the real password rule and forcePasswordChange", () => {
    const req = body(list.post);
    expect(req.required).toEqual(["name", "email", "password"]);
    expect(Object.keys(req.properties!).sort()).toEqual([
      "canWrite",
      "email",
      "forcePasswordChange",
      "name",
      "password",
      "role",
    ]);
    expect(req.properties!.password.minLength).toBe(8);
    expect(req.properties!.forcePasswordChange.default).toBe(false);
  });

  it("PATCH takes role, canWrite and disabled, and no name", () => {
    const req = body(one.patch);
    expect(Object.keys(req.properties!).sort()).toEqual([
      "canWrite",
      "disabled",
      "role",
    ]);
    expect(req.properties!.disabled.type).toBe("boolean");
    expect(one.patch.description).toMatch(/cannot PATCH their own/);
  });

  it("DELETE answers { deleted: true }, not { success }", () => {
    const ok = data(one.delete, "200");
    expect(ok.required).toEqual(["deleted"]);
    expect(ok.properties!.deleted.enum).toEqual([true]);
    expect(ok.properties!.success).toBeUndefined();
  });

  it("documents each operation's statuses", () => {
    expect(statuses(list.get)).toEqual(["200", "401", "403", "500"]);
    expect(statuses(list.post)).toEqual([
      "201",
      "400",
      "401",
      "403",
      "409",
      "413",
      "500",
    ]);
    expect(statuses(one.get)).toEqual(["200", "401", "403", "404", "500"]);
    expect(statuses(one.patch)).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "413",
      "500",
    ]);
    expect(statuses(one.delete)).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "500",
    ]);
  });
});

describe("#1981 payloads: templates-keys", () => {
  type Schema = {
    $ref?: string;
    type?: string;
    format?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    enum?: unknown[];
    nullable?: boolean;
    items?: Schema;
    maxLength?: number;
    maxItems?: number;
    pattern?: string;
    default?: unknown;
    description?: string;
  };
  type Resp = { $ref?: string; content?: Record<string, { schema: Schema }> };
  type Op = {
    description?: string;
    parameters?: readonly (OAParam & { description?: string })[];
    responses: Record<string, Resp>;
    requestBody?: { content: Record<string, { schema: Schema }> };
  };
  const paths = SPEC.paths as unknown as Record<string, Record<string, Op>>;
  const templates = paths["/api/widget-templates"];
  const template = paths["/api/widget-templates/{id}"];
  const keys = paths["/api/keys"];
  const key = paths["/api/keys/{id}"];
  const components = SPEC.components as unknown as {
    schemas: Record<string, Schema>;
    responses: Record<string, Resp>;
  };
  const schemas = components.schemas;
  const deref = (s: Schema): Schema =>
    s.$ref ? deref(schemas[s.$ref.split("/").pop()!]) : s;
  const resp = (r: Resp): Resp =>
    r.$ref ? components.responses[r.$ref.split("/").pop()!] : r;
  const data = (op: Op, status: string) =>
    deref(
      resp(op.responses[status]).content!["application/json"].schema.properties!
        .data,
    );
  const body = (op: Op) =>
    deref(op.requestBody!.content["application/json"].schema);
  const statuses = (op: Op) => Object.keys(op.responses).sort();

  const TEMPLATE_KEYS = [
    "id",
    "name",
    "description",
    "tags",
    "chartType",
    "connectorType",
    "connectionId",
    "query",
    "params",
    "settings",
    "previewImageUrl",
    "createdBy",
    "tenantId",
    "createdAt",
    "updatedAt",
  ];

  it("every template operation answers the full row, all 15 keys required", () => {
    const listed = data(templates.get, "200");
    expect(listed.type).toBe("array");
    for (const t of [
      deref(listed.items!),
      data(templates.post, "201"),
      data(template.get, "200"),
      data(template.put, "200"),
    ]) {
      expect(t.required).toEqual(TEMPLATE_KEYS);
      expect(Object.keys(t.properties!).sort()).toEqual(
        [...TEMPLATE_KEYS].sort(),
      );
      const p = t.properties!;
      for (const k of ["connectorType", "tags", "createdAt", "updatedAt"]) {
        expect(p[k].nullable).toBe(true);
      }
      for (const k of ["id", "name", "chartType", "query", "createdBy"]) {
        expect(p[k].nullable).toBeUndefined();
      }
    }
  });

  it("the connectorType filter also returns templates that need no connection", () => {
    const param = templates.get.parameters!.find(
      (p) => p.name === "connectorType",
    )!;
    expect(param.description).toMatch(/connectorType. null/);
    expect(schemas.PaginationMeta.description).toMatch(
      /matching the query's filters, before limit and offset/,
    );
  });

  it("POST takes the create limits; PUT takes a partial body where connectionId may be null", () => {
    const create = body(templates.post);
    expect(create.required).toEqual(["name", "chartType"]);
    expect(create.properties!.name.maxLength).toBe(255);
    expect(create.properties!.description.maxLength).toBe(1000);
    expect(create.properties!.tags.maxItems).toBe(20);
    expect(create.properties!.tags.items!.maxLength).toBe(100);
    expect(create.properties!.previewImageUrl).toMatchObject({
      pattern: "^data:image/",
      maxLength: 512000,
    });

    const update = body(template.put);
    expect(update.required).toBeUndefined();
    expect(Object.keys(update.properties!).sort()).toEqual(
      Object.keys(create.properties!).sort(),
    );
    expect(update.properties!.connectionId.nullable).toBe(true);
    expect(update.properties!.connectorType.nullable).toBeUndefined();
    expect(update.properties!.query.default).toBeUndefined();
  });

  it("DELETE a template answers { deleted: true }", () => {
    const ok = data(template.delete, "200");
    expect(ok.required).toEqual(["deleted"]);
    expect(ok.properties!.deleted.enum).toEqual([true]);
    expect(ok.properties!.success).toBeUndefined();
  });

  it("GET /api/keys answers the six projected keys, keyPrefix and createdAt nullable", () => {
    const listed = data(keys.get, "200");
    expect(listed.type).toBe("array");
    const k = deref(listed.items!);
    const KEYS = [
      "id",
      "name",
      "keyPrefix",
      "lastUsedAt",
      "expiresAt",
      "createdAt",
    ];
    expect(k.required).toEqual(KEYS);
    expect(Object.keys(k.properties!).sort()).toEqual([...KEYS].sort());
    expect(k.properties!.keyPrefix.nullable).toBe(true);
    expect(k.properties!.createdAt.nullable).toBe(true);
  });

  it("POST /api/keys answers 201 with keyPrefix and the plaintext key, and takes a UTC expiresAt", () => {
    const created = data(keys.post, "201");
    const KEYS = ["id", "name", "keyPrefix", "expiresAt", "createdAt", "key"];
    expect(created.required).toEqual(KEYS);
    expect(Object.keys(created.properties!).sort()).toEqual([...KEYS].sort());
    expect(created.properties!.keyPrefix.nullable).toBeUndefined();
    expect(created.properties!.lastUsedAt).toBeUndefined();
    expect(body(keys.post).properties!.expiresAt.description).toMatch(
      /`Z` suffix/,
    );
  });

  it("DELETE /api/keys/{id} answers { success: true } and revokes only the caller's own key", () => {
    const ok = data(key.delete, "200");
    expect(ok.required).toEqual(["success"]);
    expect(ok.properties!.success.enum).toEqual([true]);
    expect(key.delete.description).toMatch(/Another user's key answers 404/);
  });

  it("documents each operation's statuses", () => {
    expect(statuses(templates.get)).toEqual(["200", "401", "500"]);
    expect(statuses(templates.post)).toEqual([
      "201",
      "400",
      "401",
      "403",
      "413",
      "500",
    ]);
    expect(statuses(template.get)).toEqual(["200", "401", "404", "500"]);
    expect(statuses(template.put)).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "413",
      "500",
    ]);
    expect(statuses(template.delete)).toEqual([
      "200",
      "401",
      "403",
      "404",
      "500",
    ]);
    expect(statuses(keys.get)).toEqual(["200", "401", "500"]);
    expect(statuses(keys.post)).toEqual([
      "201",
      "400",
      "401",
      "403",
      "413",
      "500",
      "503",
    ]);
    expect(statuses(key.delete)).toEqual(["200", "401", "403", "404", "500"]);
    expect(resp(keys.post.responses["413"])).toBe(
      components.responses.PayloadTooLarge,
    );
  });
});

/**
 * #1981 drift guard: every key a route's unit test reads off `body.data` must
 * be declared under that operation's documented `data`. The route tests are
 * scanned, not listed, so a key a new test reads is checked from birth.
 * The path comes from the test's directory and the method from the last
 * `await GET|POST|PUT|PATCH|DELETE` before the read.
 */
describe("#1981 payloads: drift", () => {
  type Schema = {
    $ref?: string;
    properties?: Record<string, Schema>;
    additionalProperties?: unknown;
    allOf?: Schema[];
    oneOf?: Schema[];
    anyOf?: Schema[];
    items?: Schema;
  };
  type Resp = { $ref?: string; content?: Record<string, { schema?: Schema }> };
  const deref = <T extends { $ref?: string }>(node: T): T => {
    if (!node.$ref) return node;
    const [, , kind, name] = node.$ref.split("/");
    return deref(
      (SPEC.components as unknown as Record<string, Record<string, T>>)[kind][
        name
      ],
    );
  };
  const paths = SPEC.paths as unknown as Record<
    string,
    Record<string, { responses?: Record<string, Resp> }>
  >;

  /** Every key a schema declares (allOf/oneOf/anyOf merged, arrays by their items), or null when it is free-form. */
  function declared(schema: Schema): Set<string> | null {
    const node = deref(schema);
    if (node.items) {
      const items = declared(node.items);
      // `data.length` reads the array itself.
      return items && new Set([...items, "length"]);
    }
    if (node.additionalProperties) return null;
    const parts = [
      ...(node.allOf ?? []),
      ...(node.oneOf ?? []),
      ...(node.anyOf ?? []),
    ].map(declared);
    if (parts.includes(null)) return null;
    const keys = new Set([
      ...Object.keys(node.properties ?? {}),
      ...parts.flatMap((p) => [...p!]),
    ]);
    // ponytail: an object that declares nothing is free-form, like a query row.
    return keys.size ? keys : null;
  }

  /** The keys none of `schemas` declares; a free-form schema declares every key. */
  function undeclared(schemas: Schema[], keys: string[]): string[] {
    const sets = schemas.map(declared);
    if (sets.includes(null)) return [];
    return keys.filter((k) => !sets.some((s) => s!.has(k)));
  }

  /** The `data` schema of every 2xx response an operation documents. */
  const dataSchemas = (path: string, method: string): Schema[] =>
    Object.entries(paths[path]?.[method]?.responses ?? {})
      .filter(([status]) => status.startsWith("2"))
      .flatMap(([, r]) => {
        const body = deref(r).content?.["application/json"]?.schema;
        const data = body && deref(body).properties?.data;
        return data ? [data] : [];
      });

  /** The top-level keys of the object literal that opens at `src[start]`. */
  function literalKeys(src: string, start: number): string[] {
    let depth = 0;
    let top = "";
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        i = src.indexOf(c, i + 1); // ponytail: no escaped quotes in fixtures
        if (i < 0) break; // an unclosed quote ends the scan, never restarts it
        if (depth === 1) top += '""';
      } else if ("{[(".includes(c)) depth++;
      else if ("}])".includes(c) && --depth === 0) break;
      else if (depth === 1) top += c;
    }
    return [...top.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map(
      (m) => m[1],
    );
  }

  const HANDLER = /\bawait\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  /** `x.data.key` / `x.data[0].key` on the body (not `data.data`), not a call, not asserted absent. */
  const MEMBER =
    /(?<!\.data(?:\[\d+\])?)\.data(?:\[\d+\])?\.([A-Za-z_$][\w$]*)(?![\w$]|\s*\(|\)\.toBeUndefined\b)/g;
  /** `expect(x.data).toEqual({...})` or `.toEqual(fixture)`. */
  const WHOLE =
    /(?<!\.data)\.data\)\.(?:toEqual|toStrictEqual|toMatchObject)\(\s*(\{|[A-Za-z_$][\w$]*)/g;

  /** Each `[method, key]` a test source reads off `data`. */
  function reads(src: string): [string, string][] {
    const handlers = [...src.matchAll(HANDLER)];
    const methodAt = (index: number) =>
      handlers
        .filter((h) => h.index < index)
        .pop()?.[1]
        .toLowerCase();
    /** Where the literal compared against starts: inline, or the fixture's `const x = {`. */
    const literalAt = (m: RegExpExecArray) => {
      if (m[1] === "{") return m.index + m[0].length - 1;
      const decl = src.lastIndexOf(`const ${m[1]} = {`, m.index);
      return decl < 0 ? -1 : src.indexOf("{", decl);
    };
    const found: [number, string][] = [
      ...[...src.matchAll(MEMBER)].map((m): [number, string] => [
        m.index,
        m[1],
      ]),
      ...[...src.matchAll(WHOLE)].flatMap((m) => {
        const at = literalAt(m);
        return at < 0
          ? []
          : literalKeys(src, at).map((k): [number, string] => [m.index, k]);
      }),
    ];
    return found.flatMap(([index, key]) => {
      const method = methodAt(index);
      return method ? [[method, key] as [string, string]] : [];
    });
  }

  const API = join(__dirname, "..", "..", "..", "app", "api");
  /** `METHOD /api/path` → the keys its tests read, and the files reading them. */
  const cases = new Map<string, { keys: Set<string>; files: Set<string> }>();
  for (const raw of readdirSync(API, { recursive: true }) as string[]) {
    // Windows separators are "\\": match on "/" everywhere.
    const file = raw.replaceAll("\\", "/");
    if (!/(^|\/)__tests__\/[^/]+\.test\.ts$/.test(file)) continue;
    const route =
      "/api/" + file.split("/__tests__/")[0].replaceAll(/\[(\w+)\]/g, "{$1}");
    // Operations the spec does not document at all are outside #1981.
    if (!paths[route]) continue;
    const src = readFileSync(join(API, file), "utf8");
    // ponytail: a file that also imports another route's handlers can't be
    // attributed by directory; skipped (descriptor-config.test.ts today).
    // Map its import aliases to routes if one ever needs covering.
    if (
      /import\(\s*"\.\.\/[^"]+\/route"\s*\)|from "\.\.\/[^"]+\/route"/.test(src)
    )
      continue;
    for (const [method, key] of reads(src)) {
      const label = `${method.toUpperCase()} ${route}`;
      const entry = cases.get(label) ?? { keys: new Set(), files: new Set() };
      entry.keys.add(key);
      entry.files.add(file);
      cases.set(label, entry);
    }
  }

  it("the checker fails on an undeclared key and passes a declared one", () => {
    const schema: Schema = {
      allOf: [{ properties: { id: {} } }, { properties: { name: {} } }],
    };
    expect(undeclared([schema], ["id", "name", "ownerId"])).toEqual([
      "ownerId",
    ]);
    expect(undeclared([{ items: schema }], ["name", "length"])).toEqual([]);
    expect(undeclared([], ["id"])).toEqual(["id"]);
    expect(undeclared([{ additionalProperties: true }], ["any"])).toEqual([]);
  });

  it("the scanner reads member, fixture and literal keys by the handler that answered", () => {
    const src = [
      "const res = await GET(req);",
      "expect(body.data[0].name).toBe('x');",
      "expect(body.data.ownerId).toBeUndefined();",
      "expect(body.data.find((d) => d.id)?.role).toBe('owner');",
      "const created = { id: 't1', meta: { nested: 1 }, label: 'a:b' };",
      "const r2 = await POST(req);",
      "expect((await r2.json()).data).toEqual(created);",
      "const r3 = await DELETE(req);",
      "expect(body.data).toEqual({ deleted: true });",
    ].join("\n");
    expect(reads(src)).toEqual([
      ["get", "name"],
      ["post", "id"],
      ["post", "meta"],
      ["post", "label"],
      ["delete", "deleted"],
    ]);
  });

  it("covers at least one route per #1981 resource, each with a closed schema", () => {
    const required = [
      "GET /api/connections",
      "GET /api/connections/{id}",
      "GET /api/connections/{id}/schema",
      "GET /api/dashboards",
      "GET /api/dashboards/{id}",
      "POST /api/dashboards/{id}/share",
      "GET /api/users",
      "PATCH /api/users/{id}",
      "POST /api/widget-templates",
      "DELETE /api/widget-templates/{id}",
      "POST /api/keys",
    ];
    expect([...cases.keys()]).toEqual(expect.arrayContaining(required));
    for (const label of required) {
      const [method, path] = label.split(" ");
      // A free-form `data` would pass any key, so the check would be vacuous.
      expect(
        dataSchemas(path, method.toLowerCase()).map(declared),
        label,
      ).not.toContain(null);
    }
  });

  it.each([...cases].map(([label, { keys, files }]) => [label, keys, files]))(
    "%s: every key its tests read is documented",
    (label, keys, files) => {
      const [method, path] = (label as string).split(" ");
      expect(
        undeclared(dataSchemas(path, method.toLowerCase()), [
          ...(keys as Set<string>),
        ]),
        `read in ${[...(files as Set<string>)].join(", ")}`,
      ).toEqual([]);
    },
  );
});
