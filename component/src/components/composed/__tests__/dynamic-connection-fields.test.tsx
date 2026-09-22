import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  DynamicConnectionFields,
  type DynamicConnectionField,
} from "../dynamic-connection-fields";

const fields: DynamicConnectionField[] = [
  {
    name: "uri",
    label: "Connection URI",
    type: "text",
    required: true,
    placeholder: "bolt://localhost:7687",
    description: "Neo4j connection URI",
  },
  { name: "port", label: "Port", type: "number", placeholder: "7687" },
  { name: "password", label: "Password", type: "password" },
  {
    name: "sslmode",
    label: "SSL Mode",
    type: "select",
    options: [
      { label: "Prefer", value: "prefer" },
      { label: "Disable", value: "disable" },
    ],
  },
  { name: "verifyTls", label: "Verify TLS", type: "boolean" },
];

function renderFields(
  props: Partial<React.ComponentProps<typeof DynamicConnectionFields>> = {},
) {
  return render(
    <DynamicConnectionFields
      fields={fields}
      values={{
        uri: "",
        port: "",
        password: "",
        sslmode: "prefer",
        verifyTls: false,
      }}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe("DynamicConnectionFields", () => {
  it("renders each field with a label", () => {
    renderFields();
    expect(screen.getByLabelText(/Connection URI/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Port/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    expect(screen.getByLabelText(/SSL Mode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Verify TLS/)).toBeInTheDocument();
  });

  it("prefixes input ids with conn- by default (preserves E2E selectors)", () => {
    renderFields();
    expect(screen.getByLabelText(/Connection URI/)).toHaveAttribute(
      "id",
      "conn-uri",
    );
  });

  it("respects a custom idPrefix", () => {
    renderFields({ idPrefix: "edit-" });
    expect(screen.getByLabelText(/Connection URI/)).toHaveAttribute(
      "id",
      "edit-uri",
    );
  });

  it("marks required fields with an asterisk", () => {
    renderFields();
    const label = screen.getByText("Connection URI").closest("label");
    expect(label).toHaveTextContent("*");
  });

  it("renders the description as muted help text", () => {
    renderFields();
    expect(screen.getByText("Neo4j connection URI")).toBeInTheDocument();
  });

  it("renders number fields with type=number", () => {
    renderFields();
    expect(screen.getByLabelText(/Port/)).toHaveAttribute("type", "number");
  });

  describe("number constraints and unit", () => {
    const timeout: DynamicConnectionField = {
      name: "idleTimeout",
      id: "idle-timeout",
      label: "Idle Timeout",
      type: "number",
      min: 1000,
      max: 300000,
      unit: "ms",
    };

    it("puts min, max and a whole-number step on the input", () => {
      renderFields({ fields: [timeout], values: {} });
      const input = screen.getByRole("spinbutton");
      expect(input).toHaveAttribute("min", "1000");
      expect(input).toHaveAttribute("max", "300000");
      expect(input).toHaveAttribute("step", "1");
    });

    it("leaves min and max off when the field has none", () => {
      renderFields();
      const input = screen.getByLabelText(/Port/);
      expect(input).not.toHaveAttribute("min");
      expect(input).not.toHaveAttribute("max");
    });

    // jsdom computes no accessible name, so assert the DOM that produces it:
    // the unit sits INSIDE the <label> that points at the input.
    it("shows the unit inside the label that names the input", () => {
      renderFields({ fields: [timeout], values: {} });
      const input = screen.getByRole("spinbutton");
      const label = screen.getByText("Idle Timeout").closest("label");
      expect(label).toHaveAttribute("for", input.id);
      expect(label).toContainElement(screen.getByText("(ms)"));
    });

    it("uses the field's own id suffix when it has one", () => {
      renderFields({ fields: [timeout], values: {}, idPrefix: "edit-" });
      expect(screen.getByRole("spinbutton")).toHaveAttribute(
        "id",
        "edit-idle-timeout",
      );
    });
  });

  it("renders password fields with a show/hide toggle", () => {
    renderFields();
    expect(screen.getByLabelText(/Password/)).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("button", { name: /show password/i }),
    ).toBeInTheDocument();
  });

  it("renders select fields as a combobox with options", () => {
    renderFields();
    expect(
      screen.getByRole("combobox", { name: /SSL Mode/ }),
    ).toBeInTheDocument();
  });

  it("calls onChange with name and value on text input", () => {
    const onChange = vi.fn();
    renderFields({ onChange });
    fireEvent.change(screen.getByLabelText(/Connection URI/), {
      target: { value: "bolt://db:7687" },
    });
    expect(onChange).toHaveBeenCalledWith("uri", "bolt://db:7687");
  });

  it("renders a boolean as a switch, named by its label, and reports the new value", () => {
    const onChange = vi.fn();
    renderFields({ onChange });
    const toggle = screen.getByRole("switch");
    expect(screen.getByText("Verify TLS").closest("label")).toHaveAttribute(
      "for",
      toggle.id,
    );
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith("verifyTls", true);
  });

  it("shows a per-field error with the prefixed id and aria-invalid", () => {
    renderFields({ errors: { uri: "Invalid URI" } });
    const input = screen.getByLabelText(/Connection URI/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const err = screen.getByText("Invalid URI");
    expect(err).toHaveAttribute("id", "conn-uri-error");
  });
});
