import { describe, it, expect } from "vitest";
import { newPasswordSchema, PASSWORD_HINT } from "../password-schema";

// The hint shown next to the password fields must state the schema's rules (#2256).
describe("PASSWORD_HINT", () => {
  it.each([
    ["too short", "abc123", false],
    ["no number", "abcdefgh", false],
    ["no letter", "12345678", false],
    ["8 characters, a letter and a number", "abcdef12", true],
  ])("%s -> accepted: %s", (_name, password, ok) => {
    expect(newPasswordSchema.safeParse(password).success).toBe(ok);
  });

  it("names each rule the schema enforces", () => {
    expect(PASSWORD_HINT).toMatch(/8 characters/);
    expect(PASSWORD_HINT).toMatch(/letter/);
    expect(PASSWORD_HINT).toMatch(/number/);
  });
});
