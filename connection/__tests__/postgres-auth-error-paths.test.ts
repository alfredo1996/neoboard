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
const mockConnect = jest.fn();
let poolShouldThrow: Error | null = null;

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => {
    if (poolShouldThrow) throw poolShouldThrow;
    return {
      on: mockOn,
      end: mockEnd,
      connect: mockConnect,
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

  // #1266: pg-pool's end() resolves while its idle clients are still closing,
  // and it leaves its idle listener on them — so a 57P01 the server sends
  // during that window (container.stop(), a failover) is re-emitted on the
  // POOL. Stripping the pool's 'error' listeners first turned that into an
  // unhandled 'error' event that failed the whole suite.
  describe("pool error listener (#1266)", () => {
    function poolErrorHandler(): (err: Error & { code?: string }) => void {
      new PostgresAuthenticationModule(CONFIG);
      const call = mockOn.mock.calls.findLast(([event]) => event === "error");
      return call![1];
    }

    it("close() leaves the pool's error listener attached", async () => {
      const auth = new PostgresAuthenticationModule(CONFIG);
      mockRemoveAllListeners.mockClear();

      await auth.close();

      expect(mockRemoveAllListeners).not.toHaveBeenCalled();
    });

    it("stays silent for the admin-shutdown SQLSTATE 57P01", () => {
      poolErrorHandler()(
        Object.assign(
          new Error("terminating connection due to administrator command"),
          { code: "57P01" },
        ),
      );

      expect(logged()).toBe("");
    });

    // Narrowed to the SQLSTATE, not the message: a crash of another backend
    // also says "terminating connection" and is worth a log line.
    it("still logs any other code, even one whose message says 'terminating connection'", () => {
      poolErrorHandler()(
        Object.assign(
          new Error(
            "terminating connection because of crash of another server process",
          ),
          { code: "57P02" },
        ),
      );

      expect(logged()).toContain("57P02");
    });
  });

  // #1302: the auth probe runs on a pooled client like every introspection
  // query — bounded, guarded, and destroyed rather than returned if it fails.
  describe("verifyAuthentication is bounded (#1302)", () => {
    it("runs SELECT 1 with a client-side query_timeout and a guarded client", async () => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      };
      mockConnect.mockResolvedValue(client);
      const auth = new PostgresAuthenticationModule(CONFIG);

      await expect(auth.verifyAuthentication()).resolves.toBe(true);

      expect(client.query).toHaveBeenCalledWith({
        text: "SELECT 1",
        query_timeout: 30_000,
      });
      expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(client.removeListener).toHaveBeenCalledWith(
        "error",
        client.on.mock.calls[0][1],
      );
      expect(client.release).toHaveBeenCalledWith(undefined);
    });
  });
});
