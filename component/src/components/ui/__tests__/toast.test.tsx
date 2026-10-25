import { render, screen } from "@testing-library/react";
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

  it("an error toast is an alert, the others a status", () => {
    const { unmount } = renderToast("destructive");
    expect(screen.getByTestId("toast")).toHaveAttribute("role", "alert");
    unmount();
    renderToast();
    expect(screen.getByTestId("toast")).toHaveAttribute("role", "status");
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
