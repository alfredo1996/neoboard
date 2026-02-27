import { describe, it, expectTypeOf } from "vitest";
import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { UserRole } from "@/lib/db/schema";

describe("NextAuth type augmentation", () => {
  it("User has role and tenantId fields", () => {
    expectTypeOf<User["role"]>().toEqualTypeOf<UserRole | undefined>();
    expectTypeOf<User["tenantId"]>().toEqualTypeOf<string | undefined>();
  });

  it("Session.user has role and tenantId fields", () => {
    type SessionUser = Session["user"];
    expectTypeOf<SessionUser["role"]>().toEqualTypeOf<UserRole | undefined>();
    expectTypeOf<SessionUser["tenantId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SessionUser["id"]>().toEqualTypeOf<string>();
  });

  it("JWT has id, role and tenantId fields", () => {
    expectTypeOf<JWT["id"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<JWT["role"]>().toEqualTypeOf<UserRole | undefined>();
    expectTypeOf<JWT["tenantId"]>().toEqualTypeOf<string | undefined>();
  });
});
