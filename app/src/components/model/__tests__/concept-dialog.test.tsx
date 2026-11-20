import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
