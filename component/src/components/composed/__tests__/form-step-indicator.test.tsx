import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormStepIndicator } from "../form-step-indicator";

const labels = ["Personal", "Details", "Review"];

describe("FormStepIndicator", () => {
  describe("rendering", () => {
    it("renders all step labels", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={0} />);

      for (const label of labels) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("renders the nav with aria-label", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={0} />);

      expect(
        screen.getByRole("navigation", { name: "Form steps" }),
      ).toBeInTheDocument();
    });

    it("renders the container with data-testid", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={0} />);

      expect(screen.getByTestId("form-step-indicator")).toBeInTheDocument();
    });
  });

  describe("step badges", () => {
    it("shows numeric badge for current and upcoming steps", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={0} />);

      // Current step shows "1"
      expect(screen.getByText("1")).toBeInTheDocument();
      // Upcoming steps show "2" and "3"
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("shows checkmark for completed steps", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={2} />);

      // Steps 0 and 1 are completed — should show checkmarks
      const checkmarks = screen.getAllByText("✓");
      expect(checkmarks).toHaveLength(2);

      // Step 3 (current) still shows number
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  describe("aria-current", () => {
    it("marks current step with aria-current=step", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={1} />);

      const buttons = screen.getAllByRole("button");
      // Step 0 is completed, step 1 is current, step 2 is upcoming
      expect(buttons[0]).not.toHaveAttribute("aria-current");
      expect(buttons[1]).toHaveAttribute("aria-current", "step");
      expect(buttons[2]).not.toHaveAttribute("aria-current");
    });
  });

  describe("disabled state", () => {
    it("disables upcoming steps", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={0} />);

      const buttons = screen.getAllByRole("button");
      // Step 0 is current (not completed), step 1 & 2 are upcoming — all disabled
      expect(buttons[0]).toBeDisabled();
      expect(buttons[1]).toBeDisabled();
      expect(buttons[2]).toBeDisabled();
    });

    it("enables completed steps", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={2} />);

      const buttons = screen.getAllByRole("button");
      // Steps 0 and 1 are completed — enabled
      expect(buttons[0]).not.toBeDisabled();
      expect(buttons[1]).not.toBeDisabled();
      // Step 2 is current — disabled
      expect(buttons[2]).toBeDisabled();
    });
  });

  describe("click interaction", () => {
    it("calls onStepClick with step index when a completed step is clicked", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup({ delay: null });

      render(
        <FormStepIndicator
          stepLabels={labels}
          currentStep={2}
          onStepClick={onClick}
        />,
      );

      const buttons = screen.getAllByRole("button");
      await user.click(buttons[0]);

      expect(onClick).toHaveBeenCalledWith(0);
    });

    it("does not call onStepClick when clicking current step", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup({ delay: null });

      render(
        <FormStepIndicator
          stepLabels={labels}
          currentStep={1}
          onStepClick={onClick}
        />,
      );

      const buttons = screen.getAllByRole("button");
      // Current step button is disabled — click should not fire
      await user.click(buttons[1]);

      expect(onClick).not.toHaveBeenCalled();
    });

    it("does not call onStepClick when clicking upcoming step", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup({ delay: null });

      render(
        <FormStepIndicator
          stepLabels={labels}
          currentStep={0}
          onStepClick={onClick}
        />,
      );

      const buttons = screen.getAllByRole("button");
      await user.click(buttons[2]);

      expect(onClick).not.toHaveBeenCalled();
    });

    it("renders without errors when onStepClick is not provided", () => {
      render(<FormStepIndicator stepLabels={labels} currentStep={2} />);

      // Completed steps still render — just no click handler
      const buttons = screen.getAllByRole("button");
      expect(buttons[0]).not.toBeDisabled();
    });
  });

  describe("connector lines", () => {
    it("renders connector lines between steps", () => {
      const { container } = render(
        <FormStepIndicator stepLabels={labels} currentStep={1} />,
      );

      // There should be (labels.length - 1) connectors
      const connectors = container.querySelectorAll(".h-px.flex-1");
      expect(connectors).toHaveLength(2);
    });

    it("completed connectors have primary color", () => {
      const { container } = render(
        <FormStepIndicator stepLabels={labels} currentStep={2} />,
      );

      const connectors = container.querySelectorAll(".h-px.flex-1");
      // Connector before step 1 (completed) is primary
      expect(connectors[0]).toHaveClass("bg-primary");
      // Connector before step 2 (current, not completed) is border
      expect(connectors[1]).toHaveClass("bg-border");
    });

    it("upcoming connectors have border color", () => {
      const { container } = render(
        <FormStepIndicator stepLabels={labels} currentStep={0} />,
      );

      const connectors = container.querySelectorAll(".h-px.flex-1");
      expect(connectors[0]).toHaveClass("bg-border");
      expect(connectors[1]).toHaveClass("bg-border");
    });
  });
});
