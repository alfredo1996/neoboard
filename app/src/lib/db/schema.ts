import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "@auth/core/adapters";

// ─── Auth.js tables ──────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["admin", "creator", "reader"]);

export const users = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    passwordHash: text("passwordHash"),
    role: userRoleEnum("role").default("creator").notNull(),
    canWrite: boolean("can_write").notNull().default(true),
    forcePasswordChange: boolean("force_password_change")
      .notNull()
      .default(false),
    passwordChangedAt: timestamp("passwordChangedAt", { mode: "date" }),
    disabledAt: timestamp("disabledAt", { mode: "date" }),
    lastLoginAt: timestamp("lastLoginAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    tenantId: text("tenant_id").notNull().default("default"),
  },
  (table) => [
    unique("user_email_tenant_unique").on(table.email, table.tenantId),
  ],
);

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    },
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [
    {
      compositePk: primaryKey({
        columns: [vt.identifier, vt.token],
      }),
    },
  ],
);

// ─── Application tables ──────────────────────────────────────────────

export const connectionTypeEnum = pgEnum("connection_type", [
  "neo4j",
  "postgresql",
]);

export const connectionVisibilityEnum = pgEnum("connection_visibility", [
  "private",
  "shared",
]);

export const connections = pgTable("connection", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("default"),
  name: text("name").notNull(),
  type: connectionTypeEnum("type").notNull(),
  configEncrypted: text("configEncrypted").notNull(),
  /** When true, widget editors can override the connection's default database per-card. */
  allowPerCardDb: boolean("allow_per_card_db").notNull().default(true),
  /**
   * Connection sharing model (#901): "private" = owner + admins only;
   * "shared" = every user in the tenant may query it and build dashboards
   * on it. Credentials are never exposed either way; editing stays
   * owner/admin-only.
   */
  visibility: connectionVisibilityEnum("visibility")
    .notNull()
    .default("private"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
});

export const dashboards = pgTable("dashboard", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("default"),
  name: text("name").notNull(),
  description: text("description"),
  layoutJson: jsonb("layoutJson")
    .$type<DashboardLayoutV2>()
    .default({
      version: 2,
      pages: [{ id: "page-1", title: "Page 1", widgets: [], gridLayout: [] }],
    }),
  /** Per-widget JPEG data-URI thumbnails keyed by widget ID, captured on save. */
  thumbnailJson: jsonb("thumbnailJson").$type<Record<string, string>>(),
  /** Optimistic locking counter — incremented on every PUT. Clients must
   *  send the current version; a mismatch returns 409 Conflict. */
  version: integer("version").notNull().default(1),
  isPublic: boolean("isPublic").default(false),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const shareRoleEnum = pgEnum("share_role", ["viewer", "editor"]);

export const dashboardShares = pgTable("dashboard_share", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dashboardId: text("dashboardId")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("default"),
  role: shareRoleEnum("role").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
});

export const widgetTemplates = pgTable("widget_template", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags").array().default([]),
  chartType: text("chartType").notNull(),
  connectorType: text("connectorType").notNull(),
  /** Optional binding to a specific connection. Nullable — templates work without it. */
  connectionId: text("connectionId"),
  query: text("query").notNull().default(""),
  params: jsonb("params").$type<Record<string, unknown>>(),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  /** Base64 data-URI PNG preview of the chart, captured on save */
  previewImageUrl: text("previewImageUrl"),
  createdBy: text("createdBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("default"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
});

export type WidgetTemplate = typeof widgetTemplates.$inferSelect;
export type NewWidgetTemplate = typeof widgetTemplates.$inferInsert;

