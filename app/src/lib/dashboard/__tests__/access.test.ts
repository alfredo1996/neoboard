import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mockSelect } }));
vi.mock("@/lib/db/schema", () => ({
  dashboards: {
    id: "id",
    tenantId: "tenant_id",
    userId: "userId",
    isPublic: "isPublic",
  },
  dashboardShares: {
    dashboardId: "dashboardId",
    userId: "userId",
    tenantId: "tenant_id",
    role: "role",
  },
}));

import { resolveDashboardAccess } from "../access";

function chain(rows: unknown[]) {
  const c = {
    from: () => c,
    where: () => c,
    limit: () => Promise.resolve(rows),
  };
  return c;
}

const base = {
  dashboardId: "d1",
  userId: "u1",
  tenantId: "t1",
  required: "viewer" as const,
};

const dash = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  userId: "owner",
  tenantId: "t1",
  isPublic: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDashboardAccess (#979)", () => {
  it("returns null when the dashboard does not exist", async () => {
    mockSelect.mockReturnValueOnce(chain([]));
    const res = await resolveDashboardAccess({ ...base, userRole: "creator" });
    expect(res).toBeNull();
  });

  it("admins bypass the ACL with role 'admin'", async () => {
    mockSelect.mockReturnValueOnce(chain([dash()]));
    const res = await resolveDashboardAccess({ ...base, userRole: "admin" });
    expect(res?.role).toBe("admin");
  });

  it("owner gets role 'owner' without a share lookup", async () => {
    mockSelect.mockReturnValueOnce(chain([dash({ userId: "u1" })]));
    const res = await resolveDashboardAccess({ ...base, userRole: "creator" });
    expect(res?.role).toBe("owner");
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("editor share satisfies a viewer requirement", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash()]))
      .mockReturnValueOnce(chain([{ role: "editor" }]));
    const res = await resolveDashboardAccess({ ...base, userRole: "creator" });
    expect(res?.role).toBe("editor");
  });

  it("viewer share does NOT satisfy an editor requirement", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash()]))
      .mockReturnValueOnce(chain([{ role: "viewer" }]));
    const res = await resolveDashboardAccess({
      ...base,
      required: "editor",
      userRole: "creator",
    });
    expect(res).toBeNull();
  });

  it("a share never satisfies an owner requirement", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash()]))
      .mockReturnValueOnce(chain([{ role: "editor" }]));
    const res = await resolveDashboardAccess({
      ...base,
      required: "owner",
      userRole: "creator",
    });
    expect(res).toBeNull();
  });

  it("public dashboards grant viewer to any tenant user", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash({ isPublic: true })]))
      .mockReturnValueOnce(chain([]));
    const res = await resolveDashboardAccess({ ...base, userRole: "reader" });
    expect(res?.role).toBe("viewer");
  });

  it("public dashboards do NOT grant editor access", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash({ isPublic: true })]))
      .mockReturnValueOnce(chain([]));
    const res = await resolveDashboardAccess({
      ...base,
      required: "editor",
      userRole: "reader",
    });
    expect(res).toBeNull();
  });

  it("non-shared private dashboard returns null for a non-owner", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash()]))
      .mockReturnValueOnce(chain([]));
    const res = await resolveDashboardAccess({ ...base, userRole: "creator" });
    expect(res).toBeNull();
  });
});

describe("resolveDashboardAccess allowPublic=false (#979 — duplicate semantics)", () => {
  it("public dashboard does NOT grant access when allowPublic is false", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash({ isPublic: true })]))
      .mockReturnValueOnce(chain([]));
    const res = await resolveDashboardAccess({
      ...base,
      userRole: "creator",
      allowPublic: false,
    });
    expect(res).toBeNull();
  });

  it("a real share still grants access with allowPublic false", async () => {
    mockSelect
      .mockReturnValueOnce(chain([dash({ isPublic: true })]))
      .mockReturnValueOnce(chain([{ role: "viewer" }]));
    const res = await resolveDashboardAccess({
      ...base,
      userRole: "creator",
      allowPublic: false,
    });
    expect(res?.role).toBe("viewer");
  });
});
