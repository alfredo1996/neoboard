import { describe, it, expect } from "vitest";
import type { ConnectorField } from "@neoboard/connection";
import { connectionFieldsOf } from "../connection-fields";

const fields: ConnectorField[] = [
  {
    key: "endpoint",
    label: "Endpoint",
    type: "uri",
    group: "connection",
    required: true,
    placeholder: "acme://host/book",
    protocols: ["acme:"],
  },
  { key: "token", label: "Token", type: "password", group: "connection" },
  {
    key: "region",
    label: "Region",
    type: "select",
    group: "connection",
    description: "Where the book lives.",
    options: [{ label: "EU", value: "eu" }],
  },
  { key: "pageSize", label: "Page Size", type: "number", group: "advanced" },
];

describe("connectionFieldsOf (#1899)", () => {
  it("turns a descriptor's connection fields into the form's fields, in order", () => {
    expect(connectionFieldsOf({ fields })).toEqual([
      {
        name: "endpoint",
        label: "Endpoint",
        // The form has no URI input; a URI is typed as text.
        type: "text",
        required: true,
        placeholder: "acme://host/book",
      },
      { name: "token", label: "Token", type: "password" },
      {
        name: "region",
        label: "Region",
        type: "select",
        description: "Where the book lives.",
        options: [{ label: "EU", value: "eu" }],
      },
    ]);
  });

  it("leaves the advanced group out", () => {
    expect(connectionFieldsOf({ fields }).map((f) => f.name)).not.toContain(
      "pageSize",
    );
  });

  it("is empty for a connector that is not installed or not loaded yet", () => {
    expect(connectionFieldsOf(undefined)).toEqual([]);
  });
});
