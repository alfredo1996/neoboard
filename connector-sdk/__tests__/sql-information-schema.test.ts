import {
  walkInformationSchema,
  type InformationSchemaColumnRow,
} from "../src/sql";

const row = (
  table_name: string,
  column_name: string,
  data_type = "text",
  is_nullable = "NO",
): InformationSchemaColumnRow => ({
  table_name,
  column_name,
  data_type,
  is_nullable,
});

describe("walkInformationSchema", () => {
  it("groups columns under their table, keeping row order and mapping nullability", async () => {
    const run = jest
      .fn()
      .mockResolvedValue([
        row("users", "id", "integer"),
        row("users", "email", "character varying", "YES"),
        row("posts", "id", "integer"),
      ]);

    await expect(
      walkInformationSchema(run, { schema: "public", dialect: "postgres" }),
    ).resolves.toEqual([
      {
        name: "users",
        columns: [
          { name: "id", type: "integer", nullable: false },
          { name: "email", type: "character varying", nullable: true },
        ],
      },
      {
        name: "posts",
        columns: [{ name: "id", type: "integer", nullable: false }],
      },
    ]);
  });

  it("returns no tables for an empty schema", async () => {
    const run = jest.fn().mockResolvedValue([]);
    await expect(
      walkInformationSchema(run, { schema: "dbo", dialect: "mssql" }),
    ).resolves.toEqual([]);
  });

  it.each([
    ["postgres", "$1"],
    ["mysql", "?"],
    ["mssql", "@p1"],
  ] as const)(
    "binds the schema name as a %s parameter, never into the query text",
    async (dialect, placeholder) => {
      const schema = "x' OR '1'='1";
      const run = jest.fn().mockResolvedValue([]);

      await walkInformationSchema(run, { schema, dialect });

      const [query, values] = run.mock.calls[0];
      expect(values).toEqual([schema]);
      expect(query).toContain(`TABLE_SCHEMA = ${placeholder}`);
      expect(query).not.toContain(schema);
    },
  );

  it("asks for base tables only, ordered by table then column position, under lowercase labels", async () => {
    const run = jest.fn().mockResolvedValue([]);

    await walkInformationSchema(run, { schema: "shop", dialect: "mysql" });

    const [query] = run.mock.calls[0];
    expect(query).toContain("TABLE_TYPE = 'BASE TABLE'");
    expect(query).toMatch(/ORDER BY t\.TABLE_NAME, c\.ORDINAL_POSITION/);
    // MySQL 8 and SQL Server label information_schema columns in upper case
    // unless aliased; the rows are read by these lowercase names.
    for (const label of [
      "table_name",
      "column_name",
      "data_type",
      "is_nullable",
    ]) {
      expect(query).toContain(`AS ${label}`);
    }
  });

  it("propagates the runner's error", async () => {
    const run = jest.fn().mockRejectedValue(new Error("permission denied"));
    await expect(
      walkInformationSchema(run, { schema: "public", dialect: "postgres" }),
    ).rejects.toThrow("permission denied");
  });
});
