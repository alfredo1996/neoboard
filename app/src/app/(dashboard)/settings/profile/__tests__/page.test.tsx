import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToast = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue(undefined);

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn() }),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("@neoboard/components", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PanelContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PanelDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PanelHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PanelTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Alert: ({ children }: { children: React.ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LoadingButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    loadingText?: string;
  }) => <button {...props}>{children}</button>,
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
  useToast: () => ({ toast: mockToast }),
}));

const PROFILE = {
  id: "u1",
  name: "Alice",
  email: "alice@example.com",
  role: "admin",
  canWrite: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("../../settings-tabs", () => ({
  SettingsTabs: () => <nav aria-label="Settings" />,
}));

import ProfilePage from "../page";

async function renderLoaded() {
  render(<ProfilePage />);
  await waitFor(() =>
    expect(screen.getByLabelText("Current password")).toBeInTheDocument(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: PROFILE, error: null, meta: null }),
  }) as unknown as typeof fetch;
});

/** The next fetch answers the route's error envelope (#2011). */
function failNextFetch(status: number, code: string, message: string) {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ data: null, error: { code, message }, meta: null }),
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfilePage chrome (#2255)", () => {
  it("keeps the header and tabs while the profile loads", () => {
    global.fetch = vi.fn(
      () => new Promise(() => {}),
    ) as unknown as typeof fetch;
    render(<ProfilePage />);
    expect(
      screen.getByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("shows the role as plain text, not a badge", async () => {
    await renderLoaded();
    const dd = screen.getByText("Role").closest("div")!.querySelector("dd")!;
    expect(dd).toHaveTextContent(/^Admin$/);
    expect(dd.children).toHaveLength(0);
  });
});

describe("ProfilePage password form (#1038)", () => {
  it("sets autocomplete hints on the password inputs", async () => {
    await renderLoaded();
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("disables native validation so errors render inline (noValidate)", async () => {
    await renderLoaded();
    const form = screen
      .getByRole("button", { name: "Change password" })
      .closest("form");
    expect(form).toHaveAttribute("noValidate");
  });

  it("shows a styled inline error for a too-short new password", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "oldpassword" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("New password must be at least 8 characters"),
    ).toBeInTheDocument();
    // It validated client-side and never hit the password endpoint.
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/users/me/password",
      expect.anything(),
    );
  });

  it("does not render a redundant inline success alert (single signal)", async () => {
    await renderLoaded();
    // The removed double-feedback copy must be gone from the component.
    expect(screen.queryByText(/changed successfully/i)).not.toBeInTheDocument();
  });
});

describe("ProfilePage shows the API's error message (#2011)", () => {
  it("renders the envelope's message when the current password is wrong", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "wrongpassword" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpass123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "newpass123" },
    });
    failNextFetch(403, "FORBIDDEN", "Current password is incorrect");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("Current password is incorrect"),
    ).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("puts the envelope's message in the toast when saving the name fails", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Bob" },
    });
    failNextFetch(400, "VALIDATION_ERROR", "Name is required");
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Failed to update name",
          description: "Name is required",
        }),
      ),
    );
  });
});

describe("ProfilePage sections (#2255)", () => {
  it("says who is signed in and lays the page out as Account, Display name, Password", async () => {
    await renderLoaded();
    expect(
      screen.getByText("Signed in as alice@example.com"),
    ).toBeInTheDocument();
    for (const name of ["Account", "Display name", "Password"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    const account = screen.getByRole("region", { name: "Account" });
    for (const label of ["Email", "Role", "Member since"]) {
      expect(account).toHaveTextContent(label);
    }
  });

  it("states the real password policy", async () => {
    await renderLoaded();
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
  });
});
