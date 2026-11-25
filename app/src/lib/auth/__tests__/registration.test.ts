import { describe, it, expect, afterEach } from "vitest";
import { isRegistrationEnabled } from "../registration";
import { applySettingRows } from "@/lib/settings/core";

const row = (value: unknown) => [
  { key: "REGISTRATION_ENABLED", value, updatedBy: null, updatedAt: null },
];

describe("isRegistrationEnabled", () => {
  afterEach(() => {
    applySettingRows([]);
    delete process.env.REGISTRATION_ENABLED;
    delete process.env.SETTINGS_LOCKED;
  });

  it("is closed by default", () => {
    expect(isRegistrationEnabled()).toBe(false);
  });

  it("follows env, case-insensitively", () => {
    process.env.REGISTRATION_ENABLED = "TRUE";
    expect(isRegistrationEnabled()).toBe(true);
  });

  it("an admin's value wins over env, both ways, at once", () => {
    applySettingRows(row(true));
    expect(isRegistrationEnabled()).toBe(true);
    process.env.REGISTRATION_ENABLED = "true";
    applySettingRows(row(false));
    expect(isRegistrationEnabled()).toBe(false);
  });

  it("a locked key ignores the admin's value", () => {
    process.env.SETTINGS_LOCKED = "REGISTRATION_ENABLED";
    applySettingRows(row(true));
    expect(isRegistrationEnabled()).toBe(false);
  });
});
