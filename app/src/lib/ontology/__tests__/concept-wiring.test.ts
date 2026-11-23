import { describe, it, expect } from "vitest";
import {
  conceptsForField,
  parameterCompletions,
  type WiringTerm,
} from "../concept-wiring";
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
      conceptsForField(ALL, connectionId, field).map((o) => o.concept.name),
    ).toEqual(want);
  });

  it.each([
    ["a qualified column", "p.email", ["Customer"]],
    ["a column of another table", "orders.sku", ["Product"]],
    ["a name that only ends like the key", "xemail", []],
  ])("matches on the last segment: %s", (_, field, want) => {
    expect(
      conceptsForField(ALL, "pg", field).map((o) => o.concept.name),
    ).toEqual(want);
  });

  it("names the entity only when the key's name sits on more than one entity", () => {
    const property = (entity: string, key: string): WiringTerm => ({
      kind: "property",
      key,
      parentKey: `entity:${entity}`,
      displayName: "",
      hidden: false,
      orphaned: false,
    });
    const ids: Concept = {
      ...CUSTOMER,
      sides: [side("pg", "customers", "id")],
    };
    const entity: WiringTerm = {
      ...property("customers", "id"),
      kind: "entity",
      key: "customers",
      parentKey: "",
    };
    const alone = [entity, property("customers", "id")];
    const shared = [...alone, property("orders", "id")];
    expect(
      conceptsForField([ids], "pg", "id", alone)[0].entity,
    ).toBeUndefined();
    expect(conceptsForField([ids], "pg", "id", shared)[0].entity).toBe(
      "customers",
    );
  });

  describe("a side the connection no longer reports (#2552)", () => {
    const t = (kind: string, key: string, parentKey: string): WiringTerm => ({
      kind,
      key,
      parentKey,
      displayName: "",
      hidden: false,
      orphaned: false,
    });
    const TERMS: WiringTerm[] = [
      t("entity", "customers", ""),
      t("property", "email", "entity:customers"),
    ];
    const one = (entityKey: string, key: string): Concept => ({
      ...CUSTOMER,
      sides: [side("pg", entityKey, key)],
    });
    it.each([
      ["entity and key are there", true, "customers", "email", TERMS],
      ["the entity is gone", false, "gone", "email", TERMS],
      ["the key is gone from its entity", false, "customers", "mail", TERMS],
      [
        "the entity is only an orphaned term",
        false,
        "customers",
        "email",
        [
          ...TERMS.map((x) => ({ ...x, orphaned: true })),
          t("entity", "other", ""),
        ],
      ],
      ["the terms are not loaded", true, "gone", "mail", []],
    ])("%s: offered is %s", (_, offered, entity, key, terms) => {
      const c = one(entity, key);
      expect(conceptsForField([c], "pg", key, terms)).toHaveLength(
        offered ? 1 : 0,
      );
      expect(parameterCompletions([c], "pg", terms)).toHaveLength(
        offered ? 1 : 0,
      );
    });
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

  it("names entity and property as the creator did, and leaves hidden ones out", () => {
    const term = (kind: string, key: string, parentKey: string, o = {}) => ({
      kind,
      key,
      parentKey,
      displayName: "",
      hidden: false,
      orphaned: false,
      ...o,
    });
    const terms = [
      term("entity", "customers", "", { displayName: "Clients" }),
      term("property", "email", "entity:customers", { displayName: "Mail" }),
      term("property", "customer_email", "entity:orders", { hidden: true }),
    ];
    expect(parameterCompletions([CUSTOMER], "pg", terms)).toEqual([
      { label: "$param_customer", detail: "Customer: filters by Clients.Mail" },
    ]);
  });

  it("suggests nothing on a connection no concept maps", () => {
    expect(parameterCompletions(ALL, "other")).toEqual([]);
    expect(parameterCompletions(ALL, "")).toEqual([]);
  });
});
