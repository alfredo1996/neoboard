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
});
