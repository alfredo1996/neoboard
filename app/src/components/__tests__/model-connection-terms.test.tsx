import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { OntologyTerm } from "@/lib/ontology/merge";
import { ConnectionTerms } from "../model/connection-terms";

const mockSave = vi.fn();
const mockRefetch = vi.fn();
const mockRefresh = vi.fn();
let mockState: {
  data?: { terms: OntologyTerm[] };
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
};

let mockConcepts: unknown[] = [];
vi.mock("@/hooks/use-concepts", () => ({
  useConcepts: () => ({ data: mockConcepts }),
}));
// The `enabled` each render asked for: a closed section reads nothing (#2533).
const enabledCalls: boolean[] = [];
vi.mock("@/hooks/use-ontology", () => ({
  useOntology: (_id: string, opts?: { enabled?: boolean }) => {
    const enabled = opts?.enabled ?? true;
    enabledCalls.push(enabled);
    return enabled
      ? { ...mockState, refetch: mockRefetch }
      : { refetch: mockRefetch };
  },
  useRefreshOntology: () => mockRefresh,
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

interface ShowProps {
  canEdit?: boolean;
  search?: string;
  /** Start with the section open; the default, as most checks look inside it. */
  open?: boolean;
  /** Open every entity, so its properties are on the page. */
  expand?: boolean;
  forceOpen?: boolean;
}

function show(props: ShowProps = {}) {
  const view = render(
    <ConnectionTerms
      connectionId="c1"
      name="Demo graph"
      canEdit={props.canEdit ?? true}
      search={props.search ?? ""}
      defaultOpen={props.open ?? true}
      forceOpen={props.forceOpen}
    />,
  );
  if (props.expand ?? true) {
    for (const b of screen.queryAllByRole("button", {
      name: /^Show the properties of /,
    })) {
      fireEvent.click(b);
    }
  }
  return view;
}

describe("ConnectionTerms", () => {
  beforeEach(() => {
    mockConcepts = [];
    enabledCalls.length = 0;
    vi.clearAllMocks();
    mockState = { data: { terms: TERMS } };
  });

  it("tags the key property of each concept mapped on this connection", () => {
    mockState = { data: { terms: TERMS } };
    mockConcepts = [
      {
        id: "k1",
        name: "Customer",
        sides: [
          { connectionId: "c1", entityKey: "Person", keyPropertyKey: "email" },
          {
            connectionId: "other",
            entityKey: "Person",
            keyPropertyKey: "name",
          },
        ],
      },
    ];
    show();
    expect(screen.getAllByText("Customer key")).toHaveLength(1);
    const row = screen.getByText("Customer key").closest("tr");
    expect(row?.textContent).toContain("email");
  });

  it("lists entities, relationships and properties with their types and joins", () => {
    show();
    expect(screen.getByText("2 entities · 1 relationship")).toBeTruthy();
    expect(screen.getByText("String")).toBeTruthy();
    expect(screen.getByText("Key")).toBeTruthy();
    expect(screen.getByText("Person → Person")).toBeTruthy();
  });

  it("saves a description on blur, sending only that field", () => {
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
        description: "Someone who buys",
      },
    ]);
  });

  it("two quick saves of one term each carry only their own field, so neither erases the other", () => {
    show();
    const name = screen.getByLabelText("Display name of Person");
    const description = screen.getByLabelText("Description of Person");
    fireEvent.change(name, { target: { value: "Client" } });
    fireEvent.blur(name);
    fireEvent.change(description, { target: { value: "Buys" } });
    fireEvent.blur(description);
    const sent = mockSave.mock.calls.map((c) => c[0][0]);
    expect(sent).toEqual([
      { kind: "entity", key: "Person", parentKey: "", displayName: "Client" },
      { kind: "entity", key: "Person", parentKey: "", description: "Buys" },
    ]);
  });

  it("names a property's parent in its field labels, so same-named properties stay apart", () => {
    mockState = {
      data: {
        terms: [
          term({ key: "Person" }),
          term({ key: "Movie" }),
          term({ kind: "property", key: "name", parentKey: "entity:Person" }),
          term({ kind: "property", key: "name", parentKey: "entity:Movie" }),
        ],
      },
    };
    show();
    expect(screen.getByLabelText("Description of Person.name")).toBeTruthy();
    expect(screen.getByLabelText("Description of Movie.name")).toBeTruthy();
  });

  it("does not save a field that was left as it was", () => {
    show();
    fireEvent.blur(screen.getByLabelText("Display name of Person"));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("hides a term from its switch", () => {
    show();
    fireEvent.click(screen.getByRole("switch", { name: "Hide Person" }));
    expect(mockSave.mock.calls[0][0]).toEqual([
      { kind: "entity", key: "Person", parentKey: "", hidden: true },
    ]);
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

  it("shows the name and description as plain text at rest, a field on hover (M1)", () => {
    show();
    for (const label of ["Display name of Person", "Description of Person"]) {
      const cls = screen.getByLabelText(label).className;
      expect(cls).toContain("border-transparent");
      expect(cls).toContain("bg-transparent");
      expect(cls).toContain("hover:bg-field");
    }
  });

  it("marks an orphan with an amber tag, not a status shape (M2)", () => {
    show();
    const tag = screen.getByText("Orphaned");
    expect(tag.className).toContain("text-warning");
    expect(tag.querySelector("svg")).toBeNull();
  });

  it("marks an orphaned term and keeps its saved note, read-only", () => {
    show();
    expect(screen.getByText("Orphaned")).toBeTruthy();
    expect(screen.getByText("kept note")).toBeTruthy();
    expect(screen.queryByLabelText("Description of Gone")).toBeNull();
  });

  it("removes an orphan's stored meaning from its Remove action", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Remove Gone" }));
    expect(mockSave.mock.calls[0][0]).toEqual([
      { kind: "entity", key: "Gone", parentKey: "", remove: true },
    ]);
  });

  it("offers Remove only on an orphan, and only to someone who can edit", () => {
    show();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
    cleanup();
    show({ canEdit: false });
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("shows a table join with its columns", () => {
    mockState = {
      data: {
        terms: [
          term({
            kind: "relationship",
            key: "orders(customer_id)->customers(id)",
            joins: [
              {
                from: "orders",
                to: "customers",
                fromColumns: ["customer_id"],
                toColumns: ["id"],
              },
            ],
          }),
        ],
      },
    };
    show();
    expect(
      screen.getByText("orders(customer_id) → customers(id)"),
    ).toBeTruthy();
  });

  it("filters by the search text", () => {
    show({ search: "knows" });
    expect(screen.getByText("KNOWS")).toBeTruthy();
    expect(screen.queryByText("Person")).toBeNull();
  });

  it("says when nothing matches the search, in the header of a section left closed", () => {
    show({ search: "zzz", open: false });
    expect(screen.getByText("No match")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Demo graph" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("says so in the body of a section the user opened", () => {
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
    // The Refresh reads past the server's cache; Try again does not (#2514).
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
describe("ConnectionTerms collapsing (#2533)", () => {
  const prop = (parent: string, key: string) =>
    term({ kind: "property", key, parentKey: `entity:${parent}` });
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => [
      term({ key: `Match${i}` }),
      prop(`Match${i}`, "email"),
    ]).flat();
  const section = () => screen.getByRole("button", { name: "Demo graph" });

  beforeEach(() => {
    enabledCalls.length = 0;
    mockState = {
      data: {
        terms: [
          term({ key: "Person", displayName: "Human" }),
          prop("Person", "email"),
          prop("Person", "age"),
          term({ key: "Movie" }),
          prop("Movie", "title"),
          term({ kind: "relationship", key: "KNOWS" }),
          term({ kind: "relationship", key: "ACTED_IN" }),
          {
            ...prop("x", "since"),
            parentKey: "relationship:ACTED_IN",
          },
        ],
      },
    };
  });

  it("starts closed and reads nothing; a click opens it and reads", () => {
    show({ open: false });
    expect(section().getAttribute("aria-expanded")).toBe("false");
    expect(enabledCalls.every((enabled) => !enabled)).toBe(true);
    expect(screen.queryByText("Person")).toBeNull();
    fireEvent.click(section());
    expect(enabledCalls.at(-1)).toBe(true);
    expect(screen.getByText("Person")).toBeTruthy();
  });

  it("mounts an entity's properties only once it is opened, and shows their count", () => {
    show({ expand: false });
    const toggle = screen.getByRole("button", {
      name: "Show the properties of Person",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByLabelText("Display name of Person.email")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Display name of Person.email")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Hide the properties of Person" }),
    );
    expect(screen.queryByLabelText("Display name of Person.email")).toBeNull();
  });

  it("gives a relationship with no properties no toggle", () => {
    show({ expand: false });
    expect(
      screen.queryByRole("button", { name: /properties of KNOWS/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show the properties of ACTED_IN" }),
    ).toBeTruthy();
  });

  it("opens a match with the counts, and closes it again when the search clears", () => {
    const { rerender } = show({ open: false, search: "title", expand: false });
    expect(section().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Display name of Movie.title")).toBeTruthy();
    expect(screen.getByText("1 of 2 entities match")).toBeTruthy();
    rerender(
      <ConnectionTerms connectionId="c1" name="Demo graph" canEdit search="" />,
    );
    expect(section().getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps what the user opened when the search clears", () => {
    const ui = (search: string) => (
      <ConnectionTerms
        connectionId="c1"
        name="Demo graph"
        canEdit
        search={search}
        defaultOpen
      />
    );
    const { rerender } = render(ui(""));
    fireEvent.click(
      screen.getByRole("button", { name: "Show the properties of Person" }),
    );
    rerender(ui("title"));
    rerender(ui(""));
    expect(screen.getByLabelText("Display name of Person.email")).toBeTruthy();
    expect(screen.queryByLabelText("Display name of Movie.title")).toBeNull();
  });

  it("lists more than 20 matches closed, with a note", () => {
    mockState = { data: { terms: many(21) } };
    show({ open: false, search: "email", expand: false });
    expect(
      screen.getByText("21 match. Open one to see its properties."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Display name of Match0.email")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show the properties of Match0" }),
    );
    expect(screen.getByLabelText("Display name of Match0.email")).toBeTruthy();
  });

  it("opens exactly 20 matches", () => {
    mockState = { data: { terms: many(20) } };
    show({ open: false, search: "email", expand: false });
    expect(screen.getByLabelText("Display name of Match19.email")).toBeTruthy();
    expect(screen.queryByText(/Open one to see/)).toBeNull();
  });

  it("says Reading while a search reads, then a failure with Try again, section left closed", () => {
    mockState = { isLoading: true };
    const { unmount } = show({ open: false, search: "x" });
    expect(screen.getByText("Reading…")).toBeTruthy();
    unmount();
    mockState = { isError: true };
    show({ open: false, search: "x" });
    expect(screen.getByText("Couldn't read this connection.")).toBeTruthy();
    expect(section().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows Show hidden and Refresh only when open", () => {
    const { unmount } = show({ open: false });
    expect(screen.queryByText("Show hidden")).toBeNull();
    expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull();
    unmount();
    show();
    expect(screen.getByText("Show hidden")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
  });

  it("opens and scrolls to its section when the link points at it", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    show({ open: false, forceOpen: true });
    expect(section().getAttribute("aria-expanded")).toBe("true");
    expect(scroll).toHaveBeenCalled();
  });
});
