import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseSsoProviders = vi.fn();
const mockCreateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/hooks/use-sso-providers", () => ({
  useSsoProviders: () => mockUseSsoProviders(),
  useCreateSsoProvider: () => ({
    mutateAsync: mockCreateMutate,
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useDeleteSsoProvider: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}));

// FeatureGate: default to rendering children (feature enabled). Override
// `mockSsoEnabled = false` to test the disabled path.
let mockSsoEnabled: boolean | undefined = true;
vi.mock("@/components/feature-gate", () => ({
  FeatureGate: ({
    children,
    fallback,
  }: {
    feature: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
  }) => {
    if (mockSsoEnabled === true) return <>{children}</>;
    return <>{fallback ?? null}</>;
  },
}));

vi.mock("@/components/enterprise-required-empty-state", () => ({
  EnterpriseRequiredEmptyState: ({ feature }: { feature: string }) => (
    <div data-testid="enterprise-required" data-feature={feature}>
      Enterprise feature required: {feature}
    </div>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings/authentication",
}));

vi.mock("@neoboard/components", () => ({
  PageHeader: ({
    title,
    description,
    actions,
  }: {
    title: string;
    description: string;
    actions: React.ReactNode;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
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
  Badge: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
  }) => <span data-variant={variant}>{children}</span>,
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      {checked ? "On" : "Off"}
    </button>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  EmptyState: ({
    title,
    description,
    action,
  }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    action: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
      {action}
    </div>
  ),
  ConfirmDialog: ({
    open,
    onConfirm,
    title,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    description: string;
    confirmText: string;
    variant: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{title}</p>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} type="password" />
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthenticationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSsoEnabled = true;
  });

  it("renders enterprise-required empty state on community edition", async () => {
    mockSsoEnabled = false;
    mockUseSsoProviders.mockReturnValue({ data: undefined, isLoading: false });

    const { default: Page } = await import("../page");
    render(<Page />);

    expect(screen.getByTestId("enterprise-required")).toBeInTheDocument();
    expect(screen.getByTestId("enterprise-required")).toHaveAttribute(
      "data-feature",
      "sso",
    );
    // The community page must NOT render the SSO management UI
    expect(screen.queryByText("Add SSO Provider")).not.toBeInTheDocument();
  });

  it("shows loading spinner when fetching", async () => {
    mockUseSsoProviders.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { default: Page } = await import("../page");
    render(<Page />);

    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("shows empty state when no providers", async () => {
    mockUseSsoProviders.mockReturnValue({
      data: [],
      isLoading: false,
    });

    const { default: Page } = await import("../page");
    render(<Page />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No SSO providers")).toBeInTheDocument();
  });

  it("renders provider list when providers exist", async () => {
    mockUseSsoProviders.mockReturnValue({
      data: [
        {
          id: "sso-1",
          name: "Company SSO",
          protocol: "oidc",
          issuer: "https://idp.example.com",
          clientId: "c",
          scopes: "openid",
          claimMappings: null,
          autoProvision: true,
          defaultRole: "creator",
          enforceSso: false,
          enabled: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      isLoading: false,
    });

    const { default: Page } = await import("../page");
    render(<Page />);

    expect(screen.getByText("Company SSO")).toBeInTheDocument();
    expect(screen.getByText("https://idp.example.com")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("creator")).toBeInTheDocument();
  });

  it("opens add dialog when Add Provider is clicked", async () => {
    mockUseSsoProviders.mockReturnValue({ data: [], isLoading: false });

    const { default: Page } = await import("../page");
    render(<Page />);

    const user = userEvent.setup();
    const addButtons = screen.getAllByText("Add Provider");
    await user.click(addButtons[0]);

    expect(screen.getByText("Add SSO Provider")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://idp.example.com"),
    ).toBeInTheDocument();
  });

  it("shows delete confirmation when trash icon clicked", async () => {
    mockUseSsoProviders.mockReturnValue({
      data: [
        {
          id: "sso-1",
          name: "Test Provider",
          protocol: "oidc",
          issuer: "https://test.com",
          clientId: "c",
          scopes: "openid",
          claimMappings: null,
          autoProvision: true,
          defaultRole: "creator",
          enforceSso: false,
          enabled: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      isLoading: false,
    });

    const { default: Page } = await import("../page");
    render(<Page />);

    const user = userEvent.setup();
    const deleteBtn = screen.getByLabelText("Delete Test Provider");
    await user.click(deleteBtn);

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete SSO Provider")).toBeInTheDocument();
  });

  it("shows Disabled badge for disabled providers", async () => {
    mockUseSsoProviders.mockReturnValue({
      data: [
        {
          id: "sso-2",
          name: "Disabled Provider",
          protocol: "oidc",
          issuer: "https://disabled.com",
          clientId: "c",
          scopes: "openid",
          claimMappings: null,
          autoProvision: true,
          defaultRole: "reader",
          enforceSso: false,
          enabled: false,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      isLoading: false,
    });

    const { default: Page } = await import("../page");
    render(<Page />);

    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("reader")).toBeInTheDocument();
  });
});
