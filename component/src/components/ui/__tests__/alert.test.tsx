import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Alert, AlertDescription } from "../alert";

// Epic B (#1126): Alert joins the canonical variant vocabulary
// (default · secondary · tonal · destructive · success · warning · outline).
function renderAlert(variant?: Parameters<typeof Alert>[0]["variant"]) {
  render(
    <Alert variant={variant} data-testid="alert">
      <AlertDescription>msg</AlertDescription>
    </Alert>,
  );
  return screen.getByTestId("alert");
}

describe("Alert canonical variants (#1126)", () => {
  it("success is a bordered --success semantic alert", () => {
    const el = renderAlert("success");
    expect(el.className).toContain("text-[hsl(var(--success))]");
    expect(el.className).toContain("border-[hsl(var(--success)/0.5)]");
  });

  it("warning is a bordered --warning semantic alert", () => {
    const el = renderAlert("warning");
    expect(el.className).toContain("text-[hsl(var(--warning))]");
    expect(el.className).toContain("border-[hsl(var(--warning)/0.5)]");
  });

  it("tonal is the citrine tint surface", () => {
    const el = renderAlert("tonal");
    expect(el.className).toContain("bg-[hsl(var(--ring)/0.14)]");
  });

  it("secondary uses the secondary surface", () => {
    const el = renderAlert("secondary");
    expect(el.className).toContain("bg-secondary");
  });

  it("outline is a transparent bordered surface", () => {
    const el = renderAlert("outline");
    expect(el.className).toContain("bg-transparent");
  });

  it("destructive keeps its existing semantics", () => {
    const el = renderAlert("destructive");
    expect(el.className).toContain("text-destructive");
  });
});
