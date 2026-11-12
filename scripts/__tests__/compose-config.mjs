import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Shared by the compose tests. Not a test file: the glob wants *.test.mjs.
export const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(
  /\/$/,
  "",
);
export const DOCKER = join(ROOT, "docker");

// The expose-host overlay and the logging add-on (#2439) are layered on a
// production file: the neoboard service has no image or build in them, so
// they cannot resolve alone. log-shipping-kit.test.mjs resolves the add-on.
const OVERLAYS = new Set([
  "docker-compose.expose-host.yml",
  "docker-compose.logging.yml",
]);
export const standalone = readdirSync(DOCKER).filter(
  (f) => f.endsWith(".yml") && !OVERLAYS.has(f),
);

// Compose normalises both depends_on syntaxes. Placeholders stand in for the
// `:?` vars; docker/.env is gitignored and absent in CI. `--profile "*"`
// keeps services behind an inactive profile in the resolved config.
export const resolve = (file) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--profile",
        "*",
        "-f",
        join(DOCKER, file),
        "config",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ENCRYPTION_KEY: "0".repeat(64),
          NEXTAUTH_SECRET: "test-secret",
          API_KEY_HMAC_SECRET: "0".repeat(64),
          DATABASE_URL: "postgres://x:x@localhost/x",
          POSTGRES_PASSWORD: "test-password",
        },
      },
    ),
  );
