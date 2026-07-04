import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockSignIn = vi.fn();
const mockSignup = vi.fn();

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

vi.mock("@/lib/auth/signup", () => ({
  signup: (...args: unknown[]) => mockSignup(...args),
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
  Alert: ({
    children,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => <div role="alert">{children}</div>,
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
import SignupPage from "../page";

/* ---------- helpers ---------- */

function mockFetchBootstrapStatus(
  bootstrapRequired: boolean,
  registrationEnabled: boolean,
) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () =>
      Promise.resolve({
        data: { bootstrapRequired, registrationEnabled },
      }),
  });
}

/* ---------- tests ---------- */

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----- Registration disabled -----

  it("shows 'Registration Disabled' when registration is disabled and bootstrap is not required", async () => {
    mockFetchBootstrapStatus(false, false);

    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("Registration Disabled")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Self-registration is disabled. Contact your administrator for an account.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Back to sign in")).toBeDefined();
    expect(screen.getByText("Back to sign in").closest("a")).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("does not show the signup form when registration is disabled", async () => {
    mockFetchBootstrapStatus(false, false);

    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("Registration Disabled")).toBeDefined();
    });

    // Form fields should not be present
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  // ----- Bootstrap mode (first admin setup) -----

  it("shows bootstrap form even when registration is disabled (bootstrapRequired overrides)", async () => {
    mockFetchBootstrapStatus(true, false);

    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("First Admin Setup")).toBeDefined();
    });

    expect(screen.getByText(/No users exist yet/)).toBeDefined();
    expect(screen.getByLabelText("Bootstrap Token")).toBeDefined();
    expect(screen.getByText("Create Admin Account")).toBeDefined();
  });

  it("shows bootstrap token field when bootstrapRequired is true", async () => {
    mockFetchBootstrapStatus(true, true);

    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("First Admin Setup")).toBeDefined();
    });

    expect(screen.getByLabelText("Bootstrap Token")).toBeDefined();
  });

  // ----- Normal registration -----

  it("shows normal signup form when registration is enabled and bootstrap is not required", async () => {
    mockFetchBootstrapStatus(false, true);

    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("Create your account")).toBeDefined();
    });

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByLabelText("Confirm Password")).toBeDefined();
    expect(screen.queryByLabelText("Bootstrap Token")).toBeNull();
    expect(screen.getByText("Create account")).toBeDefined();
  });

  it("shows 'Already have an account?' link in normal mode", async () => {
    mockFetchBootstrapStatus(false, true);

    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText("Sign in")).toBeDefined();
    });

    expect(screen.getByText("Sign in").closest("a")).toHaveAttribute(
      "href",
      "/login",
    );
  });

  // ----- Form validation -----

  it("shows error when passwords do not match", async () => {
    mockFetchBootstrapStatus(false, true);

    const user = userEvent.setup();
    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeDefined();
    });

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm Password"), "different456");
    await user.click(screen.getByText("Create account"));

    // findByRole("alert") with a generous timeout: the error renders inside
    // an Alert, and under CI parallel load the default 1s waitFor poll can
    // exhaust before React flushes the submit state (#1168 residual race).
    const alert = await screen.findByRole("alert", {}, { timeout: 10_000 });
    expect(alert.textContent).toContain("Passwords do not match");
  });

  it("shows error from signup server action", async () => {
    mockFetchBootstrapStatus(false, true);
    mockSignup.mockResolvedValue({
      success: false,
      error: "Email already registered",
    });

    const user = userEvent.setup();
    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeDefined();
    });

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByText("Create account"));

    await waitFor(() => {
      expect(screen.getByText("Email already registered")).toBeDefined();
    });
  });

  it("redirects to / after successful signup and auto-login", async () => {
    mockFetchBootstrapStatus(false, true);
    mockSignup.mockResolvedValue({ success: true });
    mockSignIn.mockResolvedValue({ error: null });

    const user = userEvent.setup();
    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeDefined();
    });

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByText("Create account"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("redirects to /login when auto-login fails after signup", async () => {
    mockFetchBootstrapStatus(false, true);
    mockSignup.mockResolvedValue({ success: true });
    mockSignIn.mockResolvedValue({ error: "some-error" });

    const user = userEvent.setup();
    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeDefined();
    });

    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByText("Create account"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  // ----- Default state -----

  it("shows a loading state until the status fetch settles, then the title", async () => {
    // Pending fetch → the page holds a loading spinner instead of flashing the
    // form with default state (#1168).
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<SignupPage />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeDefined();
    expect(screen.queryByText("NeoBoard")).toBeNull();

    // Resolve the status → the page renders (NeoBoard title present).
    resolve({
      json: () =>
        Promise.resolve({
          data: { bootstrapRequired: false, registrationEnabled: true },
        }),
    });
    expect(await screen.findByText("NeoBoard")).toBeDefined();
  });
});
