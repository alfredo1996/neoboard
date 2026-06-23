import { describe, it, expect } from "vitest";
import { missingRequiredConnectionFields } from "../connection-form-validation";

const FULL = {
  name: "DB",
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "pw",
};

describe("missingRequiredConnectionFields (#1043)", () => {
  it("returns no missing fields when all are filled", () => {
    expect(missingRequiredConnectionFields(FULL)).toEqual([]);
  });

  it("lists every missing required field at once", () => {
    expect(
      missingRequiredConnectionFields({
        name: "",
        uri: "",
        username: "",
        password: "",
      }),
    ).toEqual(["Name", "URI", "Username", "Password"]);
  });

  it("treats whitespace-only values as missing", () => {
    expect(missingRequiredConnectionFields({ ...FULL, name: "   " })).toEqual([
      "Name",
    ]);
  });
});
