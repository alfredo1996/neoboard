import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { OntologyTerm } from "@/lib/ontology/merge";
import { ConnectionTerms } from "../model/connection-terms";

const mockSave = vi.fn();
const mockRefetch = vi.fn();
let mockState: {
  data?: { terms: OntologyTerm[] };
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
};

vi.mock("@/hooks/use-ontology", () => ({
  useOntology: () => ({ ...mockState, refetch: mockRefetch }),
  useSaveTerms: () => ({ mutate: mockSave }),
}));

const term = (over: Partial<OntologyTerm>): OntologyTerm => ({
  kind: "entity",
  key: "Person",
  parentKey: "",
  displayName: "",
  description: "",
  hidden: false,
  orphaned: false,
  ...over,
});

const TERMS: OntologyTerm[] = [
  term({ key: "Person", displayName: "Customer" }),
  term({
    kind: "property",
    key: "email",
    parentKey: "entity:Person",
    type: "String",
    primaryKey: true,
  }),
  term({ key: "Secret", hidden: true }),
  term({ key: "Gone", orphaned: true, description: "kept note" }),
  term({
    kind: "relationship",
    key: "KNOWS",
    joins: [{ from: "Person", to: "Person" }],
  }),
];

function show(props: { canEdit?: boolean; search?: string } = {}) {
  return render(
    <ConnectionTerms
      connectionId="c1"
      name="Demo graph"
      canEdit={props.canEdit ?? true}
      search={props.search ?? ""}
    />,
  );
}

describe("ConnectionTerms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { data: { terms: TERMS } };
  });

  it("lists entities, relationships and properties with their types and joins", () => {
    show();
    expect(screen.getByText("2 entities · 1 relationship")).toBeTruthy();
    expect(screen.getByText("String")).toBeTruthy();
    expect(screen.getByText("Key")).toBeTruthy();
    expect(screen.getByText("Person → Person")).toBeTruthy();
  });

  it("saves a description on blur, with the term's other fields unchanged", () => {
    show();
    const field = screen.getByLabelText("Description of Person");
    fireEvent.change(field, { target: { value: "Someone who buys" } });
    fireEvent.blur(field);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toEqual([
      {
        kind: "entity",
        key: "Person",
        parentKey: "",
        displayName: "Customer",
        description: "Someone who buys",
        hidden: false,
      },
    ]);
  });

  it("does not save a field that was left as it was", () => {
    show();
    fireEvent.blur(screen.getByLabelText("Display name of Person"));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("hides a term from its switch", () => {
    show();
    fireEvent.click(screen.getByRole("switch", { name: "Hide Person" }));
    expect(mockSave.mock.calls[0][0][0]).toMatchObject({
      key: "Person",
      hidden: true,
    });
  });

  it("shows a reader the text and no way to edit", () => {
    show({ canEdit: false });
    expect(screen.queryByLabelText("Description of Person")).toBeNull();
    expect(screen.getByText("Customer")).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "Hide Person" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("leaves hidden terms out until Show hidden is switched on", () => {
    show();
    expect(screen.queryByText("Secret")).toBeNull();
    fireEvent.click(
      screen.getByRole("switch", { name: "Show hidden terms of Demo graph" }),
    );
    expect(screen.getByText("Secret")).toBeTruthy();
    expect(screen.getAllByText("Hidden")).toHaveLength(2); // the column and the tag
  });

  it("marks an orphaned term and keeps its saved note, read-only", () => {
    show();
    expect(screen.getByText("Orphaned")).toBeTruthy();
    expect(screen.getByText("kept note")).toBeTruthy();
    expect(screen.queryByLabelText("Description of Gone")).toBeNull();
  });

  it("filters by the search text", () => {
    show({ search: "knows" });
    expect(screen.getByText("KNOWS")).toBeTruthy();
    expect(screen.queryByText("Person")).toBeNull();
  });

  it("says when nothing matches the search", () => {
    show({ search: "zzz" });
    expect(screen.getByText("No terms match.")).toBeTruthy();
  });

  it("says a connection with no structure does not describe it", () => {
    mockState = { data: { terms: [] } };
    show();
    expect(
      screen.getByText("This connection doesn't describe its structure."),
    ).toBeTruthy();
  });

  it("shows a loading state", () => {
    mockState = { isLoading: true };
    show();
    expect(screen.getByRole("status", { name: "Loading terms" })).toBeTruthy();
  });

  it("shows an error with a way to try again", () => {
    mockState = { isError: true };
    show();
    expect(screen.getByRole("alert").textContent).toContain("Could not read");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes the structure on request", () => {
    show();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh the structure of Demo graph",
      }),
    );
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
