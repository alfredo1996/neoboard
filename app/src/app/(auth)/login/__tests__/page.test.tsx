import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { renderToString } from "react-dom/server";

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@neoboard/components", () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  CardFooter: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  CardHeader: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  CardTitle: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <h2 className={className}>{children}</h2>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  Alert: ({ children }: { children: React.ReactNode; variant?: string }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  LoadingButton: ({
    children,
    loading,
    loadingText,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    loadingText?: string;
  }) => (
    // Mirrors the real LoadingButton: `disabled || loading`.
    <button {...rest} disabled={rest.disabled || loading}>
      {loading ? loadingText : children}
    </button>
  ),
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
}));

/* ---------- import under test ---------- */
import LoginPage from "../page";

/* ---------- helpers ---------- */

// The page is an async server component (#2169): resolve it, then render.
async function renderPage(params: Record<string, string> = {}) {
  return render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

/* ---------- tests ---------- */

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ["true", ["/signup"]],
    [undefined, []],
  ])(
    "decides the Sign up link on the server (REGISTRATION_ENABLED=%s), with no client fetch (#2169)",
    async (env, hrefs) => {
      vi.stubEnv("REGISTRATION_ENABLED", env);
      global.fetch = vi.fn();

      await renderPage();

      const links = screen.queryAllByRole("link", { name: "Sign up" });
      expect(links.map((a) => a.getAttribute("href"))).toEqual(hrefs);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("renders the login form with email and password fields", async () => {
    await renderPage();

    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByText("Sign in")).toBeDefined();
  });

  it("marks the form hydrated so callers can wait for interactivity (#1272)", async () => {
    const { container } = await renderPage();

    // The submit handler only exists after hydration. Before it, a click
    // performs the browser's native GET submit, which puts the password in
    // the URL. The signal lets E2E — and anything else — wait instead of
    // clicking blind and retrying.
    const form = container.querySelector("form");
    expect(form?.getAttribute("data-hydrated")).toBe("true");
  });

  it("keeps the submit button disabled in the server HTML, before hydration attaches the handler (#1272)", async () => {
    // The server HTML has the form since #2169, so a click before hydration
    // runs the native GET submit, which puts the password in the URL.
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    const doc = new DOMParser().parseFromString(
      renderToString(page),
      "text/html",
    );

    expect(doc.querySelector("form")?.getAttribute("data-hydrated")).toBe(
      "false",
    );
    expect(
      doc.querySelector('button[type="submit"]')?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("enables the submit button once hydrated (#1272)", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
  });

  it("renders the NeoBoard title", async () => {
    await renderPage();

    expect(screen.getByText("NeoBoard")).toBeDefined();
  });

  it("shows error message when login fails", async () => {
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });

    const user = userEvent.setup();
    await renderPage();

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitButton = screen.getByText("Sign in");

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "wrongpassword");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeDefined();
    });
  });

  it("takes callbackUrl and passwordChanged from the searchParams (#2169)", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    const user = userEvent.setup();
    await renderPage({ callbackUrl: "/dashboards/abc", passwordChanged: "1" });
    expect(screen.getByText(/Password changed/)).toBeDefined();

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitButton = screen.getByText("Sign in");

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "correctpassword");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboards/abc");
    });
  });
});
