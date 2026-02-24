import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeSelectChain(rows: unknown[]) {
  const c = {
    from: () => c,
    where: () => c,
    limit: () => Promise.resolve(rows),
  };
  return c;
}

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

/** Mocks db.transaction to execute the callback with a fake tx. */
function setupTx(selectResults: unknown[][]) {
  let callCount = 0;
  const txInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  const txSelect = vi.fn(() => {
    const rows = selectResults[callCount++] ?? [];
    const c = { from: () => c, where: () => c, limit: () => Promise.resolve(rows) };
    return c;
  });
  const tx = { select: txSelect, insert: txInsert };
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return { txInsert, txSelect };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("areUsersEmpty", () => {
  let areUsersEmpty: () => Promise<boolean>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));
    const mod = await import("../signup");
    areUsersEmpty = mod.areUsersEmpty;
  });

  it("returns true when no users exist", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    expect(await areUsersEmpty()).toBe(true);
  });

  it("returns false when users exist", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "user-1" }]));
    expect(await areUsersEmpty()).toBe(false);
  });
});

describe("signup", () => {
  let signup: (formData: FormData) => Promise<{ success: boolean; error?: string }>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));
    const mod = await import("../signup");
    signup = mod.signup;
  });

  // Always clean up the bootstrap token env var so a throwing assertion
  // can't leak it to subsequent tests.
  afterEach(() => {
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  });

  it("returns error when name is missing", async () => {
    const res = await signup(makeForm({ name: "", email: "a@b.com", password: "password" }));
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/name/i);
  });

  it("returns error for invalid email", async () => {
    const res = await signup(makeForm({ name: "Alice", email: "not-an-email", password: "password" }));
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/email/i);
  });

  it("returns error for password shorter than 6 characters", async () => {
    const res = await signup(makeForm({ name: "Alice", email: "a@b.com", password: "12345" }));
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/password/i);
  });

  it("requires bootstrap token when DB is empty", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // areUsersEmpty → true
    const res = await signup(makeForm({ name: "Admin", email: "admin@b.com", password: "adminpass" }));
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/bootstrap token/i);
  });

  it("rejects wrong bootstrap token", async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = "correct-secret";
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const form = makeForm({ name: "Admin", email: "admin@b.com", password: "adminpass" });
    form.append("bootstrapToken", "wrong-token");
    const res = await signup(form);
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/bootstrap token/i);
  });

  it("creates first admin when bootstrap token matches", async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = "correct-secret";
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // areUsersEmpty → true
    setupTx([[], []]); // tx: email not taken, admin re-check → still empty
    const form = makeForm({ name: "Admin", email: "admin@b.com", password: "adminpass" });
    form.append("bootstrapToken", "correct-secret");
    const res = await signup(form);
    expect(res.success).toBe(true);
  });

  it("creates creator when DB is non-empty", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "u1" }])); // areUsersEmpty → false
    setupTx([[]]); // tx: email not taken (no admin re-check for creator)
    const res = await signup(makeForm({ name: "Bob", email: "bob@b.com", password: "bobpass" }));
    expect(res.success).toBe(true);
  });

  it("returns error when email is already taken", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "u1" }])); // areUsersEmpty → false
    setupTx([[{ id: "u2" }]]); // tx: email already taken
    const res = await signup(makeForm({ name: "Bob", email: "existing@b.com", password: "bobpass" }));
    expect(res.success).toBe(false);
    expect((res as { error: string }).error).toMatch(/already exists/i);
  });
});
