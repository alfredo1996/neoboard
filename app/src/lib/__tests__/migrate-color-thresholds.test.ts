import { describe, it, expect } from "vitest";
import { migrateColorThresholds } from "../migrate-color-thresholds";

describe("migrateColorThresholds", () => {
  it("returns undefined for empty string", () => {
    expect(migrateColorThresholds("")).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(migrateColorThresholds("not json")).toBeUndefined();
  });

  it("returns undefined for non-array JSON", () => {
    expect(migrateColorThresholds('{"value":1}')).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(migrateColorThresholds("[]")).toBeUndefined();
  });

  it("converts valid thresholds to StylingConfig with <= operator", () => {
    const input = '[{"value":50,"color":"#bbf7d0"},{"value":100,"color":"#fde68a"}]';
    const result = migrateColorThresholds(input);
    expect(result).toBeDefined();
    expect(result!.enabled).toBe(true);
    expect(result!.rules).toHaveLength(2);
    expect(result!.rules[0]).toMatchObject({
      operator: "<=",
      value: 50,
      color: "#bbf7d0",
      target: "color",
    });
    expect(result!.rules[1]).toMatchObject({
      operator: "<=",
      value: 100,
      color: "#fde68a",
      target: "color",
    });
    // Each rule should have an id
    expect(result!.rules[0].id).toBeTruthy();
    expect(result!.rules[1].id).toBeTruthy();
  });

  it("preserves targetColumn when provided", () => {
    const input = '[{"value":50,"color":"#aaa"}]';
    const result = migrateColorThresholds(input, "year");
    expect(result!.targetColumn).toBe("year");
  });

  it("does not set targetColumn when not provided", () => {
    const input = '[{"value":50,"color":"#aaa"}]';
    const result = migrateColorThresholds(input);
    expect(result!.targetColumn).toBeUndefined();
  });

  it("skips invalid entries in array", () => {
    const input = '[{"value":50,"color":"#aaa"},{"bad":"entry"},{"value":100,"color":"#bbb"}]';
    const result = migrateColorThresholds(input);
    expect(result!.rules).toHaveLength(2);
  });

  it("returns undefined when all entries are invalid", () => {
    const input = '[{"bad":"entry"},{"also":"bad"}]';
    expect(migrateColorThresholds(input)).toBeUndefined();
  });
});
