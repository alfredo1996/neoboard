#!/usr/bin/env node
// End-to-end check of the log kit: sign in, run one query through /api/query,
// then wait for its `query_executed` line in OpenSearch with requestId,
// durationMs and schedulerWaitMs as fields (a parser that leaves the JSON as
// one string fails here). Run by .github/workflows/log-shipping-pipeline.yml.
//
//   APP_URL=http://localhost:3000 OPENSEARCH_URL=http://localhost:9200 \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... PG_PASSWORD=... node pipeline-check.mjs
const {
  APP_URL = "http://localhost:3000",
  OPENSEARCH_URL = "http://localhost:9200",
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PG_PASSWORD,
  PG_USER = "neoboard",
  PG_DB = "neoboard",
  PG_HOST = "postgres",
} = process.env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookiesOf = (res) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function until(what, fn, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // not up yet
    }
    await sleep(3000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

await until("the app", async () => (await fetch(`${APP_URL}/api/health`)).ok);

const csrfRes = await fetch(`${APP_URL}/api/auth/csrf`);
const { csrfToken } = await csrfRes.json();
const loginRes = await fetch(`${APP_URL}/api/auth/callback/credentials`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: cookiesOf(csrfRes),
  },
  body: new URLSearchParams({
    csrfToken,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  }),
  redirect: "manual",
});
const session = cookiesOf(loginRes);
if (!/authjs\.session-token=/.test(session)) throw new Error("login failed");

const json = { Cookie: session, "Content-Type": "application/json" };
const connRes = await fetch(`${APP_URL}/api/connections`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({
    name: "log-pipeline-check",
    type: "postgresql",
    config: {
      uri: `postgresql://${PG_HOST}:5432`,
      username: PG_USER,
      password: PG_PASSWORD,
      database: PG_DB,
    },
  }),
});
if (connRes.status !== 201) throw new Error(`connection: ${connRes.status}`);
const connectionId = (await connRes.json()).data.id;

const queryRes = await fetch(`${APP_URL}/api/query`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({ connectionId, query: "SELECT 1 AS one" }),
});
if (!queryRes.ok) throw new Error(`query: ${queryRes.status}`);

const hit = await until("the query line in OpenSearch", async () => {
  const res = await fetch(`${OPENSEARCH_URL}/neoboard-*/_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        bool: {
          filter: [
            { term: { "event.keyword": "query_executed" } },
            { exists: { field: "requestId" } },
            { exists: { field: "durationMs" } },
            { exists: { field: "schedulerWaitMs" } },
          ],
        },
      },
    }),
  });
  const body = await res.json();
  return body.hits?.hits?.[0]?._source;
});

console.log("shipped:", JSON.stringify(hit));
await fetch(`${APP_URL}/api/connections/${connectionId}`, {
  method: "DELETE",
  headers: json,
});
