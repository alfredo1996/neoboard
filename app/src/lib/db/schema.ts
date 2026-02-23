import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "@auth/core/adapters";

// ─── Auth.js tables ──────────────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
});

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
  ]
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
  ]
);

// ─── Application tables ──────────────────────────────────────────────

export const connectionTypeEnum = pgEnum("connection_type", [
  "neo4j",
  "postgresql",
]);

export const connections = pgTable("connection", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: connectionTypeEnum("type").notNull(),
  configEncrypted: text("configEncrypted").notNull(),
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
  name: text("name").notNull(),
  description: text("description"),
  layoutJson: jsonb("layoutJson").$type<DashboardLayoutV2>().default({
    version: 2,
    pages: [{ id: "page-1", title: "Page 1", widgets: [], gridLayout: [] }],
  }),
  isPublic: boolean("isPublic").default(false),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
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
  role: shareRoleEnum("role").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
});

// ─── Types ───────────────────────────────────────────────────────────

/** V2 layout — the canonical format stored and used at runtime. */
export interface DashboardPage {
  id: string;
  title: string;
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
}

export interface DashboardLayoutV2 {
  version: 2;
  pages: DashboardPage[];
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
}

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClickAction {
  type: "set-parameter";
  parameterMapping: {
    parameterName: string;
    sourceField: string;
  };
}

// ─── Inferred types ──────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
export type DashboardShare = typeof dashboardShares.$inferSelect;
export type NewDashboardShare = typeof dashboardShares.$inferInsert;
