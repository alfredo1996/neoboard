import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SeedQueryError } from "../seed-query-error";
import { ConnectorUnavailableError } from "@/lib/api/api-client";

describe("SeedQueryError", () => {
  it("is centred like the chart cards' connector-unavailable state", () => {
    render(
      <SeedQueryError error={new Error("syntax error")} onRetry={vi.fn()} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("items-center");
    expect(alert.className).toContain("justify-center");
    expect(alert.className).toContain("text-center");
  });

  it("keeps the whole message reachable on the element the pointer hovers", () => {
    render(
      <SeedQueryError error={new Error("syntax error")} onRetry={vi.fn()} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("title")).toBe("syntax error");
    // The root is the card-sized element, so the tooltip shows from anywhere in it.
    expect(alert.contains(screen.getByText("syntax error"))).toBe(true);
  });

  it("names a dead connector, with a working Retry", () => {
    const onRetry = vi.fn();
    render(
      <SeedQueryError
        error={new ConnectorUnavailableError("refused", "network")}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Connector unavailable")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
