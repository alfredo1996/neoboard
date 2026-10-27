import { connectionAddress } from "../src/generalized/connection-address";
import {
  databaseField,
  passwordField,
  uriField,
  usernameField,
} from "../src/generalized/fields";
import type { ConnectorDescriptor } from "../src/generalized/descriptor";

const descriptor = (
  fields: ConnectorDescriptor["fields"],
): ConnectorDescriptor => ({
  type: "mydb",
  label: "MyDB",
  category: "database",
  fields,
});

const withUri = descriptor([
  uriField({ protocols: ["mydb:", "mydb+s:"] }),
  usernameField(),
  passwordField(),
  databaseField(),
]);

describe("connectionAddress", () => {
  it.each([
    ["userinfo", "mydb://reader:hunter2@host:7687", "mydb://host:7687"],
    ["a bare username", "mydb://reader@host:7687", "mydb://host:7687"],
    [
      "a query",
      "mydb://host:7687?token=abc&sslmode=require",
      "mydb://host:7687",
    ],
    ["an IPv6 host", "mydb://[::1]:7687", "mydb://[::1]:7687"],
    ["no port", "mydb+s://db.example.com", "mydb+s://db.example.com"],
  ])("keeps scheme://host:port and drops %s", (_n, uri, expected) => {
    const out = connectionAddress(withUri, {
      uri,
      username: "reader",
      password: "hunter2",
    });
    expect(out).toBe(expected);
    expect(out).not.toMatch(/hunter2|reader|abc|sslmode/);
  });

  it("appends the database field", () => {
    expect(
      connectionAddress(withUri, { uri: "mydb://h:1", database: "sales" }),
    ).toBe("mydb://h:1 / sales");
  });

  it("falls back to the URI path when the database field is empty", () => {
    expect(
      connectionAddress(withUri, { uri: "mydb://h:1/sales?x=1", database: "" }),
    ).toBe("mydb://h:1 / sales");
  });

  it("prefers the database field over the path", () => {
    expect(
      connectionAddress(withUri, { uri: "mydb://h:1/path", database: "field" }),
    ).toBe("mydb://h:1 / field");
  });

  it("is undefined without a uri field", () => {
    expect(
      connectionAddress(descriptor([usernameField()]), { uri: "mydb://h:1" }),
    ).toBeUndefined();
  });

  it("is undefined for a missing or unparsable uri", () => {
    expect(connectionAddress(withUri, {})).toBeUndefined();
    expect(connectionAddress(withUri, { uri: "not a uri" })).toBeUndefined();
  });

  it.each([
    ["a bad percent escape", "mydb://h:1/%E0%A4%A"],
    ["a NUL escape", "mydb://h:1/db%00x"],
  ])("never throws or yields control characters for %s", (_n, uri) => {
    const out = connectionAddress(withUri, { uri });
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u001f]/);
    expect(out).toMatch(/^mydb:\/\/h:1/);
  });

  it.each([
    ["a deep path", "mydb://h:1/a/b/token-SECRET", "mydb://h:1 / a"],
    ["a path-parameter secret", "mydb://h:1/;password=x", "mydb://h:1"],
    ["an encoded slash", "mydb://h:1/db%2Fpassword=hunter2", "mydb://h:1"],
  ])("keeps no secret from the path: %s", (_n, uri, expected) => {
    expect(connectionAddress(withUri, { uri })).toBe(expected);
  });

  it("is undefined when a slash in the password put userinfo in the path", () => {
    expect(
      connectionAddress(withUri, { uri: "mydb://user:12/34@host:5432/db" }),
    ).toBeUndefined();
  });

  it("reads no path when the descriptor has no database field", () => {
    expect(
      connectionAddress(descriptor([uriField({ protocols: ["mydb:"] })]), {
        uri: "mydb://h:1/sales",
      }),
    ).toBe("mydb://h:1");
  });

  it.each([
    ["an encoded slash", "mydb://h:1/movies%2Ftoken-SECRET", {}],
    ["an encoded backslash", "mydb://h:1/movies%5Ctoken", {}],
    ["a 64-character name", `mydb://h:1/${"a".repeat(64)}`, {}],
    ["a field with a space", "mydb://h:1", { database: "my db" }],
    ["a field with a slash", "mydb://h:1", { database: "a/b" }],
  ])("shows no database for %s", (_n, uri, extra) => {
    expect(connectionAddress(withUri, { uri, ...extra })).toBe("mydb://h:1");
  });

  it.each(["movies", "sales_2024", "my-db.v2"])("keeps database %s", (db) => {
    expect(connectionAddress(withUri, { uri: `mydb://h:1/${db}` })).toBe(
      `mydb://h:1 / ${db}`,
    );
  });
});
