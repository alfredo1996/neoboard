import { describe, it, expect } from "vitest";
import {
  connectionConfigSchema,
  createConnectionSchema,
  updateConnectionSchema,
  testInlineSchema,
} from "../schemas";

describe("connectionConfigSchema — advanced fields", () => {
  const baseConfig = {
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "test",
  };

  it("passes validation without advanced fields (backward compatible)", () => {
    const result = connectionConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it("accepts valid connectionTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionTimeout: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid queryTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      queryTimeout: 30000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid maxPoolSize", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      maxPoolSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects maxPoolSize over 100", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      maxPoolSize: 200,
    });
    expect(result.success).toBe(false);
  });

  it("rejects maxPoolSize below 1", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      maxPoolSize: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative connectionTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionTimeout: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero timeout (disables protection)", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionTimeout: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeout below 1000ms minimum", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      queryTimeout: 999,
    });
    expect(result.success).toBe(false);
  });

  it("accepts timeout at 1000ms boundary", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionTimeout: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects timeout exceeding 300000ms (5 min) cap", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      statementTimeout: 300_001,
    });
    expect(result.success).toBe(false);
  });

  it("accepts timeout at 300000ms boundary", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      idleTimeout: 300_000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts connectionAcquisitionTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionAcquisitionTimeout: 60000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts idleTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      idleTimeout: 15000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts statementTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      statementTimeout: 60000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts sslRejectUnauthorized boolean", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      sslRejectUnauthorized: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer connectionTimeout", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionTimeout: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts all advanced fields together", () => {
    const result = connectionConfigSchema.safeParse({
      ...baseConfig,
      connectionTimeout: 5000,
      queryTimeout: 3000,
      maxPoolSize: 25,
      connectionAcquisitionTimeout: 10000,
      idleTimeout: 15000,
      statementTimeout: 60000,
      sslRejectUnauthorized: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("createConnectionSchema", () => {
  it("accepts valid neo4j connection", () => {
    const result = createConnectionSchema.safeParse({
      name: "My Neo4j",
      type: "neo4j",
      config: { uri: "bolt://localhost:7687", username: "neo4j", password: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid postgresql connection", () => {
    const result = createConnectionSchema.safeParse({
      name: "My PG",
      type: "postgresql",
      config: { uri: "postgresql://localhost:5432", username: "pg", password: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = createConnectionSchema.safeParse({
      type: "neo4j",
      config: { uri: "bolt://localhost", username: "neo4j", password: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = createConnectionSchema.safeParse({
      name: "My DB",
      type: "mysql",
      config: { uri: "localhost", username: "root", password: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts connection with advanced settings", () => {
    const result = createConnectionSchema.safeParse({
      name: "Advanced Neo4j",
      type: "neo4j",
      config: {
        uri: "bolt://localhost:7687",
        username: "neo4j",
        password: "test",
        maxPoolSize: 50,
        connectionTimeout: 5000,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("updateConnectionSchema", () => {
  it("accepts name-only update", () => {
    const result = updateConnectionSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts config-only update", () => {
    const result = updateConnectionSchema.safeParse({
      config: { uri: "bolt://localhost", username: "neo4j", password: "new" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no fields required)", () => {
    const result = updateConnectionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = updateConnectionSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("testInlineSchema", () => {
  it("accepts valid test request", () => {
    const result = testInlineSchema.safeParse({
      type: "neo4j",
      config: { uri: "bolt://localhost:7687", username: "neo4j", password: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing config", () => {
    const result = testInlineSchema.safeParse({ type: "neo4j" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = testInlineSchema.safeParse({
      type: "redis",
      config: { uri: "redis://localhost", username: "r", password: "p" },
    });
    expect(result.success).toBe(false);
  });
});
