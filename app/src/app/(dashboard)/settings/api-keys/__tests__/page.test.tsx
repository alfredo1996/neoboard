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
  return { Plus: Icon, Trash2: Icon, Copy: Icon, Check: Icon, Key: Icon };
});

vi.mock("@neoboard/components", () => ({
  PageHeader: ({
    title,
    actions,
    titleRef,
  }: {
    title: string;
    actions: React.ReactNode;
    titleRef?: React.Ref<HTMLHeadingElement>;
  }) => (
    <div>
      <h1 ref={titleRef} tabIndex={-1}>
        {title}
      </h1>
      {actions}
    </div>
  ),
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

import ApiKeysPage from "../page";

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
    expect(
      screen.getByRole("columnheader", { name: "Key" }),
    ).toBeInTheDocument();
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

describe("ApiKeysPage Revoke (#2086)", () => {
  it("Cancel puts focus back on the row's Revoke button", () => {
    mockKeys = [makeKey({})];
    render(<ApiKeysPage />);
    const revoke = screen.getByRole("button", { name: "Revoke CI Key" });

    fireEvent.click(revoke);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(revoke).toHaveFocus();
  });

  it("a confirmed Revoke puts focus on the page heading: the row is leaving", () => {
    mockKeys = [makeKey({})];
    render(<ApiKeysPage />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke CI Key" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(screen.getByRole("heading", { name: "API Keys" })).toHaveFocus();
  });
});

// #2146: Create API Key has no Trigger either.
it("Cancel on Create API Key puts focus back on its button (#2146)", () => {
  mockKeys = [makeKey({})];
  render(<ApiKeysPage />);
  const create = screen.getByRole("button", { name: "Create API Key" });

  fireEvent.click(create);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(create).toHaveFocus();
});
