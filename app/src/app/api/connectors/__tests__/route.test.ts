import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerConnector,
  unregisterConnector,
  type ConnectorPlugin,
} from "@neoboard/connection";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

/**
 * GET /api/connectors (#1899) — the browser's only channel to connector facts.
 *
 * The real registry runs here, not a mock: the point of the route is that
 * whatever is registered comes out, so the fixture below is a third connector
 * nothing in `app/` has ever heard of.
 */

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
// The mock hands back the body the route built, BEFORE serialisation — so a
// function on it is still there to be caught, where a real Response would
// have dropped it silently on the way out.
vi.mock("next/server", () => nextResponseMockFactory());

const { GET } = await import("../route");
const { UnauthorizedError } = await import("@/lib/auth/errors");

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>';

/** Defined entirely here. Carries extras a careless author might hang on a plugin. */
const fixture = {
  type: "acme-sheets",
  label: "Acme Sheets",
  category: "file",
  iconSvg: ICON,
  queryLanguage: "acmeql",
  supportsWrite: false,
  fields: [
    {
      key: "endpoint",
      label: "Endpoint",
      type: "uri",
      group: "connection",
      required: true,
      placeholder: "acme://host/book",
      protocols: ["acme:"],
    },
    { key: "token", label: "Token", type: "password", group: "connection" },
    {
      key: "pageSize",
      label: "Page Size",
      type: "number",
      group: "advanced",
      min: 1,
      max: 500,
    },
  ],
  createModule: () => {
    throw new Error("never connected");
  },
  createSchemaManager: () => {
    throw new Error("never introspected");
  },
  driver: { pool: { secret: "never-serialised" } },
} as ConnectorPlugin;

describe("GET /api/connectors", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockRequireSession.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      role: "reader",
      canWrite: false,
    });
  });

  afterEach(() => unregisterConnector(fixture.type));

  it("is 401 without a session, and says nothing about the connectors", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      data: null,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      meta: null,
    });
  });

  it("answers in the standard envelope, privately cacheable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/^private\b/);
    const body = await res.json();
    expect(body).toEqual({
      data: expect.any(Array),
      error: null,
      meta: null,
    });
    expect(body.data.length).toBeGreaterThan(0);
    for (const connector of body.data) {
      expect(connector).toEqual(
        expect.objectContaining({
          type: expect.any(String),
          label: expect.any(String),
          category: expect.stringMatching(/^(database|graph|api|file)$/),
          fields: expect.any(Array),
        }),
      );
    }
  });

  it("serves a connector registered a moment ago, with its own label, category, fields and icon", async () => {
    registerConnector(fixture);
    const { data } = await (await GET()).json();
    const served = data.find((c: { type: string }) => c.type === fixture.type);
    expect(served).toEqual({
      type: "acme-sheets",
      label: "Acme Sheets",
      category: "file",
      iconSvg: ICON,
      queryLanguage: "acmeql",
      supportsWrite: false,
      fields: fixture.fields,
    });
  });

  it("leaks no function and no driver object: the payload survives a JSON round trip unchanged", async () => {
    registerConnector(fixture);
    const { data } = await (await GET()).json();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    const flat = JSON.stringify(data);
    expect(flat).not.toContain("never-serialised");
    expect(flat).not.toMatch(/createModule|createSchemaManager|driver/);
  });
});
