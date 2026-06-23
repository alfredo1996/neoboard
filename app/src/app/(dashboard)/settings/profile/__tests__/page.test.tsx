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
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
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

import ProfilePage from "../page";

async function renderLoaded() {
  render(<ProfilePage />);
  await waitFor(() =>
    expect(screen.getByLabelText("Current Password")).toBeInTheDocument(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: PROFILE }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfilePage password form (#1038)", () => {
  it("sets autocomplete hints on the password inputs", async () => {
    await renderLoaded();
    expect(screen.getByLabelText("Current Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("New Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm New Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("disables native validation so errors render inline (noValidate)", async () => {
    await renderLoaded();
    const form = screen
      .getByRole("button", { name: "Change Password" })
      .closest("form");
    expect(form).toHaveAttribute("noValidate");
  });

  it("shows a styled inline error for a too-short new password", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Current Password"), {
      target: { value: "oldpassword" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

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
