import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConceptDialog } from "../concept-dialog";

vi.mock("@/hooks/use-ontology", () => ({
  useOntology: () => ({ data: { terms: [] } }),
}));
vi.mock("@/hooks/use-concepts", () => ({
  useSaveConcept: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteConcept: () => ({ mutate: vi.fn(), isPending: false }),
}));

const concept = (connectionId: string) => ({
  id: "k1",
  name: "Customer",
  parameter: "customer",
  description: "",
  sides: [
    {
      connectionId,
      entityKey: "Person",
      keyPropertyKey: "email",
      missing: null,
    },
  ],
});
const renderDialog = (connectionId: string) =>
  render(
    <ConceptDialog
      open
      onOpenChange={vi.fn()}
      concept={concept(connectionId)}
      connections={[{ id: "graph", name: "Graph DB" }]}
    />,
  );

describe("ConceptDialog connection select", () => {
  it("offers no 'Unavailable connection' for a side with no connection chosen yet", () => {
    renderDialog("");
    expect(
      screen.queryByRole("option", { name: "Unavailable connection" }),
    ).not.toBeInTheDocument();
  });

  it("shows a saved side's own connection", () => {
    renderDialog("graph");
    expect(screen.getByLabelText("Connection, side 1")).toHaveValue("graph");
  });

  it("keeps a side on a connection that is not in the list visible, instead of showing the first one", () => {
    renderDialog("gone");
    const select = screen.getByLabelText("Connection, side 1");
    expect(select).toHaveValue("gone");
    expect(
      screen.getByRole("option", { name: "Unavailable connection" }),
    ).toBeInTheDocument();
  });
});

describe("ConceptDialog parameter wording (#2485)", () => {
  it("tells the parameter as a query reads it, and never as a bare $name", () => {
    renderDialog("graph");
    expect(screen.getAllByText(/\$param_customer/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$customer\b/)).toBeNull();
  });
});

describe("ConceptDialog parameter change warning (#2553)", () => {
  const warning = /Widgets that use \$param_customer keep the old name/;
  const setParameter = (value: string) =>
    fireEvent.change(screen.getByLabelText("Parameter"), {
      target: { value },
    });

  it("warns when the parameter differs from the saved one, and not before", () => {
    renderDialog("graph");
    expect(screen.queryByText(warning)).toBeNull();
    setParameter("cust");
    expect(
      screen.getByText(
        "Widgets that use $param_customer keep the old name. Update them to keep filtering together.",
      ),
    ).toBeInTheDocument();
  });

  it("goes away when the parameter is set back", () => {
    renderDialog("graph");
    setParameter("cust");
    setParameter("customer");
    expect(screen.queryByText(warning)).toBeNull();
  });

  it("never warns on a new concept", () => {
    render(
      <ConceptDialog
        open
        onOpenChange={vi.fn()}
        connections={[{ id: "graph", name: "Graph DB" }]}
      />,
    );
    setParameter("cust");
    expect(screen.queryByText(/keep the old name/)).toBeNull();
  });
});
