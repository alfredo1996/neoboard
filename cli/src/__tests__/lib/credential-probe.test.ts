import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";

vi.mock("../../lib/exec.js", () => ({
  runOrNull: vi.fn(),
  runFileOrNull: vi.fn(),
  dockerExec: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  })),
  getMode: vi.fn(() => "docker"),
}));

import { runOrNull, runFileOrNull, dockerExec } from "../../lib/exec.js";
import { getMode, readProjectConfig } from "../../lib/config.js";
import { probeCredentialDecryption } from "../../lib/credential-probe.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

/**
 * Encrypt exactly as app/src/lib/crypto/crypto.ts does — AES-256-GCM over
 * `iv:authTag:ciphertext` (base64), key used directly. Real ciphertext, not a
 * fixture: a hand-written string would test the parser and never the crypto,
 * and the crypto is the whole point of this probe.
 */
function encryptWith(keyHex: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(":");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMode).mockReturnValue("docker");
});

describe("probeCredentialDecryption (#1274)", () => {
  it("reports ok for a credential encrypted with the same key", async () => {
    vi.mocked(dockerExec).mockReturnValue(
      encryptWith(KEY_A, '{"uri":"postgresql://host/db"}'),
    );
    expect(await probeCredentialDecryption(KEY_A)).toEqual({ outcome: "ok" });
  });

  it("reports mismatch for a credential encrypted with a different key", async () => {
    // The actual regression: a well-formed key that is not the right key. GCM's
    // auth tag is what makes this conclusive rather than heuristic.
    vi.mocked(dockerExec).mockReturnValue(
      encryptWith(KEY_A, '{"uri":"postgresql://host/db"}'),
    );
    expect(await probeCredentialDecryption(KEY_B)).toEqual({
      outcome: "mismatch",
    });
  });

  it("reports mismatch when the ciphertext has been tampered with", async () => {
    const good = encryptWith(KEY_A, "secret");
    const [iv, tag, data] = good.split(":");
    // Flip a byte of the payload; the auth tag must reject it.
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    vi.mocked(dockerExec).mockReturnValue(
      [iv, tag, flipped.toString("base64")].join(":"),
    );
    expect(await probeCredentialDecryption(KEY_A)).toEqual({
      outcome: "mismatch",
    });
  });

  it("reports no-credentials for an empty result, not ok", async () => {
    // "ok" would assert a verification that never ran.
    vi.mocked(dockerExec).mockReturnValue("");
    expect(await probeCredentialDecryption(KEY_A)).toEqual({
      outcome: "no-credentials",
    });
  });

  it("reports unavailable when the query throws", async () => {
    vi.mocked(dockerExec).mockImplementation(() => {
      throw new Error("container not running");
    });
    expect(await probeCredentialDecryption(KEY_A)).toEqual({
      outcome: "unavailable",
    });
  });

  it.each([
    ["undefined", undefined],
    ["too short", "abc"],
  ])("reports unavailable for a %s key rather than mismatch", async (_l, k) => {
    // A missing or malformed key is already reported by `neoboard env
    // --validate` and by env-config at boot. Calling it a mismatch would send
    // the operator to hunt the wrong problem.
    expect(await probeCredentialDecryption(k)).toEqual({
      outcome: "unavailable",
    });
    expect(dockerExec).not.toHaveBeenCalled();
  });

  it("never returns the plaintext or the ciphertext it read", async () => {
    const secret = '{"password":"hunter2"}';
    vi.mocked(dockerExec).mockReturnValue(encryptWith(KEY_A, secret));
    const result = await probeCredentialDecryption(KEY_A);
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(Object.keys(result)).toEqual(["outcome"]);
  });

  it("queries through psql on the host in local mode", async () => {
    vi.mocked(getMode).mockReturnValue("local");
    vi.mocked(runFileOrNull).mockReturnValue(encryptWith(KEY_A, "x"));
    expect(await probeCredentialDecryption(KEY_A)).toEqual({ outcome: "ok" });
    expect(dockerExec).not.toHaveBeenCalled();
    expect(vi.mocked(runFileOrNull).mock.calls[0][1]).toContain("5432");
  });

  it("passes the SQL as ONE argv entry, with the identifier still quoted", async () => {
    // The bug this replaces: the query went through a shell as
    //   psql ... -tAc "SELECT \"configEncrypted\" FROM connection LIMIT 1"
    // The inner quotes terminated the outer ones, so the shell delivered
    //   psql -tAc SELECT configEncrypted FROM connection LIMIT 1
    // — the SQL split across four argv slots AND the identifier unquoted, so
    // Postgres folded it to `configencrypted`, the column did not exist, the
    // query failed, and runOrNull's null read as "no-credentials". `neoboard
    // doctor` therefore reported "no stored credentials yet" on every local
    // -mode install, silently disabling the whole #1274 check.
    //
    // Asserting the ARGV is the point. The previous tests mocked the exec
    // helper and asserted only the outcome mapping, so they were green while
    // the command was malformed.
    vi.mocked(getMode).mockReturnValue("local");
    vi.mocked(runFileOrNull).mockReturnValue("");
    // await, not void: the query happens in the synchronous prefix of an
    // async function today, so this passes either way — but an await added
    // ahead of it later would make the assertions race the call.
    await probeCredentialDecryption(KEY_A);

    const [file, args] = vi.mocked(runFileOrNull).mock.calls[0];
    expect(file).toBe("psql");
    const sql = args[args.indexOf("-tAc") + 1];
    expect(sql).toContain('"configEncrypted"');
    expect(sql).toContain("FROM connection");
    // One argv entry, not four.
    expect(args.filter((a) => a.includes("FROM connection"))).toHaveLength(1);
  });

  it("refuses a postgres identifier that would reach the shell", async () => {
    // `config set` does not validate string values, and this builds a psql
    // command. Mirrors the guard in lib/docker.ts at the same boundary.
    vi.mocked(readProjectConfig).mockReturnValue({
      ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
      postgres: {
        user: "x; rm -rf ~",
        password: "p",
        database: "neoboard",
      },
    } as ReturnType<typeof readProjectConfig>);
    expect(await probeCredentialDecryption(KEY_A)).toEqual({
      outcome: "no-credentials",
    });
    expect(dockerExec).not.toHaveBeenCalled();
    expect(runOrNull).not.toHaveBeenCalled();
  });
});
