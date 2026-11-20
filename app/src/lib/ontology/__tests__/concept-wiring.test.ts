import { describe, it, expect } from "vitest";
import { conceptsForField, parameterCompletions } from "../concept-wiring";
import type { Concept } from "@/hooks/use-concepts";

const side = (
  connectionId: string,
  entityKey: string,
  keyPropertyKey: string,
) => ({ connectionId, entityKey, keyPropertyKey });

const CUSTOMER: Concept = {
  id: "c1",
  name: "Customer",
  parameter: "customer",
  description: "",
  sides: [
    side("pg", "customers", "email"),
    side("pg", "orders", "customer_email"),
    side("neo", "Person", "email"),
  ],
};
const PRODUCT: Concept = {
  id: "c2",
  name: "Product",
  parameter: "product",
  description: "",
  sides: [side("pg", "products", "sku")],
};
const ALL = [CUSTOMER, PRODUCT];

describe("conceptsForField (#2485)", () => {
  it.each([
    ["the key on the connection", "pg", "email", ["Customer"]],
    [
      "a second side on the same connection",
      "pg",
      "customer_email",
      ["Customer"],
    ],
    ["another concept's key", "pg", "sku", ["Product"]],
    ["a field that is no key", "pg", "total", []],
    ["a connection with no side", "other", "email", []],
    ["a key of another connection", "neo", "sku", []],
  ])("%s", (_, connectionId, field, want) => {
    expect(
      conceptsForField(ALL, connectionId, field).map((c) => c.name),
    ).toEqual(want);
  });

  it("ignores a side the connection no longer reports", () => {
    const gone: Concept = {
      ...CUSTOMER,
      sides: [{ ...side("pg", "customers", "email"), missing: "keyProperty" }],
    };
    expect(conceptsForField([gone], "pg", "email")).toEqual([]);
  });
});

describe("parameterCompletions (#2485)", () => {
  it("suggests the parameter with its hint on a mapped connection, listing every side there", () => {
    expect(parameterCompletions(ALL, "pg")).toEqual([
      {
        label: "$param_customer",
        detail: "Customer: filters by customers.email, orders.customer_email",
      },
      { label: "$param_product", detail: "Product: filters by products.sku" },
    ]);
  });

  it("suggests nothing on a connection no concept maps", () => {
    expect(parameterCompletions(ALL, "other")).toEqual([]);
    expect(parameterCompletions(ALL, "")).toEqual([]);
  });
});
