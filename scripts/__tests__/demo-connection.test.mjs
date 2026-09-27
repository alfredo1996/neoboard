import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  demoConnectionInsert,
  demoConnectionUpdate,
  demoPgConfigs,
  grantDemoRoles,
} from "../lib/demo-connection.mjs";

/**
 * #2048 — the demo seeded its connections with the column default, `private`,
 * so only admin@ could see them and creator@ had nothing to build a widget on.
 * Both write paths must share them with the workspace.
 */
describe("demo connection rows", () => {
  it("inserts a new demo connection shared with the workspace", () => {
    expect(
      demoConnectionInsert({
        id: "c1",
        userId: "u1",
        name: "Neo4j Movies",
        type: "neo4j",
        configEncrypted: "iv:tag:ct",
      }),
    ).toEqual({
      id: "c1",
      userId: "u1",
      name: "Neo4j Movies",
      type: "neo4j",
      configEncrypted: "iv:tag:ct",
      visibility: "shared",
    });
  });

  // `neoboard demo seed` on an existing demo takes the UPDATE path.
  it("re-seeding an existing demo connection shares it too", () => {
    expect(demoConnectionUpdate("iv:tag:ct")).toEqual({
      configEncrypted: "iv:tag:ct",
      visibility: "shared",
    });
  });

  it("seed-demo.mjs writes both paths through the helpers", () => {
    const seed = readFileSync(
      new URL("../seed-demo.mjs", import.meta.url),
      "utf8",
    );
    expect(seed).toMatch(
      /INSERT INTO "connection" \$\{sql\(\s*demoConnectionInsert\(/,
    );
    expect(seed).toMatch(/SET \$\{sql\(demoConnectionUpdate\(/);
  });
});

/**
 * #2048 review — once shared, a demo connection is usable by every persona,
 * reader@ included, whose password the demo prints. Logged in as the server's
 * superuser, that was arbitrary SQL on the app's own metadata database
 * (password hashes, API key hashes) and `COPY … TO PROGRAM`, which a READ ONLY
 * transaction does not stop. The demo connections log in as two demo roles
 * that can reach the demo data and nothing else.
 */
describe("demo Postgres logins", () => {
  const read = {
    username: "neoboard_demo_read",
    password: "neoboard_demo_read",
  };
  const write = {
    username: "neoboard_demo_write",
    password: "neoboard_demo_write",
  };

  it("every Postgres demo connection logs in as a demo role, never the superuser", () => {
    expect(demoPgConfigs("pg")).toEqual({
      movies: { uri: "postgresql://pg:5432", ...read, database: "movies" },
      ecommerceRead: {
        uri: "postgresql://pg:5432/neoboard",
        ...read,
        database: "neoboard",
      },
      ecommerceWrite: {
        uri: "postgresql://pg:5432/neoboard",
        ...write,
        database: "neoboard",
      },
    });
  });

  /** Records the SQL each database is sent. */
  const recorder = (fail) => {
    const ran = [];
    return {
      ran,
      unsafe: async (text) => {
        if (fail) throw fail;
        ran.push(text);
      },
    };
  };
  const grantsIn = (texts) =>
    texts
      .join("\n")
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.startsWith("GRANT"));

  it("creates both roles as plain logins, idempotently, before any grant", async () => {
    const app = recorder();
    await grantDemoRoles(app, recorder());
    const [roles] = app.ran;
    for (const { username, password } of [read, write]) {
      expect(roles).toContain(
        `CREATE ROLE ${username} LOGIN PASSWORD '${password}'`,
      );
    }
    expect(roles).toMatch(/EXCEPTION WHEN duplicate_object THEN/);
    expect(roles).not.toMatch(/SUPERUSER|CREATEDB|CREATEROLE|BYPASSRLS|GRANT/);
  });

  it("grants SELECT to the read role and DML to the write role, on the demo data only", async () => {
    const app = recorder();
    const movies = recorder();
    await grantDemoRoles(app, movies);
    expect(grantsIn(app.ran)).toEqual([
      "GRANT USAGE ON SCHEMA neoboard_demo_public TO neoboard_demo_read, neoboard_demo_write",
      "GRANT SELECT ON ALL TABLES IN SCHEMA neoboard_demo_public TO neoboard_demo_read",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA neoboard_demo_public TO neoboard_demo_write",
      "GRANT USAGE ON ALL SEQUENCES IN SCHEMA neoboard_demo_public TO neoboard_demo_write",
    ]);
    expect(grantsIn(movies.ran)).toEqual([
      "GRANT SELECT ON ALL TABLES IN SCHEMA public TO neoboard_demo_read",
    ]);
  });

  // The movies database comes from docker/postgres/init.sql; a server without
  // it has no PostgreSQL Movies data to grant, and the seed carries on.
  it("skips the movies grants on a server with no movies database", async () => {
    const missing = Object.assign(new Error("no movies"), { code: "3D000" });
    await expect(
      grantDemoRoles(recorder(), recorder(missing)),
    ).resolves.toBeUndefined();

    const denied = Object.assign(new Error("denied"), { code: "42501" });
    await expect(grantDemoRoles(recorder(), recorder(denied))).rejects.toBe(
      denied,
    );
  });

  it("seed-demo.mjs builds its Postgres configs and grants through the helpers", () => {
    const seed = readFileSync(
      new URL("../seed-demo.mjs", import.meta.url),
      "utf8",
    );
    expect(seed).toMatch(/demoPgConfigs\(pgHost\)/);
    // After the schema is recreated: its DROP … CASCADE drops the old grants.
    const recreated = seed.indexOf("await recreateEcommerceSchema(sql);");
    const granted = seed.indexOf("await grantDemoRoles(sql, movies);");
    expect(recreated).toBeGreaterThan(-1);
    expect(granted).toBeGreaterThan(recreated);
    expect(seed).not.toMatch(/username: "neoboard"/);
  });
});
