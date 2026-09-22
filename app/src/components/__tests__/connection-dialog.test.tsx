import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  fixtureDescriptor,
  FIXTURE_SECRETS,
} from "@/__tests__/fixtures/fixture-connector";

/**
 * The create / edit / Duplicate dialog (#1901), around the generated form.
 * The connector is a fixture nothing in `app/` knows; the hooks are mocked at
 * the network seam, the form and the component library are real.
 */

const createMutate = vi.fn();
const updateMutate = vi.fn();
const testInlineMutate = vi.fn();
const useConnectionConfig = vi.fn();
const connectorsQuery = {
  data: [fixtureDescriptor] as (typeof fixtureDescriptor)[] | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/hooks/use-connections", () => ({
  useCreateConnection: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateConnection: () => ({ mutateAsync: updateMutate, isPending: false }),
  useTestInlineConnection: () => ({
    mutateAsync: testInlineMutate,
    isPending: false,
  }),
  useConnectionConfig: (id: string | undefined) => useConnectionConfig(id),
}));
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => connectorsQuery,
}));

const { ConnectionDialog } = await import("../connection-dialog");

const TYPE = fixtureDescriptor.type;
const byId = (id: string) => document.getElementById(id) as HTMLElement;
const type = (id: string, value: string) =>
  fireEvent.change(byId(id), { target: { value } });
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

const onClose = vi.fn();
const onSaved = vi.fn();
function open(target: React.ComponentProps<typeof ConnectionDialog>["target"]) {
  return render(
    <ConnectionDialog target={target} onClose={onClose} onSaved={onSaved} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  connectorsQuery.data = [fixtureDescriptor];
  connectorsQuery.isLoading = false;
  useConnectionConfig.mockReturnValue({ data: undefined, isLoading: false });
});

