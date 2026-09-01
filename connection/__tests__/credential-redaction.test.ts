/**
 * #1303 — credentials must not ride out of the connection layer inside error
 * messages, and the redaction primitives must actually redact.
 *
 * No container needed: both auth modules validate the URI in their constructor,
 * so the throw happens before anything touches a database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AuthType } from "@neoboard/connector-sdk";
import { PostgresAuthenticationModule } from "../src/postgresql/PostgresAuthenticationModule";
import { Neo4jAuthenticationModule } from "../src/neo4j/Neo4jAuthenticationModule";

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") && !full.endsWith(".d.ts") ? [full] : [];
  });
}

// Source with line comments and block comments removed, so prose about a
// banned idiom does not count as a use of it.
//
// A line comment, not a block one: naming the block-comment delimiters
// inside a block comment previously needed a zero-width space wedged
// between the asterisk and the slash to stop it closing early, which
// no-irregular-whitespace flags and no reader can see (#1547).
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("credential redaction (#1303)", () => {
  describe("a malformed URI never echoes its password", () => {
    const PG_URI = "postgresql://admin:s3cr3t@db.internal:abc/app";
    const NEO_URI = "bolt://neo4j:hunter2@graph.corp:99999";

    it("PostgresAuthenticationModule throws without leaking", () => {
      expect(() => {
        new PostgresAuthenticationModule({
          username: "u",
          password: "p",
          authType: AuthType.NATIVE,
          uri: PG_URI,
        });
      }).toThrow();

      let message = "";
      try {
        new PostgresAuthenticationModule({
          username: "u",
          password: "p",
          authType: AuthType.NATIVE,
          uri: PG_URI,
        });
      } catch (e) {
        message = (e as Error).message;
      }

      expect(message).not.toContain("s3cr3t");
      expect(message).not.toContain(PG_URI);
    });

    it("Neo4jAuthenticationModule throws without leaking", () => {
      let message = "";
      try {
        new Neo4jAuthenticationModule({
          username: "u",
          password: "p",
          authType: AuthType.NATIVE,
          uri: NEO_URI,
        });
      } catch (e) {
        message = (e as Error).message;
      }

      expect(message).not.toBe("");
      expect(message).not.toContain("hunter2");
      expect(message).not.toContain(NEO_URI);
    });
  });

  /**
   * `message.split(":")[0]` reads as redaction and is not: a message with no
   * colon comes back whole ("Invalid URL" -> "Invalid URL"). It was fixed once
   * in PostgresConnectionModule and left live in two other places for long
   * enough to be documented as fixed while still leaking (#1303). Use
   * `err.code ?? err.name` instead.
   */
  it('no source file uses split(":") as a redaction primitive', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      codeOnly(readFileSync(f, "utf8")).includes('split(":")'),
    );
    expect(offenders.map((f) => f.replace(SRC, "src"))).toEqual([]);
  });
});
