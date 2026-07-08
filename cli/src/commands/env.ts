import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse as parseEnv } from "dotenv";
import { paths, readProjectConfig, getMode } from "../lib/config.js";
import { info, success, error as logError, banner } from "../lib/output.js";

const REQUIRED_VARS = [
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  // API_KEY_HMAC_SECRET is required for the community API-keys feature; the
  // server fails at startup without it. Auto-generated alongside other secrets.
  "API_KEY_HMAC_SECRET",
];

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export function validateEnv(): { ok: boolean; missing: string[] } {
  if (!existsSync(paths.envFile)) {
    return { ok: false, missing: ["(file does not exist)"] };
  }
  const vars = parseEnv(readFileSync(paths.envFile, "utf-8"));
  const missing = REQUIRED_VARS.filter((k) => !vars[k]);
  return { ok: missing.length === 0, missing };
}

export function generateEnvFile(opts?: { regenerate?: boolean }): void {
  if (existsSync(paths.envFile) && !opts?.regenerate) {
    info("app/.env.local already exists. Use --regenerate to overwrite.");
    return;
  }

  const config = readProjectConfig();
  const dbUrl = `postgresql://${config.postgres.user}:${config.postgres.password}@localhost:${config.ports.postgres}/${config.postgres.database}`;
  const encryptionKey = generateSecret();
  const nextauthSecret = generateSecret();
  const bootstrapToken = generateSecret();
  // API_KEY_HMAC_SECRET — required by the community API-keys feature (#907);
  // the server fails at startup without it. Generated up front alongside the
  // other secrets so a fresh `neoboard setup` produces a fully-working install.
  const apiKeyHmacSecret = generateSecret();

  const lines = [
    `DATABASE_URL=${dbUrl}`,
    `ENCRYPTION_KEY=${encryptionKey}`,
    `NEXTAUTH_SECRET=${nextauthSecret}`,
    `NEXTAUTH_URL=http://localhost:${config.ports.app}`,
    `ADMIN_BOOTSTRAP_TOKEN=${bootstrapToken}`,
    `API_KEY_HMAC_SECRET=${apiKeyHmacSecret}`,
    "",
  ];

  writeFileSync(paths.envFile, lines.join("\n"));
  success("Generated app/.env.local");

  banner([
    "Save this token — you'll need it for first-time signup:",
    "",
    `ADMIN_BOOTSTRAP_TOKEN=${bootstrapToken}`,
  ]);
}

export async function runEnv(opts: {
  regenerate?: boolean;
  validate?: boolean;
}): Promise<void> {
  if (getMode() === "docker") {
    info(
      "In Docker mode, environment is managed by docker-compose. Not needed.",
    );
    return;
  }

  if (opts.validate) {
    const result = validateEnv();
    if (result.ok) {
      success("All required environment variables are set.");
    } else {
      logError(`Missing variables: ${result.missing.join(", ")}`);
      process.exitCode = 1;
    }
    return;
  }

  generateEnvFile({ regenerate: opts.regenerate });
}
