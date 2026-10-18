import { describe, it, expect } from "vitest";
import {
  connectionListMeta,
  connectionStatusView,
  sharedCount,
} from "../connection-list";

describe("connectionListMeta", () => {
  it.each([
    [4, 2, "4 connections · 2 shared with the workspace"],
    [1, 0, "1 connection"],
    [3, 0, "3 connections"],
    [2, 1, "2 connections · 1 shared with the workspace"],
  ])("%i connections, %i shared: %s", (total, shared, expected) => {
    expect(connectionListMeta(total, shared)).toBe(expected);
  });
});

describe("sharedCount", () => {
  it("counts the workspace-visible connections only", () => {
    expect(
      sharedCount([
        { visibility: "shared" },
        { visibility: "private" },
        { visibility: "shared" },
      ]),
    ).toBe(2);
    expect(sharedCount(undefined)).toBe(0);
  });
});

describe("connectionStatusView", () => {
  it.each([
    ["connected", "Connected"],
    ["error", "Can't connect"],
    ["disconnected", "Can't connect"],
    ["connecting", "Connecting…"],
    ["unknown", "Not checked"],
  ] as const)("%s reads %s", (state, text) => {
    expect(connectionStatusView(state).text).toBe(text);
  });

  it("paints a failed connection red and a good one green, not alike", () => {
    expect(connectionStatusView("error").dot).toContain("bg-destructive");
    expect(connectionStatusView("connected").dot).toContain("bg-success");
  });
});
