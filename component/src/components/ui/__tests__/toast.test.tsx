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

  it("uses the rounded-lg floating-surface treatment on the root", () => {
    renderToast();
    expect(screen.getByTestId("toast")).toHaveClass("rounded-lg");
  });

  it("applies the destructive variant", () => {
    renderToast("destructive");
    expect(screen.getByTestId("toast")).toHaveClass("border-destructive");
  });
});
