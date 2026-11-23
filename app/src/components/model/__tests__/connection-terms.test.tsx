import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionTerms } from "../connection-terms";
import type { OntologyTerm } from "@/lib/ontology/merge";

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
const prop = (parent: string, key: string) =>
  term({ kind: "property", key, parentKey: `entity:${parent}` });

const read = vi.hoisted(() => ({
  terms: [] as OntologyTerm[],
  status: "ok" as "ok" | "loading" | "error",
  calls: [] as boolean[],
}));
const refetch = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-ontology", () => ({
  useOntology: (_id: string, opts?: { enabled?: boolean }) => {
    const enabled = opts?.enabled ?? true;
    read.calls.push(enabled);
    return {
      data: enabled && read.status === "ok" ? { terms: read.terms } : undefined,
      isLoading: enabled && read.status === "loading",
      isError: enabled && read.status === "error",
      isFetching: false,
      refetch,
    };
  },
  useRefreshOntology: () => vi.fn(),
  useSaveTerms: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-concepts", () => ({ useConcepts: () => ({ data: [] }) }));

function many(n: number) {
  return Array.from({ length: n }, (_, i) => [
    term({ key: `Match${i}` }),
    prop(`Match${i}`, "email"),
  ]).flat();
}

const ui = (search = "", extra = {}) => (
  <ConnectionTerms
    connectionId="c1"
    name="Graph"
    canEdit
    search={search}
    {...extra}
  />
);
const section = () => screen.getByRole("button", { name: "Graph" });

beforeEach(() => {
  read.status = "ok";
  read.calls = [];
  read.terms = [
    term({ key: "Person", displayName: "Human" }),
    prop("Person", "email"),
    prop("Person", "age"),
    term({ key: "Movie" }),
    prop("Movie", "title"),
    term({ kind: "relationship", key: "KNOWS" }),
    term({ kind: "relationship", key: "ACTED_IN" }),
    term({
      kind: "property",
      key: "since",
      parentKey: "relationship:ACTED_IN",
    }),
  ];
});

describe("ConnectionTerms collapsing (#2533)", () => {
  it("starts closed, reads nothing, and a click opens it and reads", () => {
    render(ui());
    expect(section()).toHaveAttribute("aria-expanded", "false");
    expect(read.calls.every((enabled) => !enabled)).toBe(true);
    expect(screen.queryByText("Person")).toBeNull();
    fireEvent.click(section());
    expect(read.calls.at(-1)).toBe(true);
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Display name of Person\.email/)).toBeNull();
  });

  it("mounts an entity's properties only once it is opened, with its count", () => {
    render(ui("", { defaultOpen: true }));
    const toggle = screen.getByRole("button", {
      name: "Show the properties of Person",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(
      screen.getByLabelText("Display name of Person.email"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Hide the properties of Person" }),
    );
    expect(screen.queryByLabelText("Display name of Person.email")).toBeNull();
  });

  it("gives a relationship with no properties no toggle", () => {
    render(ui("", { defaultOpen: true }));
    expect(
      screen.queryByRole("button", { name: /properties of KNOWS/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show the properties of ACTED_IN" }),
    ).toBeInTheDocument();
  });

  it("opens a match, shows the counts, and closes it again when the search clears", () => {
    const { rerender } = render(ui("title"));
    expect(section()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByLabelText("Display name of Movie.title"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 2 entities match")).toBeInTheDocument();
    rerender(ui(""));
    expect(section()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps what the user opened when the search clears", () => {
    const { rerender } = render(ui("", { defaultOpen: true }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show the properties of Person" }),
    );
    rerender(ui("title", { defaultOpen: true }));
    rerender(ui("", { defaultOpen: true }));
    expect(
      screen.getByLabelText("Display name of Person.email"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name of Movie.title")).toBeNull();
  });

  it("leaves a section with no match closed and says so", () => {
    render(ui("zzz"));
    expect(section()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("No match")).toBeInTheDocument();
  });

  it("lists more than 20 matches closed, with a note", () => {
    read.terms = many(21);
    render(ui("email"));
    expect(
      screen.getByText("21 match. Open one to see its properties."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Display name of Match0\.email/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show the properties of Match0" }),
    );
    expect(
      screen.getByLabelText("Display name of Match0.email"),
    ).toBeInTheDocument();
  });

  it("opens exactly 20 matches", () => {
    read.terms = many(20);
    render(ui("email"));
    expect(
      screen.getByLabelText("Display name of Match19.email"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Open one to see/)).toBeNull();
  });

  it("says Reading while a search reads, and a failure with Try again", () => {
    read.status = "loading";
    const { rerender } = render(ui("x"));
    expect(screen.getByText("Reading…")).toBeInTheDocument();
    read.status = "error";
    rerender(ui("x"));
    expect(screen.getByText("Couldn't read this connection.")).toBeVisible();
    expect(section()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows Show hidden and Refresh only when open", () => {
    const { unmount } = render(ui());
    expect(screen.queryByText("Show hidden")).toBeNull();
    expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull();
    unmount();
    render(ui("", { defaultOpen: true }));
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeInTheDocument();
    expect(screen.getByText("Show hidden")).toBeInTheDocument();
  });

  it("opens and scrolls to its section when the link points at it", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(ui("", { forceOpen: true }));
    expect(section()).toHaveAttribute("aria-expanded", "true");
    expect(scroll).toHaveBeenCalled();
  });
});
