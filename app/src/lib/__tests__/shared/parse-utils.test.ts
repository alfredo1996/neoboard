import { describe, it, expect } from "vitest";
import {
  parseOptionalInt,
  mapConfigToEditForm,
} from "@/lib/shared/parse-utils";

describe("parseOptionalInt", () => {
  it("returns undefined for empty string", () => {
    expect(parseOptionalInt("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(parseOptionalInt("   ")).toBeUndefined();
  });

  it("parses valid positive integer", () => {
    expect(parseOptionalInt("42")).toBe(42);
  });

  it("parses zero", () => {
    expect(parseOptionalInt("0")).toBe(0);
  });

  it("parses negative integer", () => {
    expect(parseOptionalInt("-5")).toBe(-5);
  });

  it("returns undefined for floating point number", () => {
    expect(parseOptionalInt("3.14")).toBeUndefined();
  });

  it("returns undefined for non-numeric string", () => {
    expect(parseOptionalInt("abc")).toBeUndefined();
  });

  it("returns undefined for Infinity", () => {
    expect(parseOptionalInt("Infinity")).toBeUndefined();
  });

  it("returns undefined for NaN string", () => {
    expect(parseOptionalInt("NaN")).toBeUndefined();
  });

  it("parses string with leading/trailing whitespace", () => {
    expect(parseOptionalInt("  100  ")).toBe(100);
  });

  it("parses large integers", () => {
    expect(parseOptionalInt("300000")).toBe(300000);
  });
});

describe("mapConfigToEditForm", () => {
  it("maps a full config to form strings", () => {
    const result = mapConfigToEditForm({
      uri: "bolt://localhost:7687",
      username: "neo4j",
      database: "neo4j",
      connectionTimeout: 5000,
      queryTimeout: 30000,
      maxPoolSize: 25,
      connectionAcquisitionTimeout: 10000,
      idleTimeout: 15000,
      statementTimeout: 60000,
      sslRejectUnauthorized: false,
    });

    expect(result).toEqual({
      uri: "bolt://localhost:7687",
      username: "neo4j",
      database: "neo4j",
      connectionTimeout: "5000",
      queryTimeout: "30000",
      maxPoolSize: "25",
      connectionAcquisitionTimeout: "10000",
      idleTimeout: "15000",
      statementTimeout: "60000",
      sslRejectUnauthorized: false,
    });
  });

  it("defaults missing fields to empty strings", () => {
    const result = mapConfigToEditForm({});

    expect(result).toEqual({
      uri: "",
      username: "",
      database: "",
      connectionTimeout: "",
      queryTimeout: "",
      maxPoolSize: "",
      connectionAcquisitionTimeout: "",
      idleTimeout: "",
      statementTimeout: "",
      sslRejectUnauthorized: undefined,
    });
  });

  it("handles partial config (only uri and username)", () => {
    const result = mapConfigToEditForm({
      uri: "postgresql://localhost:5432",
      username: "pg",
    });

    expect(result.uri).toBe("postgresql://localhost:5432");
    expect(result.username).toBe("pg");
    expect(result.database).toBe("");
    expect(result.connectionTimeout).toBe("");
    expect(result.sslRejectUnauthorized).toBeUndefined();
  });

  it("stringifies numeric zero correctly", () => {
    const result = mapConfigToEditForm({
      connectionTimeout: 0,
    });

    expect(result.connectionTimeout).toBe("0");
  });
});
