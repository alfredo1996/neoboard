import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getSetting,
  describeSetting,
  applySettingRows,
  onSettingsChange,
  validateChanges,
} from "../core";

const ENV_KEYS = ["QUERY_MAX_CONCURRENT", "SETTINGS_LOCKED", "LOG_LEVEL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  applySettingRows([]);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const row = (key: string, value: unknown) => ({
  key,
  value,
  updatedBy: "u1",
  updatedByName: "Ada",
  updatedAt: new Date("2026-11-25T10:00:00Z"),
});

interface Setup {
  env?: string;
  lock?: boolean;
}

describe("getSetting precedence", () => {
  it.each<[string, Setup, number | undefined, number, string]>([
    ["nothing set: the built-in default", {}, undefined, 10, "default"],
    ["env beats the default", { env: "20" }, undefined, 20, "env"],
    ["a database value beats env", { env: "20" }, 30, 30, "database"],
    [
      "locked: env beats the database",
      { env: "20", lock: true },
      30,
      20,
      "locked",
    ],
    [
      "locked with no env: the default beats the database",
      { lock: true },
      30,
      10,
      "locked",
    ],
    [
      "an invalid env value falls back to the default",
      { env: "abc" },
      undefined,
      10,
      "default",
    ],
  ])("%s", (_name, setup, db, value, source) => {
    if (setup.env) process.env.QUERY_MAX_CONCURRENT = setup.env;
    if (setup.lock) process.env.SETTINGS_LOCKED = "QUERY_MAX_CONCURRENT";
    if (db !== undefined) applySettingRows([row("QUERY_MAX_CONCURRENT", db)]);
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(value);
    expect(describeSetting("QUERY_MAX_CONCURRENT").source).toBe(source);
  });

  it("a stored value that no longer validates is ignored", () => {
    applySettingRows([row("QUERY_MAX_CONCURRENT", 5000)]);
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(10);
  });

  it("describes where Reset would land", () => {
    process.env.QUERY_MAX_CONCURRENT = "20";
    applySettingRows([row("QUERY_MAX_CONCURRENT", 30)]);
    expect(describeSetting("QUERY_MAX_CONCURRENT")).toMatchObject({
      value: 30,
      base: { value: 20, source: "env" },
      updatedByName: "Ada",
    });
  });
});

describe("cache", () => {
  it("applying rows replaces the cached value at once", () => {
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(10);
    applySettingRows([row("QUERY_MAX_CONCURRENT", 40)]);
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
    applySettingRows([]);
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(10);
  });

  it("notifies listeners on a change, not on an identical reload", () => {
    const fn = vi.fn();
    const off = onSettingsChange(fn);
    applySettingRows([row("QUERY_MAX_CONCURRENT", 40)]);
    applySettingRows([row("QUERY_MAX_CONCURRENT", 40)]);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("validateChanges", () => {
  it.each<[Record<string, unknown>, RegExp]>([
    [{ NOPE: 1 }, /Unknown setting/],
    [{ QUERY_MAX_CONCURRENT: 0 }, /QUERY_MAX_CONCURRENT/],
    [{ QUERY_MAX_CONCURRENT: 101 }, /QUERY_MAX_CONCURRENT/],
    [{ QUERY_MAX_CONCURRENT: 1.5 }, /QUERY_MAX_CONCURRENT/],
    [{ QUERY_QUEUE_TIMEOUT_MS: 500 }, /QUERY_QUEUE_TIMEOUT_MS/],
    [{ QUERY_SHED_THRESHOLD: 0.05 }, /QUERY_SHED_THRESHOLD/],
    [{ LOG_LEVEL: "loud" }, /LOG_LEVEL/],
    [{ REGISTRATION_ENABLED: "yes" }, /REGISTRATION_ENABLED/],
    [{ QUERY_MAX_PER_USER: 11 }, /more than max concurrent/i],
    [{ QUERY_MAX_CONCURRENT: 4 }, /more than max concurrent/i],
  ])("refuses %j", (changes, message) => {
    expect(validateChanges(changes)).toMatch(message);
  });

  it("does not judge the per-user cap when neither cap is in the change (env legal config)", () => {
    process.env.QUERY_MAX_CONCURRENT = "3";
    expect(validateChanges({ REGISTRATION_ENABLED: true })).toBeNull();
    expect(validateChanges({ LOG_LEVEL: "debug" })).toBeNull();
    expect(validateChanges({ QUERY_MAX_CONCURRENT: 2 })).toMatch(
      /more than max concurrent/i,
    );
  });

  it("accepts valid values and null (reset)", () => {
    expect(
      validateChanges({
        QUERY_MAX_CONCURRENT: 50,
        QUERY_MAX_PER_USER: 50,
        LOG_LEVEL: null,
      }),
    ).toBeNull();
  });

  it("refuses a locked key", () => {
    process.env.SETTINGS_LOCKED = "LOG_LEVEL";
    expect(validateChanges({ LOG_LEVEL: "debug" })).toMatch(/locked/i);
  });
});