export const apiKeys = pgTable("api_key", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("default"),
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

// ─── Types ───────────────────────────────────────────────────────────

export type UserRole = "admin" | "creator" | "reader";

/** V2 layout — the canonical format stored and used at runtime. */
export interface DashboardPage {
  id: string;
  title: string;
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
}

export interface DashboardSettings {
  autoRefresh?: boolean;
  refreshIntervalSeconds?: number;
}

export interface DashboardLayoutV2 {
  version: 2;
  pages: DashboardPage[];
  settings?: DashboardSettings;
}

/**
 * Legacy v1 layout (flat widgets/gridLayout). Only used for migration;
 * never written back to the DB in this form.
 */
export interface DashboardLayoutV1 {
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
}

/** Union accepted on load; always normalised to V2 before use. */
export type DashboardLayout = DashboardLayoutV2 | DashboardLayoutV1;

export interface DashboardWidget {
  id: string;
  chartType: string;
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  /** Per-card database override. When set, queries run against this database
   *  instead of the connection's default. Only effective when the connection
   *  has allowPerCardDb=true. */
  database?: string;
  /** When true, this widget is allowed to execute write queries.
   *  Server enforces: write only if BOTH user.canWrite AND widget.allowWrites. */
  allowWrites?: boolean;
  /** ID of the Widget Lab template this widget was created from. */
  templateId?: string;
  /** ISO timestamp of the template snapshot at apply-time (= template.updatedAt). */
  templateSyncedAt?: string;
}

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClickActionRule {
  id: string;
  /** For tables: which column triggers this rule. */
  triggerColumn?: string;
  type: "set-parameter" | "navigate-to-page" | "set-parameter-and-navigate";
  parameterMapping?: {
    parameterName: string;
    sourceField: string;
  };
  targetPageId?: string;
}

// StylingRule, StylingConfig, StylingOperator — single source of truth in component package.
// Re-exported here so app/ code can import from "@/lib/db/schema" without breaking existing imports.
// Use direct chart path to avoid pulling in the full component barrel (breaks Vitest resolution).
export type {
  StylingRule,
  StylingConfig,
  StylingOperator,
} from "@neoboard/components/charts";

export interface ClickAction {
  type: "set-parameter" | "navigate-to-page" | "set-parameter-and-navigate";
  parameterMapping?: {
    parameterName: string;
    sourceField: string;
  };
  targetPageId?: string;
  /** Restrict which table columns are clickable. Empty/undefined = all columns. */
  clickableColumns?: string[];
  /** Multi-rule support. When present, each rule is evaluated independently. */
  rules?: ClickActionRule[];
}

// ─── Enterprise tables ──────────────────────────────────────────────

export const ssoProtocolEnum = pgEnum("sso_protocol", ["oidc"]);

/**
 * Claim-mapping configuration for an SSO provider.
 * Maps an IdP claim (e.g. "groups") to NeoBoard roles based on claim values.
 */
export interface SsoClaimMapping {
  /** The IdP claim key to inspect (e.g. "groups", "roles", "realm_access.roles"). */
  claimKey: string;
  /** Claim value that maps to the admin role. */
  adminValue?: string;
  /** Claim value that maps to the creator role. */
  creatorValue?: string;
  /** Claim value that maps to the reader role. */
  readerValue?: string;
}

export const ssoProviders = pgTable(
  "sso_provider",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().default("default"),
    name: text("name").notNull(),
    protocol: ssoProtocolEnum("protocol").notNull().default("oidc"),
    issuer: text("issuer").notNull(),
    clientId: text("client_id").notNull(),
    /** Encrypted with AES-256-GCM (same scheme as connection credentials). */
    clientSecretEncrypted: text("client_secret_encrypted").notNull(),
    scopes: text("scopes").notNull().default("openid profile email"),
    claimMappings: jsonb("claim_mappings").$type<SsoClaimMapping>(),
    autoProvision: boolean("auto_provision").notNull().default(true),
    defaultRole: userRoleEnum("default_role").notNull().default("creator"),
    enforceSso: boolean("enforce_sso").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => [
    unique("sso_provider_tenant_issuer_unique").on(
      table.tenantId,
      table.issuer,
    ),
  ],
);

// ─── Audit log ──────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().default("default"),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// ─── Inferred types ──────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
export type DashboardShare = typeof dashboardShares.$inferSelect;
export type NewDashboardShare = typeof dashboardShares.$inferInsert;
export type SsoProvider = typeof ssoProviders.$inferSelect;
export type NewSsoProvider = typeof ssoProviders.$inferInsert;
