import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { fixtureDescriptor } from "@/__tests__/fixtures/fixture-connector";
import {
  EMPTY_CONNECTION_FORM,
  configToForm,
  type ConnectionFormErrors,
  type ConnectionFormState,
  type FormMode,
} from "@/lib/connector/connection-form";
import { ConnectorConfigForm } from "../connector-config-form";

/**
 * The generated connection form (#1901), driven by a fixture connector nothing
 * in `app/` knows: two secrets (one advanced), a select, a boolean, a bounded
 * number with a unit. The real component library renders it — the ids, the
 * required markers and the inline errors asserted here are what the user and
 * the E2E suite get. jsdom computes no ARIA, so names are asserted as DOM:
 * a <label for> that points at the control.
 */

function Harness({
  mode,
  initial = EMPTY_CONNECTION_FORM,
  errors,
  onChange,
}: Readonly<{
  mode: FormMode;
  initial?: ConnectionFormState;
  errors?: ConnectionFormErrors;
  onChange?: (next: ConnectionFormState) => void;
}>) {
  const [value, setValue] = useState(initial);
  return (
    <ConnectorConfigForm
      connector={fixtureDescriptor}
      mode={mode}
      value={value}
      errors={errors}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const byId = (id: string) => document.getElementById(id);
const labelOf = (id: string) =>
  document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
const openAdvanced = () =>
  fireEvent.click(screen.getByRole("button", { name: /Advanced Settings/ }));

describe("ConnectorConfigForm — create", () => {
  it("renders the app's name field and the connection group, with ids derived from the keys", () => {
    render(<Harness mode="create" />);
    for (const id of [
      "conn-name",
      "conn-endpoint",
      "conn-api-token",
      "conn-region",
    ]) {
      expect(byId(id), id).toBeInTheDocument();
    }
    expect(labelOf("conn-endpoint")).toHaveTextContent("Endpoint");
    expect(byId("conn-endpoint")).toHaveAttribute(
      "placeholder",
      "acme://host/book",
    );
    expect(screen.getByText("Where the workbook is hosted.")).toBeVisible();
  });

  it("keeps the advanced group — and the app's row cap — inside a collapsed section", () => {
    render(<Harness mode="create" />);
    const advancedIds = [
      "conn-page-size",
      "conn-signing-secret",
      "conn-verify-tls",
      "conn-max-rows",
    ];
    for (const id of advancedIds) expect(byId(id), id).toBeNull();

    openAdvanced();
    for (const id of advancedIds) expect(byId(id), id).toBeInTheDocument();
    // Connection fields never move into it.
    expect(
      byId("conn-page-size")?.compareDocumentPosition(
        byId("conn-endpoint") as Node,
      ),
    ).toBe(Node.DOCUMENT_POSITION_PRECEDING);

    openAdvanced();
    expect(byId("conn-page-size")).toBeNull();
  });

  it("marks what the descriptor requires, and nothing else", () => {
    render(<Harness mode="create" />);
    openAdvanced();
    for (const id of ["conn-name", "conn-endpoint", "conn-api-token"]) {
      expect(labelOf(id), id).toHaveTextContent("*");
    }
    for (const id of ["conn-region", "conn-page-size", "conn-signing-secret"]) {
      expect(labelOf(id), id).not.toHaveTextContent("*");
    }
  });

  it("renders each field type as its control: password, select, switch, bounded number with its unit", () => {
    render(<Harness mode="create" />);
    openAdvanced();
    expect(byId("conn-api-token")).toHaveAttribute("type", "password");
    expect(byId("conn-signing-secret")).toHaveAttribute("type", "password");
    expect(byId("conn-region")).toHaveAttribute("role", "combobox");
    expect(byId("conn-verify-tls")).toHaveAttribute("role", "switch");

    const pageSize = byId("conn-page-size");
    expect(pageSize).toHaveAttribute("type", "number");
    expect(pageSize).toHaveAttribute("min", "1");
    expect(pageSize).toHaveAttribute("max", "500");
    expect(labelOf("conn-page-size")).toHaveTextContent("Page Size (rows)");

    const maxRows = byId("conn-max-rows");
    expect(maxRows).toHaveAttribute("min", "100");
    expect(maxRows).toHaveAttribute("max", "100000");
  });

  it("shows each error under its own field, and opens the advanced section that holds one", () => {
    render(
      <Harness
        mode="create"
        errors={{
          own: { name: "Name is required" },
          config: {
            endpoint: "Endpoint is required",
            pageSize: "Page Size must be at most 500",
          },
        }}
      />,
    );
    expect(byId("conn-name-error")).toHaveTextContent("Name is required");
    expect(byId("conn-endpoint-error")).toHaveTextContent(
      "Endpoint is required",
    );
    expect(byId("conn-endpoint")).toHaveAttribute("aria-invalid", "true");
    // Collapsed by default — but an error nobody can see is no error message.
    expect(byId("conn-page-size-error")).toHaveTextContent(
      "Page Size must be at most 500",
    );
  });

  it("opens the advanced section for a row-cap error too", () => {
    render(
      <Harness
        mode="create"
        errors={{ own: { maxRows: "Too few rows" }, config: {} }}
      />,
    );
    expect(byId("conn-max-rows-error")).toHaveTextContent("Too few rows");
  });

  it("reports every change as the next form state, keyed by field key", () => {
    const onChange = vi.fn();
    render(<Harness mode="create" onChange={onChange} />);
    openAdvanced();

    fireEvent.change(byId("conn-name") as Element, {
      target: { value: "Books" },
    });
    fireEvent.change(byId("conn-endpoint") as Element, {
      target: { value: "acme://host/book" },
    });
    fireEvent.change(byId("conn-page-size") as Element, {
      target: { value: "50" },
    });
    fireEvent.click(byId("conn-verify-tls") as Element);
    fireEvent.change(byId("conn-max-rows") as Element, {
      target: { value: "2000" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      name: "Books",
      maxRows: "2000",
      config: {
        endpoint: "acme://host/book",
        pageSize: "50",
        verifyTls: true,
      },
    });
  });
});

describe("ConnectorConfigForm — edit (the same component)", () => {
  const stored = {
    endpoint: "acme://host/book",
    region: "us",
    pageSize: 50,
    verifyTls: true,
    maxRows: 2000,
    // The server never sends these. Were it to, they still must not show.
    apiToken: "tok-never-shown",
    signingSecret: "sig-never-shown",
  };
  const initial = {
    ...configToForm(fixtureDescriptor.fields, stored),
    name: "Books",
  };

  it("derives edit- ids from the same keys and starts with the advanced section open", () => {
    render(<Harness mode="edit" initial={initial} />);
    for (const id of [
      "edit-name",
      "edit-endpoint",
      "edit-api-token",
      "edit-region",
      "edit-page-size",
      "edit-signing-secret",
      "edit-verify-tls",
      "edit-max-rows",
    ]) {
      expect(byId(id), id).toBeInTheDocument();
    }
    expect(document.querySelector('[id^="conn-"]')).toBeNull();
  });

  it("pre-fills everything but the secrets", () => {
    render(<Harness mode="edit" initial={initial} />);
    expect(byId("edit-name")).toHaveValue("Books");
    expect(byId("edit-endpoint")).toHaveValue("acme://host/book");
    expect(byId("edit-page-size")).toHaveValue(50);
    expect(byId("edit-max-rows")).toHaveValue(2000);
    expect(byId("edit-verify-tls")).toHaveAttribute("aria-checked", "true");
    expect(document.body).not.toHaveTextContent(/never-shown/);
  });

  it("leaves BOTH secrets blank, optional, and says blank keeps the stored one", () => {
    render(<Harness mode="edit" initial={initial} />);
    for (const id of ["edit-api-token", "edit-signing-secret"]) {
      expect(byId(id), id).toHaveValue("");
      expect(byId(id), id).toHaveAttribute(
        "placeholder",
        "Leave blank to keep existing",
      );
      expect(labelOf(id), id).not.toHaveTextContent("*");
    }
    // Still required of a NEW connection — see the create suite.
    expect(labelOf("edit-endpoint")).toHaveTextContent("*");
  });
});
