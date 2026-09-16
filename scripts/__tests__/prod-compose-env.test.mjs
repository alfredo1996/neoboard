import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Configuration that told operators something the stack does not do (#1796).
//
// Compose sets only the variables a service lists. The prod compose files
// listed every runtime variable except MIGRATE_ON_START, so
// `MIGRATE_ON_START=0 docker compose ... up` never reached the container: a
// rollback to an older image migrated anyway. The CLI packs these same files
// (cli/scripts/stage-compose.mjs copies them verbatim).
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

/** One compose service's `environment:` map, read by indentation. */
function serviceEnvironment(yaml, service) {
  const env = {};
  let inService = false;
  let inEnv = false;
  for (const line of yaml.split("\n")) {
    const indent = line.search(/\S/);
    if (indent === -1 || line.trimStart().startsWith("#")) continue;
    if (indent <= 2) inService = indent === 2 && line.trim() === `${service}:`;
    if (indent <= 4) {
      inEnv = inService && indent === 4 && line.trim() === "environment:";
    } else if (inEnv && indent === 6) {
      const m = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

describe("prod compose files forward MIGRATE_ON_START (#1796)", () => {
  it("defaults to the image's own value", () => {
    // `:-1` keeps an unset or empty variable at what the image already does.
    expect(read("Dockerfile")).toMatch(/^ENV MIGRATE_ON_START=1$/m);
  });

  it.each(["docker/docker-compose.prod.yml", "docker/docker-compose.prod-full.yml"])(
    "%s passes it to the neoboard service",
    (path) => {
      const env = serviceEnvironment(read(path), "neoboard");
      expect(env).toHaveProperty("ENCRYPTION_KEY"); // found the right block
      expect(env).not.toHaveProperty("POSTGRES_DB"); // and only that block
      expect(env.MIGRATE_ON_START).toBe("${MIGRATE_ON_START:-1}");
    },
  );
});
