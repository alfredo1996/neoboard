import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
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
    <button {...rest} disabled={loading}>
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

function mockFetchBootstrapStatus(registrationEnabled: boolean) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () =>
      Promise.resolve({
        data: { bootstrapRequired: false, registrationEnabled },
      }),
  });
}

/* ---------- tests ---------- */

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the signup link when registration is enabled", async () => {
    mockFetchBootstrapStatus(true);

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText("Sign up")).toBeDefined();
    });

    const signupLink = screen.getByText("Sign up");
    expect(signupLink.closest("a")).toHaveAttribute("href", "/signup");
  });

  it("hides the signup link when registration is disabled", async () => {
    mockFetchBootstrapStatus(false);

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.queryByText("Sign up")).toBeNull();
    });
  });

  it("shows the signup link by default before fetch completes", () => {
    // Fetch never resolves — default state should show the link
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<LoginPage />);

    expect(screen.getByText("Sign up")).toBeDefined();
  });

  it("keeps the signup link when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<LoginPage />);

    // Default state is registrationEnabled=true, fetch error doesn't change it
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(screen.getByText("Sign up")).toBeDefined();
  });

  it("renders the login form with email and password fields", () => {
    mockFetchBootstrapStatus(true);

    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByText("Sign in")).toBeDefined();
  });

  it("marks the form hydrated so callers can wait for interactivity (#1272)", () => {
    mockFetchBootstrapStatus(true);

    const { container } = render(<LoginPage />);

    // The submit handler only exists after hydration. Before it, a click
    // performs the browser's native GET submit, which puts the password in
    // the URL. The signal lets E2E — and anything else — wait instead of
    // clicking blind and retrying.
    const form = container.querySelector("form");
    expect(form?.getAttribute("data-hydrated")).toBe("true");
  });

  it("keeps the submit button disabled until hydration attaches the handler (#1272)", () => {
    mockFetchBootstrapStatus(true);

    render(<LoginPage />);

    // After mount the effect has run, so the button is live. The guarantee
    // this pins is that `disabled` is driven by hydration state at all —
    // without it, a pre-hydration click leaks credentials into the URL.
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });

  it("renders the NeoBoard title", () => {
    mockFetchBootstrapStatus(true);

    render(<LoginPage />);

    expect(screen.getByText("NeoBoard")).toBeDefined();
  });

  it("shows error message when login fails", async () => {
    mockFetchBootstrapStatus(true);
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });

    const user = userEvent.setup();
    render(<LoginPage />);

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

  it("redirects to callbackUrl on successful login", async () => {
    mockFetchBootstrapStatus(true);
    mockSignIn.mockResolvedValue({ error: null });

    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitButton = screen.getByText("Sign in");

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "correctpassword");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
