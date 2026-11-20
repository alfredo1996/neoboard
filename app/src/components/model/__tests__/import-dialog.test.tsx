import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ImportDialog, prefillMapping } from "../import-dialog";

const mutateAsync = vi.fn();
vi.mock("@/hooks/use-ontology-transfer", () => ({
  useImportOntology: () => ({
    mutateAsync,
    isPending: false,
    reset: vi.fn(),
  }),
}));

const local = [
  { id: "l1", name: "Graph" },
  { id: "l2", name: "Warehouse" },
];
const fileText = JSON.stringify({
  format: "neoboard-ontology",
  version: 1,
  connections: [
    { id: "f1", name: "Warehouse", terms: [] },
    { id: "f2", name: "Elsewhere", terms: [] },
  ],
  concepts: [],
});

const upload = async (text: string) => {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([text], "model.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => text });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("prefillMapping", () => {
  it("pairs by name and leaves the rest unpaired", () => {
    expect(
      prefillMapping(
        [
          { id: "f1", name: "Warehouse" },
          { id: "f2", name: "Elsewhere" },
        ],
        local,
      ),
    ).toEqual({ f1: "l2", f2: "" });
  });
});

describe("ImportDialog", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });
  const open = () =>
    render(<ImportDialog open onOpenChange={vi.fn()} connections={local} />);

  it("prefills each connection's choice by name", async () => {
    open();
    await upload(fileText);
    const warehouse = (await screen.findByLabelText(
      "Warehouse",
    )) as HTMLSelectElement;
    expect(warehouse.value).toBe("l2");
    expect(
      (screen.getByLabelText("Elsewhere") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("sends the mapping without the skipped connection, then shows the preview counts", async () => {
    mutateAsync.mockResolvedValue({
      applied: false,
      preview: {
        terms: { new: 2, changed: 1, unchanged: 0, orphaned: 1, skipped: 3 },
        concepts: {
          new: 1,
          changed: 0,
          unchanged: 0,
          orphaned: 0,
          skipped: 0,
          skippedSides: 1,
        },
        items: [
          {
            kind: "concept",
            label: "Customer",
            status: "new",
            orphaned: false,
          },
        ],
      },
    });
    open();
    await upload(fileText);
    await screen.findByLabelText("Warehouse");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const counts = await screen.findByTestId("import-counts");
    expect(mutateAsync).toHaveBeenCalledWith({
      payload: JSON.parse(fileText),
      connectionMapping: { f1: "l2" },
      apply: false,
    });
    const text = (label: string) =>
      within(counts).getByText(label).previousElementSibling?.textContent;
    expect(text("New")).toBe("3");
    expect(text("Changed")).toBe("1");
    expect(text("No longer in the database")).toBe("1");
    expect(text("Skipped")).toBe("4");
    expect(screen.getByText("Customer")).toBeTruthy();
  });

  it("refuses a file that is not an ontology file, naming why", async () => {
    open();
    await upload(JSON.stringify({ format: "other" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "not a NeoBoard ontology file",
      ),
    );
  });
});