describe("ConnectionDialog — create", () => {
  it("starts at the type picker and builds the form of whatever is picked", () => {
    open({ mode: "create" });
    expect(screen.getByText("Choose Connection Type")).toBeVisible();
    fireEvent.click(screen.getByTestId(`pick-${TYPE}`));

    expect(screen.getByText("New Acme Sheets Connection")).toBeVisible();
    expect(byId("conn-endpoint")).toBeInTheDocument();
    // Nothing to pre-fill from.
    expect(useConnectionConfig).toHaveBeenCalledWith(undefined);

    click(/Change type/);
    expect(screen.getByText("Choose Connection Type")).toBeVisible();
  });

  it("shows every problem inline, by the connector's own rules, and saves nothing", () => {
    open({ mode: "create", type: TYPE });
    type("conn-endpoint", "https://host/book");
    click("Create");

    expect(byId("conn-name-error")).toHaveTextContent("Name is required");
    expect(byId("conn-endpoint-error")).toHaveTextContent(/acme:/);
    expect(byId("conn-api-token-error")).toHaveTextContent(
      "API Token is required",
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("creates with a typed config bag and the app's maxRows, then reports the new id", async () => {
    createMutate.mockResolvedValue({ id: "new-1" });
    open({ mode: "create", type: TYPE });
    type("conn-name", "Books");
    type("conn-endpoint", "acme://host/book");
    type("conn-api-token", FIXTURE_SECRETS.apiToken);
    click(/Advanced Settings/);
    type("conn-page-size", "50");
    type("conn-max-rows", "2000");
    click("Create");

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("new-1"));
    expect(createMutate).toHaveBeenCalledExactlyOnceWith({
      name: "Books",
      type: TYPE,
      config: {
        endpoint: "acme://host/book",
        apiToken: FIXTURE_SECRETS.apiToken,
        pageSize: 50,
        maxRows: 2000,
      },
    });
  });

  it("shows the server's message when the save is refused", async () => {
    createMutate.mockRejectedValue(new Error("Page Size must be at most 500"));
    open({ mode: "create", type: TYPE });
    type("conn-name", "Books");
    type("conn-endpoint", "acme://host/book");
    type("conn-api-token", "t");
    click("Create");

    expect(
      await screen.findByText("Page Size must be at most 500"),
    ).toBeVisible();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("tests inline once what the descriptor requires is filled in", async () => {
    testInlineMutate.mockResolvedValue({ success: true });
    open({ mode: "create", type: TYPE });
    const testButton = screen.getByRole("button", { name: "Test Connection" });
    expect(testButton).toBeDisabled();

    type("conn-endpoint", "acme://host/book");
    type("conn-api-token", "t");
    expect(testButton).toBeEnabled();
    fireEvent.click(testButton);

    expect(await screen.findByText("Connection successful!")).toBeVisible();
    expect(testInlineMutate).toHaveBeenCalledExactlyOnceWith({
      type: TYPE,
      config: { endpoint: "acme://host/book", apiToken: "t" },
    });
  });

  it("does not dial with a config its descriptor rejects", () => {
    open({ mode: "create", type: TYPE });
    type("conn-endpoint", "https://host/book");
    type("conn-api-token", "t");
    click("Test Connection");

    expect(byId("conn-endpoint-error")).toHaveTextContent(/acme:/);
    expect(testInlineMutate).not.toHaveBeenCalled();
  });

  it("shows a failed test's error with its hint, and a thrown one as a failure", async () => {
    testInlineMutate.mockResolvedValueOnce({
      success: false,
      error: "The client is unauthorized",
      code: "auth_failed",
    });
    open({ mode: "create", type: TYPE });
    type("conn-endpoint", "acme://host/book");
    type("conn-api-token", "t");
    click("Test Connection");
    expect(await screen.findByText("The client is unauthorized")).toBeVisible();
    expect(screen.getByText(/Check the username and password/)).toBeVisible();

    testInlineMutate.mockRejectedValueOnce(new Error("boom"));
    click("Test Connection");
    expect(await screen.findByText("Connection test failed")).toBeVisible();
  });
});

describe("ConnectionDialog — Duplicate", () => {
  it("pre-fills the copy from the source's redacted config — never a secret", () => {
    useConnectionConfig.mockReturnValue({
      data: { endpoint: "acme://host/book", region: "us", maxRows: 2000 },
      isLoading: false,
    });
    open({
      mode: "create",
      type: TYPE,
      prefillFrom: { id: "c1", name: "Books" },
    });

    expect(useConnectionConfig).toHaveBeenCalledWith("c1");
    expect(byId("conn-name")).toHaveValue("Books (copy)");
    expect(byId("conn-endpoint")).toHaveValue("acme://host/book");
    expect(byId("conn-api-token")).toHaveValue("");
    // A copy is a NEW connection: its secrets are required again.
    expect(
      document.querySelector('label[for="conn-api-token"]'),
    ).toHaveTextContent("*");
  });

  it("waits for the source's config before showing the form", () => {
    useConnectionConfig.mockReturnValue({ data: undefined, isLoading: true });
    open({
      mode: "create",
      type: TYPE,
      prefillFrom: { id: "c1", name: "Books" },
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(byId("conn-name")).toBeNull();
  });
});

describe("ConnectionDialog — edit", () => {
  const target = { mode: "edit", id: "c1", name: "Books", type: TYPE } as const;

  beforeEach(() => {
    useConnectionConfig.mockReturnValue({
      data: { endpoint: "acme://host/book", pageSize: 50 },
      isLoading: false,
    });
  });

  it("opens pre-filled under edit- ids, with no type picker and no inline test", () => {
    open(target);
    expect(screen.getByText("Edit Books")).toBeVisible();
    expect(byId("edit-name")).toHaveValue("Books");
    expect(byId("edit-endpoint")).toHaveValue("acme://host/book");
    expect(byId("edit-page-size")).toHaveValue(50);
    expect(screen.queryByRole("button", { name: /Change type/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Test Connection" }),
    ).toBeNull();
  });

  it("sends no secret it was not given: the server keeps the stored ones", async () => {
    updateMutate.mockResolvedValue({ id: "c1" });
    open(target);
    type("edit-name", "  Library ");
    click("Save");

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("c1"));
    expect(updateMutate).toHaveBeenCalledExactlyOnceWith({
      id: "c1",
      name: "Library",
      config: { endpoint: "acme://host/book", pageSize: 50 },
    });
  });

  it("sends the one secret that was re-entered", async () => {
    updateMutate.mockResolvedValue({ id: "c1" });
    open(target);
    type("edit-signing-secret", "rotated");
    click("Save");

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(updateMutate.mock.calls[0][0].config).toEqual({
      endpoint: "acme://host/book",
      pageSize: 50,
      signingSecret: "rotated",
    });
  });

  it("shows the server's refusal and stays open", async () => {
    updateMutate.mockRejectedValue(
      new Error("Stored credentials could not be decrypted."),
    );
    open(target);
    click("Save");
    expect(
      await screen.findByText("Stored credentials could not be decrypted."),
    ).toBeVisible();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("ConnectionDialog — no descriptor", () => {
  const target = { mode: "edit", id: "c1", name: "Books", type: TYPE } as const;

  it("waits while the connectors load", () => {
    connectorsQuery.data = undefined;
    connectorsQuery.isLoading = true;
    open(target);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("offers a retry when they could not be loaded — there is no form to guess at", () => {
    connectorsQuery.data = undefined;
    open(target);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /settings could not be loaded/,
    );
    click("Try again");
    expect(connectorsQuery.refetch).toHaveBeenCalled();
  });

  it("closes through onClose, and renders nothing without a target", () => {
    const { rerender } = open(target);
    click("Cancel");
    expect(onClose).toHaveBeenCalled();
    rerender(
      <ConnectionDialog target={null} onClose={onClose} onSaved={onSaved} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
