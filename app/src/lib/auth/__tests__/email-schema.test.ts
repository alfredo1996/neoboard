import { describe, it, expect } from "vitest";
import { emailSchema } from "../email-schema";

describe("emailSchema (#2001)", () => {
  it("trims and lowercases before validating", () => {
    expect(emailSchema.parse("  Alice@X.com ")).toBe("alice@x.com");
  });

  it("rejects a value that is not an email", () => {
    const result = emailSchema.safeParse("nope");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Invalid email address");
  });
});
