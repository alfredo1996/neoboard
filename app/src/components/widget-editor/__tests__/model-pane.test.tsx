import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OntologyTerm } from "@/lib/ontology/merge";
import { ModelPane, PaneTabs } from "../model-pane";

type Result = {
  data?: { terms: OntologyTerm[] };
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};
let result: Result;
const refetch = vi.fn();
vi.mock("@/hooks/use-ontology", () => ({ useOntology: () => result }));

const term = (t: Partial<OntologyTerm> & Pick<OntologyTerm, "kind" | "key">) =>
  ({
    parentKey: "",
    displayName: "",
    description: "",
    hidden: false,
    orphaned: false,
    ...t,
  }) as OntologyTerm;

const TERMS = [
  term({
    kind: "entity",
    key: "Movie",
    displayName: "Film",
    description: "A released film",
  }),
  term({ kind: "entity", key: "Person" }),
  term({ kind: "entity", key: "Secret", hidden: true }),
  term({ kind: "entity", key: "Gone", orphaned: true }),
  term({
    kind: "property",
    key: "title",
    parentKey: "entity:Movie",
    type: "String",
    description: "Title as released",
  }),
  term({
    kind: "property",
    key: "internal id",
    parentKey: "entity:Movie",
    hidden: true,
  }),
  term({
    kind: "property",
    key: "name",
    parentKey: "entity:Person",
    type: "String",
  }),
  term({
    kind: "relationship",
    key: "ACTED_IN",
    displayName: "Acted in",
    joins: [{ from: "Person", to: "Movie" }],
  }),
  term({
    kind: "relationship",
    key: "FOLLOWS",
    joins: [{ from: "Person", to: "Person" }],
  }),
];

const onInsert = vi.fn();
const onRun = vi.fn();
const setup = (language = "cypher", runDisabled = false, canRun = true) =>
  render(
    <ModelPane
      connectionId="c1"
      language={language}
      onInsert={onInsert}
      onRun={canRun ? onRun : undefined}
      runDisabled={runDisabled}
      tabs={<span>tabs</span>}
    />,
  );

beforeEach(() => {
  result = {
    data: { terms: TERMS },
    isPending: false,
    isError: false,
    refetch,
  };
  onInsert.mockClear();
  onRun.mockClear();
  refetch.mockClear();
});

