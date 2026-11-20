import { describe, it, expect } from "vitest";
import { entityParentKey, slugParameter } from "../term-keys";

describe("slugParameter", () => {
  it.each([
    ["Customer", "customer"],
    ["Sales Region", "sales_region"],
    ["  Order #2 -- line ", "order_2_line"],
    ["Città", "citt"],
    ["", ""],
  ])("turns %j into %j", (name, parameter) => {
    expect(slugParameter(name)).toBe(parameter);
  });
});

describe("entityParentKey", () => {
  it("is the kind and key of the entity, as the connector SDK writes a property's parent", () => {
    expect(entityParentKey("customers")).toBe("entity:customers");
  });
});
