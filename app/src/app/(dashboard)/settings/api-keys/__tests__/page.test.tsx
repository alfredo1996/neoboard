import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { maskedKey } from "../masked-key";
import type { ApiKeyListItem } from "@/hooks/use-api-keys";

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
  }: {
    title: string;
    actions: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
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
  ConfirmDialog: () => null,
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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
    // The masked cell renders the fallback dash.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
