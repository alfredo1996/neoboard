import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTransaction = vi.fn();
const mockDb = { transaction: mockTransaction };

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed-password") } }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

 
function setupTransaction(existingUsers: unknown[]): { txInsert: ReturnType<typeof vi.fn> } {
  const txInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(existingUsers),
      }),
    }),
    insert: txInsert,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
    await fn(tx);
  });
  return { txInsert };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bootstrapAdmin", () => {
  let bootstrapAdmin: (opts: { email: string; password: string }) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));
    const mod = await import("../bootstrap");
    bootstrapAdmin = mod.bootstrapAdmin;
  });

  it("throws when password is shorter than 6 characters", async () => {
    await expect(
      bootstrapAdmin({ email: "admin@example.com", password: "12345" })
    ).rejects.toThrow("BOOTSTRAP_ADMIN_PASSWORD must be at least 6 characters");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("is a no-op when users already exist", async () => {
    const { txInsert } = setupTransaction([{ id: "existing-user" }]);
    await bootstrapAdmin({ email: "admin@example.com", password: "password123" });
    expect(txInsert).not.toHaveBeenCalled();
  });

  it("inserts admin user when table is empty", async () => {
    const { txInsert } = setupTransaction([]);
    await bootstrapAdmin({ email: "admin@example.com", password: "password123" });
    expect(txInsert).toHaveBeenCalledOnce();
    const valuesMock = txInsert.mock.results[0].value as { values: ReturnType<typeof vi.fn> };
    expect(valuesMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@example.com", role: "admin" })
    );
    // Verify the transaction uses serializable isolation to prevent TOCTOU races
    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "serializable" }),
    );
  });
});
