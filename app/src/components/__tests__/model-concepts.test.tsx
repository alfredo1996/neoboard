import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Concept } from "@/hooks/use-concepts";
import type { OntologyTerm } from "@/lib/ontology/merge";
import { ConceptsSection } from "../model/concepts-section";

const mockSave = vi.fn();
const mockDelete = vi.fn();
let mockConcepts: {
  data?: Concept[];
  isLoading?: boolean;
  isError?: boolean;
};
let mockTerms: Record<string, OntologyTerm[]>;

vi.mock("@/hooks/use-concepts", () => ({
  useConcepts: () => ({ ...mockConcepts, refetch: vi.fn() }),
  useSaveConcept: () => ({ mutateAsync: mockSave, isPending: false }),
  useDeleteConcept: () => ({ mutateAsync: mockDelete, isPending: false }),
}));
vi.mock("@/hooks/use-ontology", () => ({
  useOntology: (id: string) => ({ data: { terms: mockTerms[id] ?? [] } }),
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
const prop = (entity: string, key: string, over: Partial<OntologyTerm> = {}) =>
  term({ kind: "property", key, parentKey: `entity:${entity}`, ...over });

const CONNECTIONS = [
  { id: "graph", name: "Recommendations" },
  { id: "sql", name: "Orders" },
];
const CUSTOMER: Concept = {
  id: "k1",
  name: "Customer",
  parameter: "customer",
  description: "Someone who has bought from us",
  sides: [
    { connectionId: "graph", entityKey: "Person", keyPropertyKey: "email" },
    { connectionId: "sql", entityKey: "customers", keyPropertyKey: "email" },
    { connectionId: "sql", entityKey: "orders", keyPropertyKey: "customer_id" },
  ],
};

// The page owns the New concept button, in its header; this stands in for it.
function Host({
  canEdit,
  search,
}: Readonly<{ canEdit: boolean; search: string }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {canEdit && (
        <button type="button" onClick={() => setOpen(true)}>
          New concept
        </button>
      )}
      <ConceptsSection
        connections={CONNECTIONS}
        canEdit={canEdit}
        search={search}
        newOpen={open}
        onNewClose={() => setOpen(false)}
      />
    </>
  );
}

function show(canEdit = true, search = "") {
  return render(<Host canEdit={canEdit} search={search} />);
}

describe("ConceptsSection", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockSave.mockResolvedValue({});
    mockConcepts = { data: [CUSTOMER] };
    mockTerms = {
      graph: [
        term({ key: "Person" }),
        prop("Person", "email"),
        prop("Person", "name"),
        term({ key: "Secret", hidden: true }),
        term({ key: "Store", orphaned: true }),
        term({ kind: "relationship", key: "BOUGHT" }),
      ],
      sql: [
        term({ key: "customers" }),
        prop("customers", "email"),
        prop("customers", "id"),
        term({ key: "orders" }),
        prop("orders", "customer_id"),
        prop("orders", "note", { hidden: true }),
      ],
    };
  });

  describe("reading", () => {
    it("shows a concept's name, parameter, description and its sides under their connections", () => {
      show();
      expect(screen.getByText("Customer")).toBeTruthy();
      expect(screen.getByText("$customer")).toBeTruthy();
      expect(screen.getByText("Someone who has bought from us")).toBeTruthy();
      const orders = screen.getByTestId("concept-side-group-k1-sql");
      expect(within(orders).getByText("Orders")).toBeTruthy();
      // Two sides on the one connection sit together.
      expect(within(orders).getByText("customers")).toBeTruthy();
      expect(within(orders).getByText("orders")).toBeTruthy();
      expect(within(orders).getByText("customer_id")).toBeTruthy();
      const graph = screen.getByTestId("concept-side-group-k1-graph");
      expect(within(graph).getByText("Recommendations")).toBeTruthy();
      expect(within(graph).getByText("Person")).toBeTruthy();
    });

    it("marks each connection with its own chart colour", () => {
      show();
      const dot = (c: string) =>
        within(screen.getByTestId(`concept-side-group-k1-${c}`)).getByTestId(
          "connection-dot",
        ).style.background;
      expect(dot("graph")).toContain("--chart-1");
      expect(dot("sql")).toContain("--chart-2");
    });

    it("says that values must match exactly, for a concept with more than one side", () => {
      show();
      expect(
        screen.getByText("Values must match exactly on every side."),
      ).toBeTruthy();
    });

    it("gives a reader the concepts without any button", () => {
      show(false);
      expect(screen.getByText("Customer")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "New concept" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    });

    it.each([
      ["entity", "Store", "Store is no longer in the database"],
      ["key property", "gone", "gone is no longer on Person"],
    ])("flags a side whose %s has left the database", (which, key, message) => {
      mockConcepts = {
        data: [
          {
            ...CUSTOMER,
            sides: [
              {
                connectionId: "graph",
                entityKey: which === "entity" ? key : "Person",
                keyPropertyKey: which === "entity" ? "code" : key,
                missing: which === "entity" ? "entity" : "keyProperty",
              },
            ],
          },
        ],
      };
      show();
      expect(screen.getByText(message)).toBeTruthy();
    });

    it("shows a skeleton while loading, an alert on error, and an invitation when empty", () => {
      mockConcepts = { isLoading: true };
      const { unmount } = show();
      expect(screen.getByLabelText("Loading concepts")).toBeTruthy();
      unmount();
      mockConcepts = { isError: true };
      const second = show();
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not load the concepts",
      );
      second.unmount();
      mockConcepts = { data: [] };
      show();
      expect(screen.getByText("No concepts yet")).toBeTruthy();
    });

    it.each([
      ["its name", "custom", true],
      ["its parameter", "$CUSTOMER", true],
      ["a side's entity", "orders", true],
      ["nothing it holds", "invoice", false],
    ])("search matches %s", (_w, search, found) => {
      show(true, search);
      expect(screen.queryByText("Customer") !== null).toBe(found);
    });
  });

  describe("the New concept dialog", () => {
    const open = async () => {
      show();
      fireEvent.click(screen.getByRole("button", { name: "New concept" }));
      return screen.findByRole("dialog");
    };
    const pick = (dialog: HTMLElement, label: string, i: number, v: string) =>
      fireEvent.change(
        within(dialog).getByLabelText(`${label}, side ${i + 1}`),
        {
          target: { value: v },
        },
      );

    it("fills the parameter from the name until the parameter is edited", async () => {
      const dialog = await open();
      const name = within(dialog).getByLabelText(/^Name/);
      const parameter = within(dialog).getByLabelText(
        /^Parameter/,
      ) as HTMLInputElement;
      fireEvent.change(name, { target: { value: "Sales Region" } });
      expect(parameter.value).toBe("sales_region");
      fireEvent.change(parameter, { target: { value: "region" } });
      fireEvent.change(name, { target: { value: "Sales Region 2" } });
      expect(parameter.value).toBe("region");
    });

    it("offers only the visible entities and key properties of the chosen connection", async () => {
      const dialog = await open();
      pick(dialog, "Connection", 0, "graph");
      const entities = within(dialog)
        .getByLabelText("Entity, side 1")
        .querySelectorAll("option");
      // The hidden, the orphaned and the relationship are not offered.
      expect([...entities].map((o) => o.textContent)).toEqual([
        "Select an entity",
        "Person",
      ]);
      pick(dialog, "Entity", 0, "Person");
      const keys = within(dialog)
        .getByLabelText("Key property, side 1")
        .querySelectorAll("option");
      expect([...keys].map((o) => o.textContent)).toEqual([
        "Select a key property",
        "email",
        "name",
      ]);
      pick(dialog, "Connection", 0, "sql");
      pick(dialog, "Entity", 0, "orders");
      const sqlKeys = within(dialog)
        .getByLabelText("Key property, side 1")
        .querySelectorAll("option");
      expect([...sqlKeys].map((o) => o.textContent)).toEqual([
        "Select a key property",
        "customer_id",
      ]);
    });

    it("saves a concept with two sides on the same connection", async () => {
      const dialog = await open();
      fireEvent.change(within(dialog).getByLabelText(/^Name/), {
        target: { value: "Customer" },
      });
      fireEvent.change(within(dialog).getByLabelText(/^Description/), {
        target: { value: "A buyer" },
      });
      pick(dialog, "Connection", 0, "sql");
      pick(dialog, "Entity", 0, "customers");
      pick(dialog, "Key property", 0, "email");
      fireEvent.click(within(dialog).getByRole("button", { name: "Add side" }));
      // The new side starts on the same connection.
      expect(
        (
          within(dialog).getByLabelText(
            "Connection, side 2",
          ) as HTMLSelectElement
        ).value,
      ).toBe("sql");
      pick(dialog, "Entity", 1, "orders");
      pick(dialog, "Key property", 1, "customer_id");
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
      expect(mockSave).toHaveBeenCalledWith({
        name: "Customer",
        parameter: "customer",
        description: "A buyer",
        sides: [
          {
            connectionId: "sql",
            entityKey: "customers",
            keyPropertyKey: "email",
          },
          {
            connectionId: "sql",
            entityKey: "orders",
            keyPropertyKey: "customer_id",
          },
        ],
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("cannot save until the name and every side are filled", async () => {
      const dialog = await open();
      const save = within(dialog).getByRole("button", { name: "Save" });
      expect((save as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(within(dialog).getByLabelText(/^Name/), {
        target: { value: "Customer" },
      });
      expect((save as HTMLButtonElement).disabled).toBe(true);
    });

    it("keeps the dialog open and says why when the server refuses", async () => {
      mockSave.mockRejectedValue(
        new Error('A concept named "Customer" already exists'),
      );
      const dialog = await open();
      fireEvent.change(within(dialog).getByLabelText(/^Name/), {
        target: { value: "Customer" },
      });
      pick(dialog, "Connection", 0, "sql");
      pick(dialog, "Entity", 0, "customers");
      pick(dialog, "Key property", 0, "email");
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      expect((await within(dialog).findByRole("alert")).textContent).toContain(
        "already exists",
      );
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("removes a side", async () => {
      const dialog = await open();
      fireEvent.click(within(dialog).getByRole("button", { name: "Add side" }));
      expect(within(dialog).getAllByLabelText(/^Entity, side/)).toHaveLength(2);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Remove side 1" }),
      );
      expect(within(dialog).getAllByLabelText(/^Entity, side/)).toHaveLength(1);
    });
  });

  describe("editing", () => {
    it("opens a concept as it is saved, and replaces it by id", async () => {
      show();
      fireEvent.click(screen.getByRole("button", { name: "Edit Customer" }));
      const dialog = await screen.findByRole("dialog");
      expect(
        (within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value,
      ).toBe("Customer");
      expect(within(dialog).getAllByLabelText(/^Entity, side/)).toHaveLength(3);
      fireEvent.change(within(dialog).getByLabelText(/^Description/), {
        target: { value: "Buyer" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockSave).toHaveBeenCalled());
      expect(mockSave.mock.calls[0][0]).toMatchObject({
        id: "k1",
        parameter: "customer",
        description: "Buyer",
      });
      expect(mockSave.mock.calls[0][0].sides).toHaveLength(3);
    });

    it("deletes a concept after a second click", async () => {
      mockDelete.mockResolvedValue({});
      show();
      fireEvent.click(screen.getByRole("button", { name: "Edit Customer" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(mockDelete).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Remove this concept" }),
      );
      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("k1"));
    });

    it("lists a side's missing term as the current choice, labelled with its state", async () => {
      mockConcepts = {
        data: [
          {
            ...CUSTOMER,
            sides: [
              {
                connectionId: "graph",
                entityKey: "Store",
                keyPropertyKey: "id",
              },
            ],
          },
        ],
      };
      show();
      fireEvent.click(screen.getByRole("button", { name: "Edit Customer" }));
      const dialog = await screen.findByRole("dialog");
      const entity = within(dialog).getByLabelText(
        "Entity, side 1",
      ) as HTMLSelectElement;
      expect(entity.value).toBe("Store");
      expect(entity.selectedOptions[0].textContent).toBe(
        "Store (no longer in the database)",
      );
    });

    it("shows a display name beside the key in the options", async () => {
      mockTerms.graph = [
        term({ key: "Person", displayName: "Customer" }),
        prop("Person", "email", { displayName: "Email address" }),
      ];
      show();
      fireEvent.click(screen.getByRole("button", { name: "New concept" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Connection, side 1"), {
        target: { value: "graph" },
      });
      fireEvent.change(within(dialog).getByLabelText("Entity, side 1"), {
        target: { value: "Person" },
      });
      const labels = (l: string) =>
        [...within(dialog).getByLabelText(l).querySelectorAll("option")].map(
          (o) => o.textContent,
        );
      expect(labels("Entity, side 1")).toContain("Person · Customer");
      expect(labels("Key property, side 1")).toContain("email · Email address");
    });

    it("disables Save, and says why, while two sides are the same", async () => {
      show();
      fireEvent.click(screen.getByRole("button", { name: "New concept" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/^Name/), {
        target: { value: "Customer" },
      });
      const fill = (i: number) => {
        fireEvent.change(
          within(dialog).getByLabelText(`Connection, side ${i}`),
          {
            target: { value: "sql" },
          },
        );
        fireEvent.change(within(dialog).getByLabelText(`Entity, side ${i}`), {
          target: { value: "customers" },
        });
        fireEvent.change(
          within(dialog).getByLabelText(`Key property, side ${i}`),
          { target: { value: "email" } },
        );
      };
      fill(1);
      fireEvent.click(within(dialog).getByRole("button", { name: "Add side" }));
      fill(2);
      const save = within(dialog).getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      expect(within(dialog).getByText(/Two sides are the same/)).toBeTruthy();
      fireEvent.change(within(dialog).getByLabelText("Entity, side 2"), {
        target: { value: "orders" },
      });
      fireEvent.change(within(dialog).getByLabelText("Key property, side 2"), {
        target: { value: "customer_id" },
      });
      expect(save.disabled).toBe(false);
    });
  });
});
