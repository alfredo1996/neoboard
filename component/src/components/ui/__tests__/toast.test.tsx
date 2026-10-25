import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
} from "../toast";

function renderToast(variant?: "default" | "destructive") {
  return render(
    <ToastProvider>
      <Toast open variant={variant} data-testid="toast">
        <ToastTitle>Saved</ToastTitle>
        <ToastDescription>Your changes were saved.</ToastDescription>
        <ToastAction altText="Undo">Undo</ToastAction>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>,
  );
}

describe("Toast", () => {
  it("renders title, description and action when open", () => {
    renderToast();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your changes were saved.")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("stays a list item: no explicit role on the <li>, so axe's list rule holds", () => {
    renderToast("destructive");
    const toast = screen.getByTestId("toast");
    expect(toast.tagName).toBe("LI");
    expect(toast).not.toHaveAttribute("role");
  });

  it("announces an error assertively and the rest politely, once each", async () => {
    const { unmount } = renderToast("destructive");
    await waitFor(() =>
      expect(document.querySelector("[aria-live]")).toHaveAttribute(
        "aria-live",
        "assertive",
      ),
    );
    unmount();
    renderToast();
    await waitFor(() =>
      expect(document.querySelector("[aria-live]")).toHaveAttribute(
        "aria-live",
        "polite",
      ),
    );
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("names its close button", () => {
    renderToast();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("marks a failed toast with the square and a done one with the dot, on a neutral surface", () => {
    const { unmount } = renderToast("destructive");
    const failed = screen.getByTestId("toast");
    expect(failed.querySelector("[data-shape]")).toHaveAttribute(
      "data-shape",
      "square",
    );
    expect(failed.className).not.toMatch(/bg-destructive/);
    unmount();
    renderToast();
    expect(
      screen.getByTestId("toast").querySelector("[data-shape]"),
    ).toHaveAttribute("data-shape", "filled");
  });
});
