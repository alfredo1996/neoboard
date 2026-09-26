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
