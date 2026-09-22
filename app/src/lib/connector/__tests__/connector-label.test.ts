import { describe, it, expect } from "vitest";
import { connectorLabel } from "../connector-label";

/**
 * #1905: six places showed users a connection's raw `type` — a badge reading
 * `acme-sheets`, a picker entry "Prod (acme-sheets)", "Pick a acme-sheets
 * connection". The label is what the connector's descriptor declares; this is
 * the one place that reads it.
 */
const installed = [
  { type: "acme-sheets", label: "Acme Sheets" },
  { type: "acme-graph", label: "Acme Graph" },
];

describe("connectorLabel", () => {
  it("names a connector by the label its descriptor declares", () => {
    expect(connectorLabel(installed, "acme-sheets")).toBe("Acme Sheets");
  });

  // An uninstalled connector has no descriptor left to ask; its type is then
  // the only name there is, and a blank would read as a missing value.
  it("falls back to the type when the connector is not installed", () => {
    expect(connectorLabel(installed, "uninstalled")).toBe("uninstalled");
  });

  it("falls back to the type while the descriptors are still loading", () => {
    expect(connectorLabel(undefined, "acme-sheets")).toBe("acme-sheets");
  });

  // A widget template that needs no connection stores no connectorType (#1900).
  it("is empty when there is no type at all", () => {
    expect(connectorLabel(installed, null)).toBe("");
    expect(connectorLabel(installed, undefined)).toBe("");
  });
});
