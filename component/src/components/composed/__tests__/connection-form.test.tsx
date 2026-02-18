import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  ConnectionForm,
  neo4jConnectionFields,
  postgresConnectionFields,
} from "../connection-form";
import type { ConnectionFieldConfig } from "../connection-form";

const minimalFields: ConnectionFieldConfig[] = [
  { name: "host", label: "Host", type: "text", placeholder: "localhost", defaultValue: "localhost" },
  { name: "port", label: "Port", type: "text", placeholder: "5432", defaultValue: "5432" },
];

describe("ConnectionForm", () => {
  it("renders fields from config", () => {
    render(<ConnectionForm fields={minimalFields} />);
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
  });

  it("renders with default values from field config", () => {
    render(<ConnectionForm fields={minimalFields} />);
    expect(screen.getByLabelText("Host")).toHaveValue("localhost");
    expect(screen.getByLabelText("Port")).toHaveValue("5432");
  });

  it("renders with overridden default values", () => {
    render(
      <ConnectionForm
        fields={minimalFields}
        defaultValues={{ host: "example.com", port: "7687" }}
      />,
    );
    expect(screen.getByLabelText("Host")).toHaveValue("example.com");
    expect(screen.getByLabelText("Port")).toHaveValue("7687");
  });

  it("renders password field with type password", () => {
    const fields: ConnectionFieldConfig[] = [
      { name: "pass", label: "Password", type: "password" },
    ];
    render(<ConnectionForm fields={fields} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("renders select fields", () => {
    const fields: ConnectionFieldConfig[] = [
      { name: "mode", label: "Mode", type: "select", options: ["optionA", "optionB"], defaultValue: "optionA" },
    ];
    render(<ConnectionForm fields={fields} />);
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeInTheDocument();
  });

  it("renders Connect submit button by default", () => {
    render(<ConnectionForm fields={minimalFields} />);
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("renders custom submit and test labels", () => {
    render(
      <ConnectionForm
        fields={minimalFields}
        onTest={vi.fn()}
        submitLabel="Save"
        testLabel="Verify"
      />,
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verify/i })).toBeInTheDocument();
  });

  it("renders Test Connection button when onTest is provided", () => {
    render(<ConnectionForm fields={minimalFields} onTest={vi.fn()} />);
    expect(screen.getByRole("button", { name: /test connection/i })).toBeInTheDocument();
  });

  it("does not render Test Connection button when onTest is not provided", () => {
    render(<ConnectionForm fields={minimalFields} />);
    expect(screen.queryByRole("button", { name: /test connection/i })).not.toBeInTheDocument();
  });

  it("calls onSubmit with form values", () => {
    const onSubmit = vi.fn();
    render(<ConnectionForm fields={minimalFields} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole("button", { name: /connect/i }).closest("form")!);
    expect(onSubmit).toHaveBeenCalledWith({ host: "localhost", port: "5432" });
  });

  it("calls onTest with form values", () => {
    const onTest = vi.fn();
    render(<ConnectionForm fields={minimalFields} onTest={onTest} />);
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    expect(onTest).toHaveBeenCalledWith({ host: "localhost", port: "5432" });
  });

  it("updates field values on input change", () => {
    render(<ConnectionForm fields={minimalFields} />);
    const hostInput = screen.getByLabelText("Host");
    fireEvent.change(hostInput, { target: { value: "newhost.com" } });
    expect(hostInput).toHaveValue("newhost.com");
  });

  it("applies custom className", () => {
    const { container } = render(<ConnectionForm fields={minimalFields} className="custom-form" />);
    expect(container.querySelector("form")).toHaveClass("custom-form");
  });

  it("marks required fields with asterisk", () => {
    const fields: ConnectionFieldConfig[] = [
      { name: "db", label: "Database", type: "text", required: true },
    ];
    render(<ConnectionForm fields={fields} />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders neo4j preset fields", () => {
    render(<ConnectionForm fields={neo4jConnectionFields} />);
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.getByLabelText("Database")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders postgres preset fields", () => {
    render(<ConnectionForm fields={postgresConnectionFields} />);
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    // Database has `required`, so use the input element directly
    expect(screen.getByPlaceholderText("mydb")).toBeInTheDocument();
    expect(screen.getByLabelText("Schema")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    // SSL Mode select
    expect(screen.getByRole("combobox", { name: "SSL Mode" })).toBeInTheDocument();
  });
});
