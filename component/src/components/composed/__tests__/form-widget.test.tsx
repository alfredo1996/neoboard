import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormWidget } from "../form-widget";
import type { FormFieldDef } from "../form-widget";

const defaultFields: FormFieldDef[] = [
  { name: "param_name", label: "Name", type: "text" },
  { name: "param_email", label: "Email", type: "text" },
];

describe("FormWidget", () => {
  it("renders a labeled input for each field", () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows custom submit button text", () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
        submitButtonText="Create Record"
      />
    );

    expect(screen.getByRole("button", { name: "Create Record" })).toBeInTheDocument();
  });

  it("shows default submit button text when not specified", () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("calls onSubmit with current values on button click", () => {
    const onSubmit = vi.fn();
    const values = { param_name: "Alice", param_email: "alice@test.com" };

    render(
      <FormWidget
        fields={defaultFields}
        values={values}
        onFieldChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith(values);
  });

  it("disables submit button when isSubmitting", () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting
      />
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it('shows "Submitting..." text when isSubmitting', () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting
      />
    );

    expect(screen.getByRole("button")).toHaveTextContent("Submitting...");
  });

  it("shows success message when set", () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
        successMessage="Record created!"
      />
    );

    expect(screen.getByText("Record created!")).toBeInTheDocument();
  });

  it("shows error message when set", () => {
    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
        errorMessage="Something went wrong"
      />
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("calls onFieldChange on input change", () => {
    const onFieldChange = vi.fn();

    render(
      <FormWidget
        fields={defaultFields}
        values={{ param_name: "", param_email: "" }}
        onFieldChange={onFieldChange}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bob" } });
    expect(onFieldChange).toHaveBeenCalledWith("param_name", "Bob");
  });

  it("supports number input type", () => {
    const fields: FormFieldDef[] = [
      { name: "param_age", label: "Age", type: "number" },
    ];

    render(
      <FormWidget
        fields={fields}
        values={{ param_age: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByLabelText("Age") as HTMLInputElement;
    expect(input.type).toBe("number");
  });

  it("supports date input type", () => {
    const fields: FormFieldDef[] = [
      { name: "param_dob", label: "Date of Birth", type: "date" },
    ];

    render(
      <FormWidget
        fields={fields}
        values={{ param_dob: "" }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByLabelText("Date of Birth") as HTMLInputElement;
    expect(input.type).toBe("date");
  });

  it("renders nothing when fields array is empty", () => {
    const { container } = render(
      <FormWidget
        fields={[]}
        values={{}}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
  });
});
