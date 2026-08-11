import { AuthenticationModule } from "../src/generalized/AuthenticationModule";

/**
 * `_validateUri` is `protected`, and it runs in the constructor of every
 * connector's auth module — so a change here reaches Postgres, Neo4j and any
 * external connector at once. This subclass is the smallest way to call it
 * directly without booting a database.
 */
class TestAuth extends AuthenticationModule {
  validate(uri: string, protocols: string[] = []): void {
    this._validateUri(uri, protocols);
  }

  // The three abstract members exist only to satisfy the contract; nothing here
  // touches a driver. ts-jest runs with `diagnostics: false`, so omitting them
  // ran fine — but the root tsconfig has no `include`, so any compiler pointed
  // at this directory would reject the class.
  createDriver(): unknown {
    throw new Error("not used in these tests");
  }

  async verifyAuthentication(): Promise<boolean> {
    throw new Error("not used in these tests");
  }

  async updateAuthConfig(): Promise<void> {
    throw new Error("not used in these tests");
  }
}

function messageFor(uri: string, protocols: string[] = []): string {
  try {
    new TestAuth().validate(uri, protocols);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

describe("_validateUri", () => {
  it("accepts a well-formed URI", () => {
    expect(messageFor("postgresql://db:5432/app", ["postgresql:"])).toBe("");
    expect(messageFor("bolt://graph:7687", ["bolt:"])).toBe("");
  });

  it("rejects a URI with no hostname", () => {
    expect(messageFor("bolt://")).toMatch(/hostname/i);
  });

  it("rejects a disallowed protocol, naming it", () => {
    const msg = messageFor("redis://host:6379", ["bolt:"]);
    expect(msg).toMatch(/protocol/i);
    expect(msg).toContain("redis:");
  });

  it("rejects an out-of-range port", () => {
    expect(messageFor("bolt://host:99999")).toMatch(/port/i);
  });

  /**
   * #1303 — the parse-failure branch used to interpolate the whole URI, which
   * meant a password embedded in it rode the thrown message outward. A
   * downstream redactor masks it today, but that made one call site the only
   * thing between a credential and a response body.
   */
  describe("a malformed URI never echoes its input (#1303)", () => {
    const CASES = [
      {
        uri: "postgresql://admin:s3cr3t@db.internal:abc/app",
        secret: "s3cr3t",
      },
      { uri: "bolt://neo4j:hunter2@graph.corp:99999", secret: "hunter2" },
    ];

    it.each(CASES)("does not leak $secret", ({ uri, secret }) => {
      const msg = messageFor(uri);
      expect(msg).not.toBe("");
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain(uri);
    });

    it("reports the expected shape instead", () => {
      expect(messageFor("::::not-a-uri::::")).toMatch(
        /expected scheme:\/\/host/,
      );
    });
  });
});
