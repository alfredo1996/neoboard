import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { paths, readProjectConfig, getMode } from "../lib/config.js";
import {
  info,
  success,
  error as logError,
  warn,
  banner,
} from "../lib/output.js";

const REQUIRED_VARS = [
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
];

/** All known env vars grouped by category for display. */
const ALL_KNOWN_VARS: Record<string, string[]> = {
  Required: [
    "DATABASE_URL",
    "ENCRYPTION_KEY",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
  ],
  Auth: [
    "TENANT_ID",
    "SESSION_MAX_AGE",
    "REGISTRATION_ENABLED",
    "ADMIN_BOOTSTRAP_TOKEN",
    "BOOTSTRAP_ADMIN_EMAIL",
    "BOOTSTRAP_ADMIN_PASSWORD",
    "API_KEY_HMAC_SECRET",
  ],
  Security: ["FORCE_HTTPS", "CORS_ALLOWED_ORIGINS"],
  Enterprise: ["NEOBOARD_EDITION"],
  "SSO (OIDC)": [
    "OIDC_ISSUER",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "OIDC_DISPLAY_NAME",
    "OIDC_SCOPES",
    "OIDC_AUTO_PROVISION",
    "OIDC_DEFAULT_ROLE",
    "OIDC_ENFORCE_SSO",
  ],
  "SSO Claim Mapping": [
    "OIDC_CLAIM_KEY",
    "OIDC_ADMIN_VALUE",
    "OIDC_CREATOR_VALUE",
    "OIDC_READER_VALUE",
  ],
};

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

export function validateEnv(): { ok: boolean; missing: string[] } {
  if (!existsSync(paths.envFile)) {
    return { ok: false, missing: ["(file does not exist)"] };
  }
  const content = readFileSync(paths.envFile, "utf-8");
  const vars = parseEnvFile(content);
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

  const lines = [
    `DATABASE_URL=${dbUrl}`,
    `ENCRYPTION_KEY=${encryptionKey}`,
    `NEXTAUTH_SECRET=${nextauthSecret}`,
    `NEXTAUTH_URL=http://localhost:${config.ports.app}`,
    `ADMIN_BOOTSTRAP_TOKEN=${bootstrapToken}`,
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

/**
 * List all known env vars with their set/unset status.
 * Sensitive values are masked — only shows whether they're set.
 */
export function listEnvVars(): void {
  const vars = existsSync(paths.envFile)
    ? parseEnvFile(readFileSync(paths.envFile, "utf-8"))
    : {};

  for (const [category, keys] of Object.entries(ALL_KNOWN_VARS)) {
    info(`\n  ${category}:`);
    for (const key of keys) {
      const isSet = key in vars && vars[key] !== "";
      const status = isSet ? "✓ set" : "· unset";
      info(`    ${key.padEnd(30)} ${status}`);
    }
  }
}

/**
 * Get a single env var value from .env.local.
 * Returns the value or null if not set.
 */
export function getEnvVar(key: string): string | null {
  if (!existsSync(paths.envFile)) return null;
  const vars = parseEnvFile(readFileSync(paths.envFile, "utf-8"));
  return vars[key] ?? null;
}

/**
 * Set a single env var in .env.local.
 * Creates the file if it doesn't exist. Updates existing key or appends.
 */
export function setEnvVar(key: string, value: string): void {
  let content = existsSync(paths.envFile)
    ? readFileSync(paths.envFile, "utf-8")
    : "";

  const lines = content.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const lineKey = trimmed.slice(0, eqIdx).trim();
    if (lineKey === key) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    // Append with a newline if content doesn't end with one
    if (content.length > 0 && !content.endsWith("\n")) {
      lines.push("");
    }
    lines.push(`${key}=${value}`);
  }

  writeFileSync(paths.envFile, lines.join("\n"));
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

export async function runEnvList(): Promise<void> {
  listEnvVars();
}

export async function runEnvGet(key: string): Promise<void> {
  const value = getEnvVar(key);
  if (value === null) {
    warn(`${key} is not set in app/.env.local`);
  } else {
    info(`${key}=${value}`);
  }
}

export async function runEnvSet(key: string, value: string): Promise<void> {
  setEnvVar(key, value);
  success(`Set ${key} in app/.env.local`);
}
