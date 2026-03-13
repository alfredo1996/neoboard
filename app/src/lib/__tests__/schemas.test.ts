import { describe, it, expect } from "vitest";
import { connectionConfigSchema } from "../schemas";

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
