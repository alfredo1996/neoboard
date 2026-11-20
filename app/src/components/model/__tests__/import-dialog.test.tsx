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

const PREVIEW = {
  terms: { new: 2, changed: 1, unchanged: 0, orphaned: 1, skipped: 3 },
  concepts: {
    new: 1,
    changed: 0,
    unchanged: 0,
    orphaned: 0,
    skipped: 1,
    skippedSides: 1,
  },
  items: [
    {
      id: "c",
      kind: "concept",
      label: "Customer",
      status: "new",
      orphaned: false,
    },
    {
      id: "t",
      kind: "term",
      label: "Warehouse: property Person.name",
      status: "new",
      orphaned: true,
    },
  ],
  skipped: [
    { kind: "concept", label: "Vendor" },
    { kind: "side", label: "Customer: orders.id on Elsewhere" },
  ],
};

describe("ImportDialog", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });
  const open = (onOpenChange = vi.fn()) =>
    render(
      <ImportDialog open onOpenChange={onOpenChange} connections={local} />,
    );
  const toPreview = async () => {
    mutateAsync.mockResolvedValue({ applied: false, preview: PREVIEW });
    open();
    await upload(fileText);
    await screen.findByLabelText("Warehouse");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    return screen.findByTestId("import-counts");
  };

  it("prefills by name: a match is paired, the rest are marked Skip", async () => {
    open();
    await upload(fileText);
    expect(await screen.findByLabelText("Warehouse")).toBeTruthy();
    expect(screen.queryByLabelText("Elsewhere")).toBeNull();
    const skip = (n: string) =>
      screen.getByRole("checkbox", { name: `Skip ${n}` });
    expect(skip("Warehouse").getAttribute("aria-checked")).toBe("false");
    expect(skip("Elsewhere").getAttribute("aria-checked")).toBe("true");
  });

  it("checking Skip on a paired connection leaves it out of the mapping", async () => {
    mutateAsync.mockResolvedValue({ applied: false, preview: PREVIEW });
    open();
    await upload(fileText);
    await screen.findByLabelText("Warehouse");
    fireEvent.click(screen.getByRole("checkbox", { name: "Skip Warehouse" }));
    expect(screen.queryByLabelText("Warehouse")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ connectionMapping: {} }),
      ),
    );
  });

  it("sends the mapping without the skipped connection, then shows the counts, the skipped list and a wrapping, tagged orphan", async () => {
    const counts = await toPreview();
    expect(mutateAsync).toHaveBeenCalledWith({
      payload: JSON.parse(fileText),
      connectionMapping: { f1: "l2" },
      apply: false,
    });
    const text = (label: string) =>
      within(counts).getByText(label).nextElementSibling?.textContent;
    expect(text("New")).toBe("3");
    expect(text("Changed")).toBe("1");
    expect(text("No longer in the database")).toBe("1");
    // concepts skipped once, sides once, terms once: 3 + 1 + 1
    expect(text("Skipped")).toBe("5");
    const label = screen.getByText("Warehouse: property Person.name");
    expect(label.className).not.toContain("truncate");
    expect(label.nextElementSibling?.textContent).toBe(
      "no longer in the database",
    );
    const skipped = within(screen.getByTestId("import-skipped"));
    expect(skipped.getByText("Vendor")).toBeTruthy();
    expect(skipped.getByText("Customer: orders.id on Elsewhere")).toBeTruthy();
  });

  it("Back returns to the pairing without sending", async () => {
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Warehouse")).toBeTruthy();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("Confirm applies, toasts and closes", async () => {
    const onOpenChange = vi.fn();
    mutateAsync.mockResolvedValue({ applied: false, preview: PREVIEW });
    open(onOpenChange);
    await upload(fileText);
    await screen.findByLabelText("Warehouse");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTestId("import-counts");
    mutateAsync.mockResolvedValue({ applied: true, preview: PREVIEW });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ apply: true }),
    );
  });

  it("shows the server's message when the import fails", async () => {
    mutateAsync.mockRejectedValue(new Error("You cannot use every connection"));
    open();
    await upload(fileText);
    await screen.findByLabelText("Warehouse");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "cannot use every connection",
      ),
    );
  });

  it.each([
    [
      "a file over 10 MB",
      () => {
        const f = new File(["{}"], "big.json");
        Object.defineProperty(f, "size", { value: 10 * 1024 * 1024 + 1 });
        return f;
      },
      "larger than 10 MB",
    ],
    [
      "invalid JSON",
      () => {
        const f = new File(["{nope"], "bad.json");
        Object.defineProperty(f, "text", { value: async () => "{nope" });
        return f;
      },
      "not valid JSON",
    ],
  ])("refuses %s, naming why", async (_n, make, why) => {
    open();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [make()] } });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(why),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
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
