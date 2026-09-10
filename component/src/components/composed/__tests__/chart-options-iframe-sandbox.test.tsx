import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ChartOptionsPanel } from "../chart-options-panel";

// Same rationale as chart-options-panel.test.tsx: this is a heavy jsdom render.
vi.setConfig({ testTimeout: 15000 });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderIframe(sandbox: string) {
  render(
    <ChartOptionsPanel
      chartType="iframe"
      settings={{ sandbox }}
      onSettingsChange={vi.fn()}
    />,
  );
  screen
    .getAllByRole("button", { expanded: false })
    .forEach((btn) => fireEvent.click(btn));
}

describe("#1413 — the Sandbox Policy field says what it discards", () => {
  it("shows a warning, linked to the field, when allow-same-origin is configured", () => {
    renderIframe("allow-scripts allow-same-origin");
    const warning = document.getElementById("sandbox-validation");
    expect(warning).not.toBeNull();
    expect(warning).toHaveTextContent(/"allow-same-origin" is refused/);
    expect(
      document.getElementById("sandbox")?.getAttribute("aria-describedby"),
    ).toContain("sandbox-validation");
  });

  it("shows nothing when every token is applied", () => {
    renderIframe("allow-scripts");
    expect(document.getElementById("sandbox")).not.toBeNull();
    expect(document.getElementById("sandbox-validation")).toBeNull();
  });
});
