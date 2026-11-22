import { EventEmitter } from "events";
import { PostgresSchemaManager } from "../../src/schema/pg-schema";
import { AuthType } from "@neoboard/connector-sdk";

// Mock pg pool. A real EventEmitter, so an 'error' emitted with no listener
// throws exactly as it would on a node-postgres client.
const mockClient = Object.assign(new EventEmitter(), {
  query: jest.fn(),
  release: jest.fn(),
});

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
  end: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../../src/postgresql/PostgresConnectionModule", () => ({
  PostgresConnectionModule: jest.fn().mockImplementation(() => ({
    getPool: () => mockPool,
  })),
}));

const authConfig = {
  uri: "postgresql://localhost:5432/testdb",
  username: "postgres",
  password: "password",
  authType: AuthType.NATIVE,
};

describe("PostgresSchemaManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns tables with columns from the catalog query", async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          table_name: "users",
          column_name: "id",
          data_type: "integer",
          is_nullable: "NO",
        },
        {
          table_name: "users",
          column_name: "email",
          data_type: "character varying",
          is_nullable: "NO",
        },
        {
          table_name: "posts",
          column_name: "id",
          data_type: "integer",
          is_nullable: "NO",
        },
        {
          table_name: "posts",
          column_name: "title",
          data_type: "text",
          is_nullable: "YES",
        },
      ],
    });

    const manager = new PostgresSchemaManager();
    const schema = await manager.fetchSchema(authConfig);

    expect(schema.type).toBe("postgresql");
    expect(schema.tables).toHaveLength(2);

    const usersTable = schema.tables?.find((t) => t.name === "users");
    expect(usersTable).toBeDefined();
    expect(usersTable?.columns).toHaveLength(2);
    expect(usersTable?.columns[0]).toMatchObject({
      name: "id",
      type: "integer",
      nullable: false,
    });
    expect(usersTable?.columns[1]).toMatchObject({
      name: "email",
      type: "character varying",
      nullable: false,
    });
  });

  it("sets nullable=true when is_nullable is YES", async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          table_name: "posts",
          column_name: "title",
          data_type: "text",
          is_nullable: "YES",
        },
      ],
    });

    const manager = new PostgresSchemaManager();
    const schema = await manager.fetchSchema(authConfig);

    expect(schema.tables?.[0]?.columns[0].nullable).toBe(true);
  });

  it("returns empty tables array for empty databases", async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const manager = new PostgresSchemaManager();
    const schema = await manager.fetchSchema(authConfig);

    expect(schema.tables).toEqual([]);
  });

  it("groups columns by table correctly", async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          table_name: "a",
          column_name: "x",
          data_type: "text",
          is_nullable: "NO",
        },
        {
          table_name: "b",
          column_name: "y",
          data_type: "text",
          is_nullable: "NO",
        },
        {
          table_name: "a",
          column_name: "z",
          data_type: "text",
          is_nullable: "NO",
        },
      ],
    });

    const manager = new PostgresSchemaManager();
    const schema = await manager.fetchSchema(authConfig);

    const tableA = schema.tables?.find((t) => t.name === "a");
    expect(tableA?.columns).toHaveLength(2);
    expect(tableA?.columns.map((c) => c.name)).toEqual(["x", "z"]);
  });

  it("releases the client and ends the pool after fetching", async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const manager = new PostgresSchemaManager();
    await manager.fetchSchema(authConfig);

    // one checkout for the columns, one for the keys
    expect(mockClient.release).toHaveBeenCalledTimes(2);
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });

  // #1302: the only pool.connect() in the package with no error guard — and on
  // the one path whose rejection is swallowed (fire-and-forget prefetch).
  it("absorbs an 'error' emitted on a checked-out client mid-query", async () => {
    // The two reads run at once, so each checks out a client of its own, as a
    // real pool hands them out.
    const clients: Array<typeof mockClient> = [];
    const listenersAtRelease: number[] = [];
    mockPool.connect.mockImplementation(async () => {
      const c = Object.assign(new EventEmitter(), {
        query: jest.fn(async () => {
          expect(c.listenerCount("error")).toBe(1);
          c.emit(
            "error",
            Object.assign(new Error("terminating connection"), {
              code: "57P01",
            }),
          );
          return { rows: [] };
        }),
        // Removed BEFORE release, so listeners don't pile up on pooled
        // clients: checked inside release() itself.
        release: jest.fn(() => {
          listenersAtRelease.push(c.listenerCount("error"));
        }),
      });
      clients.push(c);
      return c;
    });

    await expect(
      new PostgresSchemaManager().fetchSchema(authConfig),
    ).resolves.toEqual({ type: "postgresql", tables: [] });

    expect(clients).toHaveLength(2);
    expect(listenersAtRelease).toEqual([0, 0]);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it("bounds the catalog query with a client-side query_timeout", async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await new PostgresSchemaManager().fetchSchema(authConfig);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.objectContaining({ query_timeout: 30_000 }),
    );
  });

  it("uses the config bag's statementTimeout", async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await new PostgresSchemaManager().fetchSchema({
      ...authConfig,
      statementTimeout: 45_000,
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.objectContaining({ query_timeout: 45_000 }),
    );
  });

  it("destroys the client and still ends the pool when the query times out", async () => {
    const timeout = new Error("Query read timeout");
    mockClient.query.mockRejectedValue(timeout);

    await expect(
      new PostgresSchemaManager().fetchSchema(authConfig),
    ).rejects.toBe(timeout);

    expect(mockClient.release).toHaveBeenCalledWith(timeout);
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });
});
