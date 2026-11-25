import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import React from "react";

const mockToast = vi.fn();
vi.mock("@neoboard/components", async (orig) => ({
  ...(await orig<typeof import("@neoboard/components")>()),
  useToast: () => ({ toast: mockToast }),
}));
vi.mock("../../settings-tabs", () => ({
  SettingsTabs: () => <nav aria-label="Settings" />,
}));

import SystemPage from "../page";

const setting = (value: unknown, extra: object = {}) => ({
  value,
  source: "default",
  base: { value, source: "default" },
  updatedBy: null,
  updatedByName: null,
  updatedAt: null,
  ...extra,
});

const DATA = {
  settings: {
    QUERY_MAX_CONCURRENT: setting(10, {
      source: "env",
      value: 20,
      base: { value: 20, source: "env" },
    }),
    QUERY_MAX_PER_USER: setting(5),
    QUERY_MAX_QUEUE_DEPTH: setting(200),
    QUERY_QUEUE_TIMEOUT_MS: setting(30000, {
      source: "database",
      base: { value: 15000, source: "default" },
      updatedByName: "Giulia Bianchi",
      updatedAt: "2026-11-21T10:00:00.000Z",
    }),
    QUERY_SHED_THRESHOLD: setting(0.8),
    REGISTRATION_ENABLED: setting(false),
    LOG_LEVEL: setting("info"),
  },
  sessionMaxAge: { seconds: 28800, source: "env" },
};

const envelope = (data: unknown) => ({
  ok: true,
  json: async () => ({ data, error: null, meta: null }),
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue(envelope(DATA)) as never;
});

async function loaded() {
  render(<SystemPage />);
  await screen.findByRole("form", { name: "Query scheduler" });
}
const section = (name: string) => screen.getByRole("form", { name });
const saveIn = (name: string) =>
  within(section(name)).getByRole("button", { name: "Save" });

