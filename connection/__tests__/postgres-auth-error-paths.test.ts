/**
 * #1303 — the two `catch` blocks in PostgresAuthenticationModule are exactly
 * where a credential could reach a log, so they are worth asserting rather than
 * leaving to inspection. They were previously uncovered, which is how
 * `message.split(":")[0]` survived there under a comment promising redaction
 * long after the sibling module had recorded that idiom as broken.
 *
 * `pg` is mocked, so no container is required.
 */
const mockEnd = jest.fn();
const mockOn = jest.fn();
const mockRemoveAllListeners = jest.fn();
let poolShouldThrow: Error | null = null;

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => {
    if (poolShouldThrow) throw poolShouldThrow;
    return {
      on: mockOn,
      end: mockEnd,
      removeAllListeners: mockRemoveAllListeners,
    };
  }),
}));

import { AuthType } from "@neoboard/connector-sdk";
import { PostgresAuthenticationModule } from "../src/postgresql/PostgresAuthenticationModule";

const CONFIG = {
  username: "app_user",
  password: "s3cr3t-password",
  authType: AuthType.NATIVE,
  uri: "postgresql://db.internal:5432/app",
};

describe("PostgresAuthenticationModule error paths (#1303)", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    poolShouldThrow = null;
    mockEnd.mockReset().mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** Everything console.error was called with, flattened to one string. */
  function logged(): string {
    return errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  describe("pool creation fails", () => {
    it("logs the error code, never the message", () => {
      const err = Object.assign(
        new Error("connect ECONNREFUSED s3cr3t-password"),
        {
          code: "ECONNREFUSED",
        },
      );
      poolShouldThrow = err;

      expect(() => new PostgresAuthenticationModule(CONFIG)).toThrow();
      expect(logged()).toContain("ECONNREFUSED");
      expect(logged()).not.toContain("s3cr3t-password");
    });

    // The regression `split(":")[0]` allowed: a message with no colon came back
    // whole. Falling back to `err.name` keeps that impossible.
    it("falls back to the error name when there is no code", () => {
      poolShouldThrow = new TypeError("Invalid URL");

      expect(() => new PostgresAuthenticationModule(CONFIG)).toThrow();
      expect(logged()).toContain("TypeError");
      expect(logged()).not.toContain("Invalid URL");
    });

    // A thrown non-Error has neither `code` nor `name`. Drivers do throw
    // strings, and the point of this expression is that it degrades to a
    // constant rather than stringifying whatever it was handed.
    it("logs 'unknown' when a non-Error is thrown", () => {
      poolShouldThrow =
        "raw string carrying s3cr3t-password" as unknown as Error;

      expect(() => new PostgresAuthenticationModule(CONFIG)).toThrow();
      expect(logged()).toContain("unknown");
      expect(logged()).not.toContain("s3cr3t-password");
    });
  });

  describe("pool close fails", () => {
    it("logs the error code, never the message", async () => {
      const auth = new PostgresAuthenticationModule(CONFIG);
      mockEnd.mockRejectedValueOnce(
        Object.assign(new Error("boom s3cr3t-password"), { code: "57P01" }),
      );

      await auth.close();

      expect(logged()).toContain("57P01");
      expect(logged()).not.toContain("s3cr3t-password");
    });

    it("falls back to the error name when the close error has no code", async () => {
      const auth = new PostgresAuthenticationModule(CONFIG);
      mockEnd.mockRejectedValueOnce(new RangeError("bad s3cr3t-password"));

      await auth.close();

      expect(logged()).toContain("RangeError");
      expect(logged()).not.toContain("s3cr3t-password");
    });

    it("logs 'unknown' when a non-Error is thrown", async () => {
      const auth = new PostgresAuthenticationModule(CONFIG);
      mockEnd.mockRejectedValueOnce("raw string with s3cr3t-password");

      await auth.close();

      expect(logged()).toContain("unknown");
      expect(logged()).not.toContain("s3cr3t-password");
    });

    it("stays silent for shutdown races", async () => {
      const auth = new PostgresAuthenticationModule(CONFIG);
      mockEnd.mockRejectedValueOnce(
        new Error("terminating connection due to administrator command"),
      );

      await auth.close();

      expect(logged()).toBe("");
    });
  });
});
