import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { GET } from "../route";
import { resetMetrics } from "@/lib/metrics";

const TOKEN = "s3cret-metrics-token";

function req(auth?: string) {
  return new Request("http://localhost/api/metrics", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/metrics", () => {
  const original = process.env.METRICS_TOKEN;
  beforeEach(() => resetMetrics());
  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = original;
  });

  it("is 404 when METRICS_TOKEN is unset, even with a header", async () => {
    delete process.env.METRICS_TOKEN;
    expect((await GET(req(`Bearer ${TOKEN}`))).status).toBe(404);
  });

  it("is 404 when METRICS_TOKEN is empty", async () => {
    process.env.METRICS_TOKEN = "";
    expect((await GET(req("Bearer "))).status).toBe(404);
  });

  it.each([
    ["missing", undefined],
    ["wrong", "Bearer nope"],
    ["wrong length", "Bearer x"],
    ["wrong scheme", `Basic ${TOKEN}`],
  ])("is 401 with a %s token", async (_n, header) => {
    process.env.METRICS_TOKEN = TOKEN;
    expect((await GET(req(header))).status).toBe(401);
  });

  it("is 200 in the Prometheus text format with the right token", async () => {
    process.env.METRICS_TOKEN = TOKEN;
    const res = await GET(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(
      "text/plain; version=0.0.4",
    );
    expect(await res.text()).toContain("neoboard_query_duration_seconds");
  });
});
