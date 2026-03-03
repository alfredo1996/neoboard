import type { UserRole } from "@/lib/db/schema";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    canWrite?: boolean;
    tenantId?: string;
  }

  interface Session {
    user: User & {
      id: string;
      role?: UserRole;
      canWrite?: boolean;
      tenantId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    canWrite?: boolean;
    tenantId?: string;
  }
}
