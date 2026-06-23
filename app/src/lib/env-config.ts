/**
 * Centralized environment variable validation.
 *
 * Defines all known env vars, their required/optional status, and
 * consistency rules (e.g. OIDC vars must all be set together).
 * Called once on startup and by the /api/health endpoint.
 */

interface EnvVar {
  key: string;
  required: boolean;
  /** Validation function — returns an error message or null if valid. */
  validate?: (value: string) => string | null;
}

interface ConfigIssue {
  key: string;
  level: "error" | "warning";
  message: string;
}

export interface EnvConfigResult {
  status: "ok" | "degraded" | "error";
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
  /** Per-var status: "set" or "unset" — never actual values. */
  config: Record<string, "set" | "unset">;
}

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** All known environment variables. */
const ENV_VARS: EnvVar[] = [
  // ── Required ──
  { key: "DATABASE_URL", required: true },
  {
    key: "ENCRYPTION_KEY",
    required: true,
    validate: (v) =>
      HEX_64.test(v)
        ? null
        : "Must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32",
  },
  {
    key: "NEXTAUTH_SECRET",
    required: true,
    validate: (v) =>
      v.length >= 32
        ? null
        : "Must be at least 32 characters. Generate with: openssl rand -hex 32",
  },
  { key: "NEXTAUTH_URL", required: false },
  {
    // Required: API keys are a community feature available to every install
    // (no enterprise gate on /api/keys or /settings/api-keys). Without this
    // secret, the route throws at create time — users discover the problem
    // only when they click "Create API Key". Fail fast at startup instead.
    key: "API_KEY_HMAC_SECRET",
    required: true,
    validate: (v) =>
      HEX_64.test(v) || v.length >= 32
        ? null
        : "Must be a 64-character hex string (32 bytes) or at least 32 chars. Generate with: openssl rand -hex 32",
  },

  // ── Optional: Auth ──
  { key: "TENANT_ID", required: false },
  { key: "SESSION_MAX_AGE", required: false },
  { key: "REGISTRATION_ENABLED", required: false },
  { key: "ADMIN_BOOTSTRAP_TOKEN", required: false },
  { key: "BOOTSTRAP_ADMIN_EMAIL", required: false },
  { key: "BOOTSTRAP_ADMIN_PASSWORD", required: false },

  // ── Optional: Security ──
  { key: "FORCE_HTTPS", required: false },
  { key: "CORS_ALLOWED_ORIGINS", required: false },

  // ── Optional: Enterprise ──
  { key: "NEOBOARD_EDITION", required: false },

  // ── Optional: SSO (OIDC) ──
  { key: "OIDC_ISSUER", required: false },
  { key: "OIDC_CLIENT_ID", required: false },
  { key: "OIDC_CLIENT_SECRET", required: false },
  { key: "OIDC_DISPLAY_NAME", required: false },
  { key: "OIDC_SCOPES", required: false },
  { key: "OIDC_AUTO_PROVISION", required: false },
  { key: "OIDC_DEFAULT_ROLE", required: false },
  { key: "OIDC_ENFORCE_SSO", required: false },
  { key: "OIDC_CLAIM_KEY", required: false },
  { key: "OIDC_ADMIN_VALUE", required: false },
  { key: "OIDC_CREATOR_VALUE", required: false },
  { key: "OIDC_READER_VALUE", required: false },
];

/** OIDC vars that must all be present together. */
const OIDC_REQUIRED_GROUP = [
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
];

/**
 * Validate all environment variables. Returns status, issues, and
 * a config map showing which vars are set (never their values).
 */
export function validateEnvConfig(): EnvConfigResult {
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  const config: Record<string, "set" | "unset"> = {};

  // Check each known var
  for (const { key, required, validate } of ENV_VARS) {
    const value = process.env[key];
    config[key] = value ? "set" : "unset";

    if (required && !value) {
      errors.push({
        key,
        level: "error",
        message: `Required variable ${key} is not set`,
      });
      continue;
    }

    if (value && validate) {
      const err = validate(value);
      if (err) {
        errors.push({ key, level: "error", message: `${key}: ${err}` });
      }
    }
  }

  // OIDC consistency: if any OIDC_* required var is set, all must be
  const oidcSet = OIDC_REQUIRED_GROUP.filter((k) => process.env[k]);
  if (oidcSet.length > 0 && oidcSet.length < OIDC_REQUIRED_GROUP.length) {
    const missing = OIDC_REQUIRED_GROUP.filter((k) => !process.env[k]);
    for (const key of missing) {
      warnings.push({
        key,
        level: "warning",
        message: `${key} is missing but other OIDC vars are set (${oidcSet.join(", ")}). SSO will not work without all three: ${OIDC_REQUIRED_GROUP.join(", ")}`,
      });
    }
  }

  const status =
    errors.length > 0 ? "error" : warnings.length > 0 ? "degraded" : "ok";

  return { status, errors, warnings, config };
}