describe("ModelPane", () => {
  it("lists visible entities and relationships, leaving out hidden and orphaned terms", () => {
    setup();
    expect(
      screen.getByText("2 entities · 2 relationships"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Film Movie/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Acted in ACTED_IN/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Person → Movie")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).toBeNull();
    expect(screen.queryByText("Gone")).toBeNull();
  });

  it("inserts the key, not the display name, and keeps the list open", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /^Film Movie/ }));
    expect(onInsert).toHaveBeenCalledExactlyOnceWith("Movie");
    expect(
      screen.getByText("2 entities · 2 relationships"),
    ).toBeInTheDocument();
  });

  it("opens an entity with its visible properties and relationships, and the crumb goes back", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Open Film" }));
    expect(
      screen.getByRole("button", { name: /^title String/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("internal id")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Person/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Acted in ACTED_IN/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("FOLLOWS")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /^title String/ }),
    );
    expect(onInsert).toHaveBeenCalledWith("title");
    await userEvent.click(screen.getByRole("button", { name: "All terms" }));
    expect(screen.getByRole("button", { name: /^Person/ })).toBeInTheDocument();
  });

  it("quotes a key for the editor's language only when needed", async () => {
    result = {
      ...result,
      data: { terms: [term({ kind: "entity", key: "Product Name" })] },
    };
    setup("sql");
    await userEvent.click(
      screen.getByRole("button", { name: /^Product Name/ }),
    );
    expect(onInsert).toHaveBeenCalledWith('"Product Name"');
  });

  it("filters by search and counts the matches", async () => {
    setup();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the model" }),
      "film",
    );
    expect(
      await screen.findByText("1 of 2 entities match"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Person/ })).toBeNull();
  });

  it("says when nothing matches", async () => {
    setup();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the model" }),
      "zzz",
    );
    expect(await screen.findByText("No match.")).toBeInTheDocument();
  });

  it("shows 50 at a time", async () => {
    result = {
      ...result,
      data: {
        terms: Array.from({ length: 120 }, (_, i) =>
          term({ kind: "entity", key: `t${String(i).padStart(3, "0")}` }),
        ),
      },
    };
    setup();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: /Show 50 more/ }));
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: /Show 50 more/ }));
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(120);
    expect(screen.queryByRole("button", { name: /Show 50 more/ })).toBeNull();
    // Renders up to 120 rows and clicks twice: passed the 5s default on a loaded
    // CI runner (#2585), so this one test gets headroom.
  }, 15000);

  it("shows skeletons while reading", () => {
    result = { isPending: true, isError: false, refetch };
    setup();
    expect(screen.getByTestId("model-pane-loading")).toBeInTheDocument();
  });

  it("offers Try again when the read fails", async () => {
    result = { isPending: false, isError: true, refetch };
    setup();
    await userEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Try again",
      }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("says so when the connection reports no entities", () => {
    result = { ...result, data: { terms: [] } };
    setup();
    expect(
      screen.getByText("This connection reports no entities"),
    ).toBeInTheDocument();
  });

  it("links to this connection on the Model page, in a new tab", () => {
    setup();
    const link = screen.getByRole("link", {
      name: /Edit names on the Model page/,
    });
    expect(link).toHaveAttribute("href", "/model#connection-c1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Hidden terms are left out.")).toBeInTheDocument();
  });

  it("has a Run that runs, and is disabled when it cannot", async () => {
    const { unmount } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledOnce();
    unmount();
    setup("cypher", true);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("leaves out Run when there is nothing to run, as in a form", () => {
    setup("cypher", false, false);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  describe("a foreign key", () => {
    const FK = "movies(director_id)->people(id)";
    const fk = (extra: Partial<OntologyTerm> = {}) =>
      term({
        kind: "relationship",
        key: FK,
        joins: [
          {
            from: "movies",
            to: "people",
            fromColumns: ["director_id"],
            toColumns: ["id"],
          },
        ],
        ...extra,
      });

    it("shows which tables it joins but inserts nothing", async () => {
      result = {
        ...result,
        data: {
          terms: [
            term({ kind: "entity", key: "movies" }),
            term({ kind: "entity", key: "people" }),
            fk(),
            ...TERMS.filter((t) => t.key === "ACTED_IN"),
          ],
        },
      };
      setup();
      expect(screen.getByText("movies → people")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /director_id/ })).toBeNull();
      // A graph relationship type is still a name to insert.
      await userEvent.click(
        screen.getByRole("button", { name: /^Acted in ACTED_IN/ }),
      );
      expect(onInsert).toHaveBeenCalledExactlyOnceWith("ACTED_IN");
    });

    it("can still be opened when it has properties", async () => {
      result = {
        ...result,
        data: {
          terms: [
            term({ kind: "entity", key: "movies" }),
            fk(),
            term({
              kind: "property",
              key: "note",
              parentKey: `relationship:${FK}`,
            }),
          ],
        },
      };
      setup("sql");
      await userEvent.click(screen.getByRole("button", { name: `Open ${FK}` }));
      expect(screen.getByRole("button", { name: /^note/ })).toBeInTheDocument();
    });
  });

  describe("focus", () => {
    it("moves to the crumb when an entity opens and back to its arrow on return", async () => {
      setup();
      const open = screen.getByRole("button", { name: "Open Film" });
      await userEvent.click(open);
      const crumb = screen.getByRole("button", { name: "All terms" });
      expect(crumb).toHaveFocus();
      await userEvent.click(crumb);
      expect(screen.getByRole("button", { name: "Open Film" })).toHaveFocus();
    });
  });
});

describe("PaneTabs", () => {
  it("is a radio group of the two views that selects on click and roves with the arrows", async () => {
    const onSelect = vi.fn();
    render(<PaneTabs active="preview" onSelect={onSelect} />);
    const group = screen.getByRole("radiogroup", { name: "Side pane" });
    expect(within(group).getByRole("radio", { name: "Preview" })).toBeChecked();
    await userEvent.click(within(group).getByRole("radio", { name: "Model" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("model");
    within(group).getByRole("radio", { name: "Preview" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "Model" })).toHaveFocus();
  });
});
