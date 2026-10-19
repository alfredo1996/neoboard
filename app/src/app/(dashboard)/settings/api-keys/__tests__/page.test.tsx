import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { maskedKey } from "../masked-key";
import type { ApiKeyListItem } from "@/hooks/use-api-keys";
import { MockDialogContent } from "@/__tests__/helpers/dialog-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockKeys: ApiKeyListItem[] = [];

vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: mockKeys, isLoading: false }),
  useCreateApiKey: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useRevokeApiKey: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("lucide-react", () => {
  const Icon = () => <span />;
  return {
    Plus: Icon,
    MoreHorizontal: Icon,
    Copy: Icon,
    Check: Icon,
    Key: Icon,
  };
});

vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  // The menu is always open here.
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: () => null,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
  // What the real one finds: the row's "Key actions" button.
  focusedMenuTrigger: () => menuTrigger,
  TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
  // Hands focus back after the render that closes it, as Radix does.
  ConfirmDialog: function ConfirmDialog({
    open,
    onOpenChange,
    onConfirm,
    confirmText,
    returnFocusTo,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    confirmText: string;
    returnFocusTo?: HTMLElement | null;
  }) {
    const wasOpen = React.useRef(open);
    React.useEffect(() => {
      if (wasOpen.current && !open) returnFocusTo?.focus();
      wasOpen.current = open;
    });
    return open ? (
      <>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmText}
        </button>
      </>
    ) : null;
  },
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: MockDialogContent,
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("../../settings-tabs", () => ({
  SettingsTabs: () => <nav aria-label="Settings" />,
}));

import ApiKeysPage from "../page";

const menuTrigger = document.body.appendChild(document.createElement("button"));

function makeKey(over: Partial<ApiKeyListItem>): ApiKeyListItem {
  return {
    id: "k1",
    name: "CI Key",
    keyPrefix: "nb_1a2b3c4d",
    lastUsedAt: null,
    expiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("maskedKey (#1038)", () => {
  it("masks a present prefix without exposing the full secret", () => {
    expect(maskedKey("nb_1a2b3c4d")).toBe("nb_1a2b3c4d…****");
  });

  it("falls back to an em dash when no prefix is stored (pre-#1038 keys)", () => {
    expect(maskedKey(null)).toBe("—");
  });
});

describe("ApiKeysPage Key column (#1038)", () => {
  it("renders a Key header and the masked prefix cell", () => {
    mockKeys = [makeKey({ keyPrefix: "nb_1a2b3c4d" })];
    render(<ApiKeysPage />);
    for (const name of ["Name", "Key", "Created", "Expires"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("nb_1a2b3c4d…****")).toBeInTheDocument();
  });

  it("shows an em dash for a key with no stored prefix", () => {
    mockKeys = [makeKey({ keyPrefix: null, name: "Legacy Key" })];
    render(<ApiKeysPage />);
    expect(screen.getByText("Legacy Key")).toBeInTheDocument();
    // Scope to the Legacy Key row so the dash proves the Key-cell fallback
    // specifically (date columns also render "—").
    const legacyRow = screen.getByRole("row", { name: /Legacy Key/i });
    expect(legacyRow).toHaveTextContent("—");
  });
});

describe("ApiKeysPage rows", () => {
  it("says when a key was last used under its name, or that it never was", () => {
    mockKeys = [
      makeKey({
        id: "k1",
        name: "Used Key",
        lastUsedAt: "2026-01-02T00:00:00.000Z",
      }),
      makeKey({ id: "k2", name: "Fresh Key", lastUsedAt: null }),
    ];
    render(<ApiKeysPage />);
    const used = screen.getByRole("row", { name: /Used Key/ });
    const fresh = screen.getByRole("row", { name: /Fresh Key/ });
    // The row shows lastUsedAt, not createdAt (2026-01-01).
    expect(used).toHaveTextContent("Last used 2026-01-02T00:00:00.000Z");
    expect(fresh).toHaveTextContent("Never used");
  });

  it("shows the expiry, or a dash for a key that does not expire", () => {
    mockKeys = [
      makeKey({
        id: "k1",
        name: "Expiring",
        // Local time (no Z): the short date is the same in every timezone.
        expiresAt: "2099-03-04T12:00:00",
      }),
      makeKey({ id: "k2", name: "Forever", expiresAt: null }),
    ];
    render(<ApiKeysPage />);
    expect(screen.getByRole("row", { name: /Expiring/ })).toHaveTextContent(
      "Mar 4, 2099",
    );
    expect(screen.getByRole("row", { name: /Forever/ })).toHaveTextContent("—");
  });

  it("the Settings crumb navigates client-side instead of reloading", () => {
    mockKeys = [];
    render(<ApiKeysPage />);
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(mockPush).toHaveBeenCalledWith("/settings/profile");
  });

  it("renders the settings tabs", () => {
    mockKeys = [];
    render(<ApiKeysPage />);
    expect(
      screen.getByRole("navigation", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state and a meta without a count when there are no keys", () => {
    mockKeys = [];
    render(<ApiKeysPage />);
    expect(screen.getByText("No API keys")).toBeInTheDocument();
    expect(
      screen.getByText("Programmatic access to this workspace"),
    ).toBeInTheDocument();
  });

  it("counts the keys in the page meta", () => {
    mockKeys = [makeKey({ id: "k1" }), makeKey({ id: "k2", name: "B" })];
    render(<ApiKeysPage />);
    expect(
      screen.getByText("Programmatic access to this workspace · 2 keys"),
    ).toBeInTheDocument();
  });
});

describe("ApiKeysPage Revoke (#2086)", () => {
  it("Cancel puts focus back on the row's menu button", () => {
    mockKeys = [makeKey({})];
    render(<ApiKeysPage />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(menuTrigger).toHaveFocus();
  });

  it("a confirmed Revoke puts focus on the page heading: the row is leaving", () => {
    mockKeys = [makeKey({})];
    render(<ApiKeysPage />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(screen.getByRole("heading", { name: "API keys" })).toHaveFocus();
  });
});

// #2146: Create API key has no Trigger either.
it("Cancel on Create API key puts focus back on its button (#2146)", () => {
  mockKeys = [makeKey({})];
  render(<ApiKeysPage />);
  const create = screen.getByRole("button", { name: "Create API key" });

  fireEvent.click(create);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(create).toHaveFocus();
});
