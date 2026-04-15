import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateAll,
  COUNTS,
} from "../ecommerce-data.mjs";

function hash(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

describe("ecommerce-data.mjs — seeded faker", () => {
  it("produces the expected row counts", () => {
    const data = generateAll();
    assert.equal(data.regions.length, COUNTS.regions);
    assert.equal(data.categories.length, COUNTS.categories);
    assert.equal(data.customers.length, COUNTS.customers);
    assert.equal(data.products.length, COUNTS.products);
    assert.equal(data.orders.length, COUNTS.orders);
  });

  it("is deterministic — same seed produces byte-identical output", () => {
    const a = generateAll(570);
    const b = generateAll(570);
    assert.equal(hash(a), hash(b));
  });

  it("different seeds produce different output", () => {
    const a = generateAll(1);
    const b = generateAll(2);
    assert.notEqual(hash(a), hash(b));
  });

  it("every order.customer_id references an existing customer", () => {
    const { customers, orders } = generateAll();
    const ids = new Set(customers.map((c) => c.id));
    for (const o of orders) {
      assert.ok(
        ids.has(o.customer_id),
        `order ${o.id} references missing customer ${o.customer_id}`,
      );
    }
  });

  it("every order_item.product_id references an existing product", () => {
    const { products, orderItems } = generateAll();
    const ids = new Set(products.map((p) => p.id));
    for (const oi of orderItems) {
      assert.ok(
        ids.has(oi.product_id),
        `order_item for order ${oi.order_id} references missing product ${oi.product_id}`,
      );
    }
  });

  it("every order_item.order_id references an existing order", () => {
    const { orders, orderItems } = generateAll();
    const ids = new Set(orders.map((o) => o.id));
    for (const oi of orderItems) {
      assert.ok(
        ids.has(oi.order_id),
        `order_item references missing order ${oi.order_id}`,
      );
    }
  });

  it("every customer.region_id references an existing region", () => {
    const { regions, customers } = generateAll();
    const ids = new Set(regions.map((r) => r.id));
    for (const c of customers) {
      assert.ok(ids.has(c.region_id));
    }
  });

  it("every product.category_id references a LEAF category (no parent=null)", () => {
    const { categories, products } = generateAll();
    const leafIds = new Set(
      categories.filter((c) => c.parent_id !== null).map((c) => c.id),
    );
    for (const p of products) {
      assert.ok(
        leafIds.has(p.category_id),
        `product ${p.id} assigned to non-leaf category ${p.category_id}`,
      );
    }
  });

  it("category hierarchy is consistent — every child parent_id exists", () => {
    const { categories } = generateAll();
    const ids = new Set(categories.map((c) => c.id));
    for (const c of categories) {
      if (c.parent_id !== null) {
        assert.ok(ids.has(c.parent_id));
      }
    }
  });

  it("order total matches sum of its order_items", () => {
    const { orders, orderItems } = generateAll();
    const byOrder = new Map();
    for (const oi of orderItems) {
      const sum = byOrder.get(oi.order_id) ?? 0;
      byOrder.set(oi.order_id, sum + oi.qty * Number(oi.price));
    }
    for (const o of orders) {
      const computed = Math.round((byOrder.get(o.id) ?? 0) * 100) / 100;
      assert.equal(
        Number(o.total),
        computed,
        `order ${o.id} total mismatch`,
      );
    }
  });

  it("order created_at is never before customer signup_date", () => {
    const { customers, orders } = generateAll();
    const byId = new Map(customers.map((c) => [c.id, c]));
    for (const o of orders) {
      const customer = byId.get(o.customer_id);
      const signupMs = new Date(customer.signup_date).getTime();
      const createdMs = new Date(o.created_at).getTime();
      assert.ok(
        createdMs >= signupMs,
        `order ${o.id} created_at ${o.created_at} before signup ${customer.signup_date}`,
      );
    }
  });

  it("order_items unique on (order_id, product_id)", () => {
    const { orderItems } = generateAll();
    const seen = new Set();
    for (const oi of orderItems) {
      const key = `${oi.order_id}:${oi.product_id}`;
      assert.ok(!seen.has(key), `duplicate order_item ${key}`);
      seen.add(key);
    }
  });
});
