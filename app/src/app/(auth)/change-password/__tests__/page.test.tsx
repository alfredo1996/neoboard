import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("@neoboard/components", () => {
  const div = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Card: div,
    CardContent: div,
    CardDescription: div,
    CardHeader: div,
    CardTitle: div,
    Alert: ({ children }: { children: React.ReactNode }) => (
      <div role="alert">{children}</div>
    ),
    AlertDescription: div,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} />
    ),
    PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input type="password" {...props} />
    ),
    Label: ({
      children,
      ...props
    }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label {...props}>{children}</label>
    ),
    LoadingButton: ({
      children,
      loading: _loading,
      loadingText: _loadingText,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      loading?: boolean;
      loadingText?: string;
    }) => <button {...props}>{children}</button>,
  };
});

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (o: unknown) => mockSignOut(o) }));

import ChangePasswordPage from "../page";

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("ChangePasswordPage (#2011)", () => {
  it("shows the message from the API's error envelope", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        data: null,
        error: { code: "FORBIDDEN", message: "Current password is incorrect" },
        meta: null,
      }),
    } as Response);
    render(<ChangePasswordPage />);
    fireEvent.change(screen.getByLabelText("Current Password"), {
      target: { value: "wrongpass1" },
    });
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "newpass123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), {
      target: { value: "newpass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Current password is incorrect",
    );
  });
});

// #2160: the change ends every session signed in before it, this one too, so
// the page signs out and says so on the login page, as the profile page does.
it("after a change, signs out and sends the user to sign in again (#2160)", async () => {
  vi.mocked(global.fetch).mockResolvedValue(
    new Response(JSON.stringify({ data: {} }), { status: 200 }),
  );
  const assign = vi.fn();
  vi.stubGlobal("location", {
    set href(v: string) {
      assign(v);
    },
  });
  render(<ChangePasswordPage />);
  fireEvent.change(screen.getByLabelText("Current Password"), {
    target: { value: "oldpass123" },
  });
  fireEvent.change(screen.getByLabelText("New Password"), {
    target: { value: "newSecurePass123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm New Password"), {
    target: { value: "newSecurePass123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
  await vi.waitFor(() =>
    expect(assign).toHaveBeenCalledWith("/login?passwordChanged=1"),
  );
  expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
  vi.unstubAllGlobals();
});