describe("System settings page", () => {
  it("shows skeletons while loading, then the values in the units people use", async () => {
    render(<SystemPage />);
    expect(screen.getByTestId("system-loading")).toBeInTheDocument();
    await screen.findByRole("form", { name: "Query scheduler" });
    expect(screen.getByLabelText(/Max concurrent/)).toHaveValue("20");
    // Stored in ms and as a ratio; shown in seconds and percent.
    expect(screen.getByLabelText(/Queue timeout/)).toHaveValue("30");
    expect(screen.getByLabelText(/Shed threshold/)).toHaveValue("80");
  });

  it("tags each row with its source and says who set a value here", async () => {
    await loaded();
    expect(screen.getByText("Set here")).toBeInTheDocument();
    // The Max concurrent row and the read-only session length.
    expect(screen.getAllByText("From env")).toHaveLength(2);
    expect(
      screen.getByText(/Set by Giulia Bianchi on/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("saves a section by sending only the keys that changed, in stored units", async () => {
    await loaded();
    expect(saveIn("Query scheduler")).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Queue timeout/), {
      target: { value: "45" },
    });
    vi.mocked(global.fetch).mockResolvedValueOnce(envelope(DATA) as never);
    fireEvent.click(saveIn("Query scheduler"));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const [url, init] = vi.mocked(global.fetch).mock.calls[1];
    expect(url).toBe("/api/settings");
    expect(JSON.parse(init?.body as string)).toEqual({
      changes: { QUERY_QUEUE_TIMEOUT_MS: 45000 },
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: "Saved: Queue timeout. It applies now.",
    });
  });

  it("refuses an out-of-range value inline and disables only that section's Save", async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/Max concurrent/), {
      target: { value: "150" },
    });
    expect(
      screen.getByText("Enter a number from 1 to 100."),
    ).toBeInTheDocument();
    expect(saveIn("Query scheduler")).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    expect(saveIn("Sign-up")).toBeEnabled();
  });

  it("refuses Max per user above Max concurrent", async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/Max per user/), {
      target: { value: "25" },
    });
    expect(
      screen.getByText("Can't be more than Max concurrent (20)."),
    ).toBeInTheDocument();
  });

  it("Reset names what it returns to and sends null for that key on save", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Use default (15 s)" }));
    expect(screen.getByLabelText(/Queue timeout/)).toHaveValue("15");
    vi.mocked(global.fetch).mockResolvedValueOnce(envelope(DATA) as never);
    fireEvent.click(saveIn("Query scheduler"));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const [, init] = vi.mocked(global.fetch).mock.calls[1];
    expect(JSON.parse(init?.body as string)).toEqual({
      changes: { QUERY_QUEUE_TIMEOUT_MS: null },
    });
  });

  it("always shows the sign-up warning, and opening it sends true", async () => {
    await loaded();
    expect(
      screen.getByText(/anyone who can reach this address can create an/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    vi.mocked(global.fetch).mockResolvedValueOnce(envelope(DATA) as never);
    fireEvent.click(saveIn("Sign-up"));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const [, init] = vi.mocked(global.fetch).mock.calls[1];
    expect(JSON.parse(init?.body as string)).toEqual({
      changes: { REGISTRATION_ENABLED: true },
    });
  });

  it("disables a locked row and says so", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      envelope({
        ...DATA,
        settings: {
          ...DATA.settings,
          QUERY_MAX_CONCURRENT: setting(20, { source: "locked" }),
        },
      }),
    ) as never;
    await loaded();
    expect(screen.getByLabelText(/Max concurrent/)).toBeDisabled();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(
      screen.getByText(/Locked by the deployment/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows the session length read-only with its reason", async () => {
    await loaded();
    expect(screen.getByText("8 hours")).toBeInTheDocument();
    expect(screen.getByText(/can't be changed here/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Session length/)).toBeNull();
  });

  it("a failed load shows an error with Try again", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("down")) as never;
    render(<SystemPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the system settings.");
    vi.mocked(global.fetch).mockResolvedValueOnce(envelope(DATA) as never);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("form", { name: "Query scheduler" });
  });

  it("a 403 says admins only, with no Try again", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        data: null,
        error: { code: "FORBIDDEN", message: "Forbidden" },
        meta: null,
      }),
    }) as never;
    render(<SystemPage />);
    expect(
      await screen.findByText("Only admins can see system settings."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("an untouched row outside the write range does not block Save on another section row", async () => {
    // Env 15.5 s and depth 20000 are legal from env, out of range to type.
    global.fetch = vi.fn().mockResolvedValue(
      envelope({
        ...DATA,
        settings: {
          ...DATA.settings,
          QUERY_QUEUE_TIMEOUT_MS: setting(15500),
          QUERY_MAX_QUEUE_DEPTH: setting(20000),
          QUERY_MAX_CONCURRENT: setting(3),
          QUERY_MAX_PER_USER: setting(5),
        },
      }),
    ) as never;
    await loaded();
    fireEvent.change(screen.getByLabelText(/Shed threshold/), {
      target: { value: "70" },
    });
    expect(saveIn("Query scheduler")).toBeEnabled();
    expect(screen.queryByText(/Enter a number from/)).toBeNull();
  });

  it("editing Max concurrent below the per-user value still asks for a fix", async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/Max concurrent/), {
      target: { value: "2" },
    });
    expect(saveIn("Query scheduler")).toBeDisabled();
  });
  it("Reset to an env value outside the typed rules is still sendable", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      envelope({
        ...DATA,
        settings: {
          ...DATA.settings,
          QUERY_QUEUE_TIMEOUT_MS: setting(30000, {
            source: "database",
            base: { value: 1500, source: "env" },
          }),
        },
      }),
    ) as never;
    await loaded();
    fireEvent.click(
      screen.getByRole("button", { name: "Use env value (1.5 s)" }),
    );
    expect(screen.queryByText("Enter a whole number.")).toBeNull();
    expect(saveIn("Query scheduler")).toBeEnabled();
  });

  it("locks the section's inputs, Reset and Cancel while it saves, so a draft typed meanwhile can't be wiped", async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/Max per user/), {
      target: { value: "4" },
    });
    let finish!: (v: unknown) => void;
    vi.mocked(global.fetch).mockReturnValueOnce(
      new Promise((r) => (finish = r)) as never,
    );
    fireEvent.click(saveIn("Query scheduler"));
    await waitFor(() =>
      expect(screen.getByLabelText(/Max per user/)).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Use default (15 s)" }),
    ).toBeDisabled();
    finish(envelope(DATA));
    await waitFor(() =>
      expect(screen.getByLabelText(/Max per user/)).toBeEnabled(),
    );
  });
});
